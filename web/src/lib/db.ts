import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

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
] as const;

/** Models scoped via direct project relation (ALWAYS have projectId). */
const PROJECT_SCOPED_MODELS = [
  "task",
  "activityLog",
  "timeEntry",
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

/** File/Note: project.tenantId or personal (projectId null + uploadedBy user in tenant). */
const FILE_TENANT_OR = (tenantId: string) => ({
  OR: [
    { project: { tenantId } },
    { projectId: null, uploadedBy: { memberships: { some: { tenantId } } } },
  ] as const,
});

const NOTE_TENANT_OR = (tenantId: string) => ({
  OR: [
    { project: { tenantId } },
    { projectId: null, createdBy: { memberships: { some: { tenantId } } } },
  ] as const,
});

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
    where: { AND: [existing, FILE_TENANT_OR(tenantId)] },
  } as T;
}

function mergeWhereNoteTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string
): T {
  const existing = typeof args.where === "object" && args.where !== null ? args.where : {};
  return {
    ...args,
    where: { AND: [existing, NOTE_TENANT_OR(tenantId)] },
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
      findUnique: ({ args, query: run }) => {
        const a = args as { where: { id?: string } };
        return run({ ...a, where: { ...a.where, project: { tenantId } } });
      },
      findUniqueOrThrow: ({ args, query: run }) => {
        const a = args as { where: { id?: string } };
        return run({ ...a, where: { ...a.where, project: { tenantId } } });
      },
      // Note: create/update for these models doesn't automatically inject relation,
      // but they are usually created connected to a project that is already tenant-checked.
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
    findUnique: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    update: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereFileTenant(args as { where?: unknown }, tenantId)),
    // create doesn't need tenant filter - caller provides projectId or not
  };

  // 2a2. Note: can be personal (projectId null) or project-scoped
  query.note = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    findUnique: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    findUniqueOrThrow: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    update: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    delete: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    count: ({ args, query: run }) =>
      run(mergeWhereNoteTenant(args as { where?: unknown }, tenantId)),
    // create doesn't need tenant filter - caller provides projectId or not
  };

  // 2b. Comment is scoped via task.project (no direct project relation)
  query[COMMENT_MODEL] = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findUnique: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, task: { project: { tenantId } } } });
    },
    findUniqueOrThrow: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, task: { project: { tenantId } } } });
    },
  };

  // 2c. AutomationLog is scoped via automation
  query[AUTOMATION_LOG_MODEL] = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
    findUnique: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, automation: { tenantId } } });
    },
    findUniqueOrThrow: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, automation: { tenantId } } });
    },
    count: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "automation")),
  };

  // 3. Handle ProjectMember (scoped via project)
  query.projectMember = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findUnique: ({ args, query: run }) => {
      const a = args as { where: { id?: string; projectId_membershipId?: { projectId: string; membershipId: string } } };
      return run({ ...a, where: { ...a.where, project: { tenantId } } });
    },
    findUniqueOrThrow: ({ args, query: run }) => {
      const a = args as { where: { id?: string; projectId_membershipId?: { projectId: string; membershipId: string } } };
      return run({ ...a, where: { ...a.where, project: { tenantId } } });
    },
    create: ({ args, query: run }) => run(args),
    delete: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
  };

  // 4. Handle TaskAssignment (nested relation: task -> project -> tenantId)
  query.taskAssignment = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "task.project")),
    findUnique: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, task: { project: { tenantId } } } });
    },
    findUniqueOrThrow: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, task: { project: { tenantId } } } });
    },
  };

  // 4b. AIMessage is scoped via project (always has projectId)
  query.aIMessage = {
    findMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirst: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findFirstOrThrow: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    findUnique: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, project: { tenantId } } });
    },
    findUniqueOrThrow: ({ args, query: run }) => {
      const a = args as { where: { id?: string } };
      return run({ ...a, where: { ...a.where, project: { tenantId } } });
    },
    create: ({ args, query: run }) => run(args),
    update: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    updateMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    delete: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    deleteMany: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
    count: ({ args, query: run }) =>
      run(mergeWhereTenantId(args as { where?: unknown }, tenantId, "project")),
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
};

/**
 * Global Prisma client. Use ONLY for platform operations (auth, superadmin, cron).
 * For tenant data, use tenantDb(tenantId) instead.
 */
export const prisma = basePrisma;

/**
 * Returns a Prisma client that automatically scopes all queries to the given tenant:
 * - Injects WHERE tenantId = ? on find*, update*, delete*, count, aggregate, groupBy.
 * - Injects tenantId into data on create, createMany, upsert.
 */
export function tenantDb(tenantId: string): TenantScopedClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return basePrisma.$extends(createTenantExtension(tenantId) as any) as unknown as TenantScopedClient;
}
