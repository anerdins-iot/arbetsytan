import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import type { EmitContext } from "./emit-context";
import { createEmitExtension } from "./db-emit-extension";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prismaClientSingleton = new PrismaClient({ adapter });

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const basePrisma = globalThis.prisma ?? prismaClientSingleton;
if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = basePrisma;
}

/** Models that have a direct tenantId column. */
const DIRECT_TENANT_MODELS = [
  "project",
  "membership",
  "invitation",
  "subscription",
  "notificationPreference",
  "pushSubscription",
  "automation",
  "emailTemplate",
  "documentChunk",
  "noteCategory",
  "timeEntry",
  "emailConversation",
] as const;

/** Models scoped via direct project relation (ALWAYS have projectId). */
const PROJECT_SCOPED_MODELS = [
  "task",
  "activityLog",
] as const;

/** Models that can be personal (projectId null) or project-scoped. */
const PROJECT_OR_PERSONAL_MODELS = [
  "file",
  "note",
] as const;

/** Comment is scoped via task.project (no direct project relation). */
const COMMENT_MODEL = "comment" as const;

/** AutomationLog is scoped via automation. */
const AUTOMATION_LOG_MODEL = "automationLog" as const;

/** Conversation: personal (projectId null) or project.project.tenantId. */
const CONVERSATION_TENANT_OR = (tenantId: string) => ({
  OR: [{ projectId: null }, { project: { tenantId } }] as const,
});

/** Notification: project.tenantId or user.memberships in tenant. */
const NOTIFICATION_TENANT_OR = (tenantId: string) => ({
  OR: [
    { project: { tenantId } },
    { projectId: null, user: { memberships: { some: { tenantId } } } },
  ] as const,
});

/** Message is scoped via conversation (same OR as Conversation). */
const MESSAGE_CONVERSATION_FILTER = (tenantId: string) => ({
  conversation: { OR: [{ projectId: null }, { project: { tenantId } }] } as const,
});

/** File: project.tenantId. Personal files use userDb() instead. */
const FILE_TENANT_FILTER = (tenantId: string) => ({
  project: { tenantId },
});

/** Note: project.tenantId. Personal notes use userDb() instead. */
const NOTE_TENANT_FILTER = (tenantId: string) => ({
  project: { tenantId },
});

/** EmailMessage is scoped via conversation.tenantId. */
const EMAIL_MESSAGE_TENANT_FILTER = (tenantId: string) => ({
  conversation: { tenantId },
});

function mergeWhereEmailMessageTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, EMAIL_MESSAGE_TENANT_FILTER(tenantId)] },
  } as T;
}

/** Build nested where key from dot path, e.g. "task.project" -> { task: { project: { tenantId } } }. */
function nestedTenantFilter(relationPath: string, tenantId: string): Record<string, unknown> {
  const parts = relationPath.split(".");
  let current: Record<string, unknown> = { tenantId };
  for (let i = parts.length - 1; i >= 0; i--) {
    current = { [parts[i]]: current };
  }
  return current;
}

function mergeWhereTenantId<T extends { where?: unknown }>(
  args: T,
  tenantId: string,
  relationPath?: string
): T {
  const filter = relationPath
    ? nestedTenantFilter(relationPath, tenantId)
    : { tenantId };

  return {
    ...args,
    where: {
      ...(typeof args.where === "object" && args.where !== null
        ? args.where
        : {}),
      ...filter,
    },
  } as T;
}

function mergeDataTenantId<T extends { data?: unknown }>(
  args: T,
  tenantId: string
): T {
  const data =
    typeof args.data === "object" && args.data !== null ? args.data : {};
  return {
    ...args,
    data: { ...data, tenantId },
  } as T;
}

function mergeWhereConversationTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, CONVERSATION_TENANT_OR(tenantId)] },
  } as T;
}

function mergeWhereMessageTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, MESSAGE_CONVERSATION_FILTER(tenantId)] },
  } as T;
}

function mergeWhereNotificationTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, NOTIFICATION_TENANT_OR(tenantId)] },
  } as T;
}

function mergeWhereFileTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, FILE_TENANT_FILTER(tenantId)] },
  } as T;
}

function mergeWhereNoteTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, NOTE_TENANT_FILTER(tenantId)] },
  } as T;
}

function createTenantExtension(tenantId: string) {
  const query = {} as Record<
    string,
    Record<
      string,
      (params: { args: unknown; query: (args: unknown) => unknown }) => unknown
    >
  >;

  // 1. Handle models with direct tenantId
  for (const model of DIRECT_TENANT_MODELS) {
    query[model] = {
      findMany: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      findFirst: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      findFirstOrThrow: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      findUnique: ({ args, query: run }) => {
        const a = args as { where: { id?: string } };
        return run({ ...a, where: { ...a.where, tenantId } });
      },
      findUniqueOrThrow: ({ args, query: run }) => {
        const a = args as { where: { id?: string } };
        return run({ ...a, where: { ...a.where, tenantId } });
      },
      create: ({ args, query: run }) =>
        run(mergeDataTenantId(args as { data?: unknown }, tenantId)),
      createMany: ({ args, query: run }) => {
        const a = args as { data: unknown[] | { tenantId?: string } };
        const data = Array.isArray(a.data)
          ? a.data.map((row) =>
              typeof row === "object" && row !== null
                ? { ...row, tenantId }
                : { tenantId }
            )
          : mergeDataTenantId(
              { data: a.data } as { data: object },
              tenantId
            ).data;
        return run({ ...a, data });
      },
      update: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      updateMany: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      delete: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      deleteMany: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      count: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      aggregate: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      groupBy: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId)),
      upsert: ({ args, query: run }) => {
        const a = args as { where?: unknown; create?: unknown; update?: unknown };
        const create = mergeDataTenantId(
          { data: a.create ?? {} } as { data: object },
          tenantId
        ).data;
        return run({ ...a, where: { ...(a.where as object), tenantId }, create });
      },
    };
  }

  // 2. Handle models with direct project relation (always have projectId)
  for (const model of PROJECT_SCOPED_MODELS) {
    query[model] = {
      findMany: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
      findFirst: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
      findFirstOrThrow: ({ args, query: run }) =>
        run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
      // findUnique/update/delete not intercepted due to Prisma unique filter limitations with joins
    };
  }

  // 2a. File: can be personal (projectId null) or project-scoped
  query.file = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    // findUnique/update/delete not intercepted due to Prisma unique filter limitations with joins
  };

  // 2a2. Note: can be personal (projectId null) or project-scoped
  query.note = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    // findUnique/update/delete not intercepted due to Prisma unique filter limitations with joins
  };

  // 2b. Comment is scoped via task.project (no direct project relation)
  query[COMMENT_MODEL] = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    // findUnique/update/delete not intercepted due to Prisma unique filter limitations with joins
  };

  // 2c. AutomationLog is scoped via automation
  query[AUTOMATION_LOG_MODEL] = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    count: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    // findUnique/update/delete not intercepted due to Prisma unique filter limitations
  };

  // 3. Handle ProjectMember (scoped via project)
  query.projectMember = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    create: ({ args, query: run }) => run(args),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    // findUnique/delete not intercepted due to Prisma unique filter limitations with joins
  };

  // 4. Handle TaskAssignment (nested relation: task -> project -> tenantId)
  query.taskAssignment = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    // findUnique not intercepted due to Prisma unique filter limitations with joins
  };

  // 4b. AIMessage is scoped via project (always has projectId)
  query.aIMessage = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    create: ({ args, query: run }) => run(args),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    count: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    // findUnique/update/delete not intercepted due to Prisma unique filter limitations with joins
  };

  // 5. Conversation: personal (projectId null) or project.tenantId
  query.conversation = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    create: ({ args, query: run }) => run(args),
    update: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereConversationTenant(args as { where?: unknown }, tenantId)),
  };

  // 6. Message: scoped via conversation (personal or project.tenantId)
  query.message = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    create: ({ args, query: run }) => run(args),
    update: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereMessageTenant(args as { where?: unknown }, tenantId)),
  };

  // 6b. EmailMessage: scoped via conversation.tenantId
  query.emailMessage = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    create: ({ args, query: run }) => run(args),
    update: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereEmailMessageTenant(args as { where?: unknown }, tenantId)),
  };

  // 7. Notification: scoped via project or user membership
  query.notification = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    create: ({ args, query: run }) => run(args),
    update: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereNotificationTenant(args as { where?: unknown }, tenantId)),
  };

  return { query };
}

export type TenantScopedClient = Omit<
  PrismaClient,
  | "project"
  | "membership"
  | "invitation"
  | "subscription"
  | "notificationPreference"
  | "pushSubscription"
  | "task"
  | "activityLog"
  | "notification"
  | "file"
  | "documentChunk"
  | "timeEntry"
  | "comment"
  | "taskAssignment"
  | "projectMember"
  | "conversation"
  | "message"
  | "note"
  | "emailTemplate"
  | "automationLog"
  | "noteCategory"
  | "emailConversation"
  | "emailMessage"
> & {
  project: PrismaClient["project"];
  membership: PrismaClient["membership"];
  invitation: PrismaClient["invitation"];
  subscription: PrismaClient["subscription"];
  notificationPreference: PrismaClient["notificationPreference"];
  pushSubscription: PrismaClient["pushSubscription"];
  task: PrismaClient["task"];
  activityLog: PrismaClient["activityLog"];
  notification: PrismaClient["notification"];
  file: PrismaClient["file"];
  documentChunk: PrismaClient["documentChunk"];
  timeEntry: PrismaClient["timeEntry"];
  comment: PrismaClient["comment"];
  taskAssignment: PrismaClient["taskAssignment"];
  projectMember: PrismaClient["projectMember"];
  conversation: PrismaClient["conversation"];
  message: PrismaClient["message"];
  note: PrismaClient["note"];
  emailTemplate: PrismaClient["emailTemplate"];
  automationLog: PrismaClient["automationLog"];
  noteCategory: PrismaClient["noteCategory"];
  emailConversation: PrismaClient["emailConversation"];
  emailMessage: PrismaClient["emailMessage"];
};

/**
 * Global Prisma client. Use ONLY for platform operations (auth, superadmin, cron).
 * For tenant data, use tenantDb(tenantId) instead.
 */
export const prisma = basePrisma;

/**
 * Returns a Prisma client that automatically scopes all queries to the given tenant.
 * 
 * @param tenantId - The tenant ID to scope queries to
 * @param emitContext - Optional context for automatic WebSocket event emission
 * @returns Tenant-scoped Prisma client
 */
export function tenantDb(tenantId: string, emitContext?: EmitContext): TenantScopedClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client = basePrisma.$extends(createTenantExtension(tenantId) as any);

  if (emitContext && !emitContext.skipEmit) {
    // Auto-fill tenantId from the tenantDb call
    const ctx: EmitContext = { ...emitContext, tenantId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = client.$extends(createEmitExtension(ctx) as any);
  }

  return client as unknown as TenantScopedClient;
}

// ─────────────────────────────────────────
// User-scoped database client
// ─────────────────────────────────────────

/** Merge userId filter into where clause. */
function mergeWhereUserId<T extends { where?: unknown }>(
  args: T,
  userId: string,
  userIdField: string = "userId"
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { ...existing, [userIdField]: userId },
  } as T;
}

/** Merge userId + projectId: null for personal items. Explicitly preserves unique key `id` so Prisma's FileWhereUniqueInput (update/delete) gets at least one of 'id' even when args.where is a proxy. */
function mergeWherePersonal<T extends { where?: unknown }>(
  args: T,
  userId: string,
  userIdField: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  const existingRecord = existing as Record<string, unknown>;
  const id = existingRecord.id;
  const mergedWhere: Record<string, unknown> = {
    ...existingRecord,
    [userIdField]: userId,
    projectId: null,
  };
  if (id !== undefined && id !== null) {
    mergedWhere.id = id;
  }
  return {
    ...args,
    where: mergedWhere,
  } as T;
}

/** Message: scoped to conversations where userId = userId and projectId = null (personal AI). */
function mergeWhereMessagePersonal<T extends { where?: unknown }>(
  args: T,
  userId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: {
      ...(existing as object),
      conversation: { userId, projectId: null },
    },
  } as T;
}

/** Inject userId + projectId: null into data for personal items. */
function mergeDataPersonal<T extends { data?: unknown }>(
  args: T,
  userId: string,
  userIdField: string
): T {
  const existing = typeof args.data === "object" && args.data !== null ? args.data : {};
  return {
    ...args,
    data: { ...existing, [userIdField]: userId, projectId: null },
  } as T;
}

function createUserExtension(userId: string) {
  const query = {} as Record<
    string,
    Record<
      string,
      (params: { args: unknown; query: (args: unknown) => unknown }) => unknown
    >
  >;

  // 1. Personal files (projectId = null, uploadedById = userId)
  query.file = {
    findMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    findFirst: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    findUnique: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    update: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    delete: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    updateMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    deleteMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    count: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "uploadedById")),
    create: ({ args, query: run }) =>
      run(mergeDataPersonal(args as { data?: unknown }, userId, "uploadedById")),
  };

  // 2. Personal notes (projectId = null, createdById = userId)
  query.note = {
    findMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    findFirst: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    findUnique: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    update: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    delete: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    updateMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    deleteMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    count: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "createdById")),
    create: ({ args, query: run }) =>
      run(mergeDataPersonal(args as { data?: unknown }, userId, "createdById")),
  };

  // 3. Personal conversations (projectId = null, userId = userId)
  query.conversation = {
    findMany: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    findFirst: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    findUnique: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    update: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    delete: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    count: ({ args, query: run }) =>
      run(mergeWherePersonal(args as { where?: unknown }, userId, "userId")),
    create: ({ args, query: run }) =>
      run(mergeDataPersonal(args as { data?: unknown }, userId, "userId")),
  };

  // 4. Notifications (userId = userId)
  query.notification = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    update: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    count: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
  };

  // 5. AIMessage (userId = userId, for personal AI messages)
  query.aIMessage = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    count: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    update: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereUserId(args as { where?: unknown }, userId)),
  };

  // 6. Message: scoped via conversation (personal: conversation.userId = userId, projectId = null)
  query.message = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    create: ({ args, query: run }) => run(args),
    update: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
    count: ({ args, query: run }) =>
      run(mergeWhereMessagePersonal(args as { where?: unknown }, userId)),
  };

  return { query };
}

export type UserScopedClient = Pick<
  PrismaClient,
  "file" | "note" | "conversation" | "message" | "notification" | "aIMessage"
>;

/**
 * Returns a Prisma client scoped to a user's personal data.
 * 
 * @param userId - The user ID to scope queries to
 * @param emitContext - Optional context for automatic WebSocket event emission.
 *                      Note: actorUserId will be set to userId automatically.
 * @returns User-scoped Prisma client
 */
export function userDb(userId: string, emitContext?: Omit<EmitContext, "actorUserId">): UserScopedClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client = basePrisma.$extends(createUserExtension(userId) as any);

  if (emitContext && !emitContext.skipEmit) {
    // For userDb, actorUserId is always the userId
    const ctx: EmitContext = { ...emitContext, actorUserId: userId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client = client.$extends(createEmitExtension(ctx) as any);
  }

  return client as unknown as UserScopedClient;
}
