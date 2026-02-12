import NextAuth from "next-auth";
import { NextResponse } from "next/server";
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
  const intlResponse = intlMiddleware(req);
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);
  const nextRes = NextResponse.next({
    request: { headers: requestHeaders },
  });
  intlResponse.headers.forEach((value, key) => {
    nextRes.headers.set(key, value);
  });
  return nextRes;
});

export const config = {
  matcher: ["/((?!api|trpc|_next|_vercel|.*\\..*).*)"],
};
