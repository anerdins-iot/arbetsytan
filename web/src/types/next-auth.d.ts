import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    tenantId?: string;
    role?: string;
    user: DefaultSession["user"] & { id?: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    role?: string;
  }
}
