import { NextRequest, NextResponse } from "next/server";
import { runAutomationExecutorJob } from "@/lib/jobs/automation-executor";

function getProvidedSecret(request: NextRequest): string | null {
  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret) return headerSecret;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim();
}

export async function GET(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET_NOT_CONFIGURED" },
      { status: 500 }
    );
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await runAutomationExecutorJob();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron] automations failed", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
