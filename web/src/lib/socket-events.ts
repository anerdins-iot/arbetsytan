export const SOCKET_EVENTS = {
  notificationNew: "notification:new",
  projectJoin: "project:join",
  taskCreated: "task:created",
  taskUpdated: "task:updated",
  taskDeleted: "task:deleted",
  timeEntryCreated: "timeEntry:created",
  timeEntryUpdated: "timeEntry:updated",
  timeEntryDeleted: "timeEntry:deleted",
  fileCreated: "file:created",
  fileDeleted: "file:deleted",
  projectUpdated: "project:updated",
} as const;

export type RealtimeNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  projectId: string | null;
};

export type RealtimeTaskEvent = {
  projectId: string;
  taskId: string;
  actorUserId: string;
};

export type RealtimeTimeEntryEvent = {
  projectId: string;
  timeEntryId: string;
  actorUserId: string;
};

export type RealtimeFileEvent = {
  projectId: string;
  fileId: string;
  actorUserId: string;
};

export type RealtimeProjectUpdatedEvent = {
  projectId: string;
  actorUserId: string;
  previousStatus: string;
  newStatus: string;
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
