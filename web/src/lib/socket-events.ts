export const SOCKET_EVENTS = {
  notificationNew: "notification:new",
  projectJoin: "project:join",
} as const;

export type RealtimeNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  projectId: string | null;
};

export function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}
