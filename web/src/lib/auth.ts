/**
 * Full Auth.js config: PrismaAdapter, Credentials, JWT/session callbacks.
 * Session: JWT in cookie for web. Mobile: access 15 min, refresh 30 days (same secret).
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";
import { authConfig } from "./auth.config";
import { prisma } from "./db";

/** Mobile JWT: access 15 min, refresh 30 days. Signed with AUTH_SECRET. */
export const MOBILE_ACCESS_TOKEN_MAX_AGE = 15 * 60; // 15 min
export const MOBILE_REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).trim().toLowerCase();
        const password = String(credentials.password);

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: { take: 1, orderBy: { createdAt: "asc" } },
          },
        });
        if (!user?.password) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        const membership = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          tenantId: membership?.tenantId ?? undefined,
          role: membership?.role ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = (user as { tenantId?: string }).tenantId;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
  },
});
