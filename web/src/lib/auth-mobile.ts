/**
 * Mobile JWT authentication utilities.
 * Signs and verifies JWTs using HMAC-SHA256 with AUTH_SECRET.
 * Used by mobile API routes — NOT by Auth.js web sessions.
 */
import { createHmac } from "crypto";
import { prisma } from "./db";
import {
  MOBILE_ACCESS_TOKEN_MAX_AGE,
  MOBILE_REFRESH_TOKEN_MAX_AGE,
} from "./auth";

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf-8");
}

const JWT_HEADER = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function sign(payload: Record<string, unknown>, secret: string): string {
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = `${JWT_HEADER}.${payloadB64}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export type MobileJwtPayload = {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
  type: "access" | "refresh";
  iat: number;
  exp: number;
};

function verify(token: string, secret: string): MobileJwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSig = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  // Constant-time comparison
  if (signature.length !== expectedSig.length) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  if (diff !== 0) return null;

  try {
    const decoded = JSON.parse(base64urlDecode(payload)) as MobileJwtPayload;

    // Check expiry
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function createAccessToken(user: {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...user,
      type: "access",
      iat: now,
      exp: now + MOBILE_ACCESS_TOKEN_MAX_AGE,
    },
    getSecret()
  );
}

export function createRefreshToken(user: {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      ...user,
      type: "refresh",
      iat: now,
      exp: now + MOBILE_REFRESH_TOKEN_MAX_AGE,
    },
    getSecret()
  );
}

export function verifyAccessToken(token: string): MobileJwtPayload | null {
  const payload = verify(token, getSecret());
  if (!payload || payload.type !== "access") return null;
  return payload;
}

export function verifyRefreshToken(token: string): MobileJwtPayload | null {
  const payload = verify(token, getSecret());
  if (!payload || payload.type !== "refresh") return null;
  return payload;
}

/**
 * Extract and verify JWT from Authorization header.
 * Returns the payload or null if invalid/missing.
 */
export function verifyBearerToken(
  authorizationHeader: string | null
): MobileJwtPayload | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice(7);
  return verifyAccessToken(token);
}

/**
 * Authenticate a user by email/password for mobile login.
 * Returns user info with tokens, or null on failure.
 */
export async function authenticateMobile(
  email: string,
  password: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    tenantId: string;
    role: string;
  };
} | null> {
  const bcrypt = await import("bcrypt");

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: {
      memberships: { take: 1, orderBy: { createdAt: "asc" } },
    },
  });

  if (!user?.password) return null;

  // Check if account is locked
  if (user.lockedAt) return null;

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    // Increment failed login attempts
    const attempts = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        ...(attempts >= 5 ? { lockedAt: new Date() } : {}),
      },
    });
    return null;
  }

  // Reset failed attempts on successful login
  if (user.failedLoginAttempts > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0 },
    });
  }

  const membership = user.memberships[0];
  if (!membership) return null;

  const tokenPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    tenantId: membership.tenantId,
    role: membership.role,
  };

  return {
    accessToken: createAccessToken(tokenPayload),
    refreshToken: createRefreshToken(tokenPayload),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role,
    },
  };
}
