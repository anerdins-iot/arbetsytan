import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import {
  getMyTasks,
  getMyTasksToday,
  getRecentActivity,
  getMyNotifications,
} from "@/actions/dashboard";
import { TaskList } from "@/components/dashboard/task-list";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { NotificationList } from "@/components/dashboard/notification-list";
import { WorkerDashboard } from "@/components/dashboard/worker-dashboard";
import { DashboardRealtimeWrapper } from "@/components/dashboard/dashboard-realtime-wrapper";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function DashboardPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { role, user } = await requireAuth();

  // Worker role: simplified dashboard with only today's tasks
  if (role === "WORKER") {
    const { tasks } = await getMyTasksToday();
    return (
      <DashboardRealtimeWrapper>
        <WorkerDashboard tasks={tasks} userName={user.name ?? null} />
      </DashboardRealtimeWrapper>
    );
  }

  // Admin / Project Manager: full dashboard with three sections
  const [tasksResult, activityResult, notificationsResult] = await Promise.all([
    getMyTasks(),
    getRecentActivity(),
    getMyNotifications(),
  ]);

  return (
    <DashboardRealtimeWrapper>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("welcome")}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tasks section - full width on top */}
          <div className="lg:col-span-2">
            <TaskList tasks={tasksResult.tasks} />
          </div>

          {/* Activity feed */}
          <ActivityFeed activities={activityResult.activities} />

          {/* Notifications */}
          <NotificationList notifications={notificationsResult.notifications} />
        </div>
      </div>
    </DashboardRealtimeWrapper>
  );
}
