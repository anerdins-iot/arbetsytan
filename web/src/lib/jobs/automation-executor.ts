/**
 * Automation executor job.
 * Processes pending/active automations whose triggerAt has passed.
 * Runs the specified tool and updates the automation status.
 */

import { CronExpressionParser } from "cron-parser";
import { prisma, tenantDb } from "@/lib/db";
import { executeTool } from "@/lib/ai/tool-executors";

export type AutomationExecutorResult = {
  processed: number;
  succeeded: number;
  failed: number;
};

export async function runAutomationExecutorJob(): Promise<AutomationExecutorResult> {
  const now = new Date();
  const tenants = await prisma.tenant.findMany({
    select: { id: true },
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const tenant of tenants) {
    const db = tenantDb(tenant.id);
    const automations = await db.automation.findMany({
      where: {
        triggerAt: { lte: now },
        status: { in: ["PENDING", "ACTIVE"] },
      },
      select: {
        id: true,
        name: true,
        recurrence: true,
        timezone: true,
        actionTool: true,
        actionParams: true,
        status: true,
        userId: true,
        projectId: true,
      },
    });

    for (const automation of automations) {
      processed += 1;
      const startTime = Date.now();
      let logStatus: "SUCCESS" | "FAILED" = "SUCCESS";
      let result: unknown = null;
      let errorMessage: string | null = null;

      try {
        console.info("[automation-executor] running", {
          automationId: automation.id,
          name: automation.name,
          actionTool: automation.actionTool,
        });

        const toolResult = await executeTool(
          automation.actionTool,
          (automation.actionParams as Record<string, unknown>) ?? {},
          {
            tenantId: tenant.id,
            userId: automation.userId,
            projectId: automation.projectId,
          }
        );

        if (!toolResult.success) {
          throw new Error(toolResult.error ?? "Tool execution failed");
        }

        result = toolResult.data;
      } catch (err) {
        logStatus = "FAILED";
        errorMessage = err instanceof Error ? err.message : String(err);
        failed += 1;
      }

      const durationMs = Date.now() - startTime;
      if (logStatus === "SUCCESS") succeeded += 1;

      // Create execution log
      try {
        await db.automationLog.create({
          data: {
            automationId: automation.id,
            status: logStatus,
            result: result != null ? (result as object) : undefined,
            errorMessage: errorMessage ?? undefined,
            durationMs,
          },
        });
      } catch (logErr) {
        console.error("[automation-executor] failed to create AutomationLog", automation.id, logErr);
      }

      // Update automation status and schedule next run
      try {
        const nextTriggerAt = await (async (): Promise<Date | null> => {
          if (automation.recurrence) {
            try {
              const interval = CronExpressionParser.parse(automation.recurrence, {
                currentDate: now,
                tz: automation.timezone,
              });
              return interval.next().toDate();
            } catch (parseErr) {
              console.error("[automation-executor] cron parse error", automation.id, parseErr);
              return null;
            }
          }
          return null;
        })();

        if (nextTriggerAt) {
          await db.automation.update({
            where: { id: automation.id },
            data: {
              lastRunAt: now,
              nextRunAt: nextTriggerAt,
              triggerAt: nextTriggerAt,
              status: "ACTIVE",
            },
          });
        } else {
          await db.automation.update({
            where: { id: automation.id },
            data: {
              lastRunAt: now,
              status: "COMPLETED",
            },
          });
        }
      } catch (updateErr) {
        console.error("[automation-executor] failed to update automation", automation.id, updateErr);
      }
    }
  }

  return { processed, succeeded, failed };
}
