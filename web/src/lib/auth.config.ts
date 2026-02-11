/**
 * Edge-compatible Auth.js config. No DB or Node-only imports.
 * Used by proxy.ts and merged into auth.ts.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [],
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days for web
  },
  callbacks: {
    session({ session, token }) {
      session.tenantId = token.tenantId as string | undefined;
      session.role = token.role as string | undefined;
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isAuthPage =
        path.includes("/login") ||
        path.includes("/register") ||
        path === "/" ||
        /^\/[a-z]{2}\/?$/.test(path);
      if (isAuthPage) return true;
      return !!auth;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
} satisfies NextAuthConfig;
