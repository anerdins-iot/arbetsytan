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
  noteCreated: "note:created",
  noteUpdated: "note:updated",
  noteDeleted: "note:deleted",
  noteCategoryCreated: "noteCategory:created",
  noteCategoryUpdated: "noteCategory:updated",
  noteCategoryDeleted: "noteCategory:deleted",
  fileUpdated: "file:updated",
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
  projectId: string | null;
  fileId: string;
  actorUserId: string;
  fileName?: string;
  ocrText?: string | null;
  label?: string | null;
  url?: string;
};

export type RealtimeProjectUpdatedEvent = {
  projectId: string;
  actorUserId: string;
  previousStatus: string;
  newStatus: string;
};

export type RealtimeNoteEvent = {
  noteId: string;
  /** Project ID for project notes; null for personal notes */
  projectId: string | null;
  title: string;
  category: string | null;
  createdById: string;
};

export type RealtimeNoteCategoryEvent = {
  categoryId: string;
  name: string;
  slug: string;
  color: string | null;
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
