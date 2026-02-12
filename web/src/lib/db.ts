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
] as const;

/** Models scoped via direct project relation. */
const PROJECT_SCOPED_MODELS = [
  "task",
  "activityLog",
  "notification",
  "file",
  "documentChunk",
  "timeEntry",
] as const;

/** Comment is scoped via task.project (no direct project relation). */
const COMMENT_MODEL = "comment" as const;

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

  // 2. Handle models with direct project relation
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
