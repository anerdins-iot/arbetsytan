import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { logger } from "./lib/logger";

const { auth } = NextAuth(authConfig);
const intlMiddleware = createMiddleware(routing);

export default auth((req) => {
  if (process.env.DEBUG === "true") {
    logger.debug(`Request: ${req.method} ${req.nextUrl.pathname}`);
  }
  return intlMiddleware(req);
});

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
