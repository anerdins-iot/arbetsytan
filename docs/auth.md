---
title: Auth.js (NextAuth v5)
description: Autentisering för Next.js med Auth.js v5 - providers, sessions, proxy och säkerhet
tags: [auth, nextauth, authentication, security, jwt, oauth]
---

## Installation

```bash
# Auth.js v5 (beta men stabil för produktion)
npm install next-auth@beta

# Med Prisma adapter
npm install next-auth@beta @auth/prisma-adapter
```

**Krav:** Next.js 14.0+ (rekommenderat: Next.js 16)

---

## Grundläggande Setup

### 1. Konfigurationsfil

Skapa `src/lib/auth.ts`:

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, Google],
})
```

### 2. Route Handler

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
```

### 3. Miljövariabler

```bash
# .env.local
AUTH_SECRET="generera-med-openssl-rand-hex-32"

# OAuth providers (auto-detekteras)
AUTH_GITHUB_ID="..."
AUTH_GITHUB_SECRET="..."
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
```

**Generera AUTH_SECRET:**
```bash
openssl rand -hex 32
```

---

## Providers

### OAuth Providers

Auth.js v5 auto-detekterar miljövariabler med formatet `AUTH_{PROVIDER}_{ID|SECRET}`:

```typescript
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import Discord from "next-auth/providers/discord"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub,  // Läser AUTH_GITHUB_ID och AUTH_GITHUB_SECRET
    Google,  // Läser AUTH_GOOGLE_ID och AUTH_GOOGLE_SECRET
    Discord, // Läser AUTH_DISCORD_ID och AUTH_DISCORD_SECRET
  ],
})
```

**Manuell konfiguration (om nödvändigt):**

```typescript
GitHub({
  clientId: process.env.CUSTOM_GITHUB_ID,
  clientSecret: process.env.CUSTOM_GITHUB_SECRET,
})
```

### Credentials Provider

För email/lösenord-autentisering:

```typescript
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { z } from "zod"
import bcrypt from "bcryptjs"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Lösenord", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data

        const user = await db.user.findUnique({ where: { email } })
        if (!user || !user.hashedPassword) return null

        const isValid = await bcrypt.compare(password, user.hashedPassword)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
})
```

⚠️ **Varning:** Credentials provider stöder inte database sessions som default. Använd `strategy: "jwt"` eller implementera egen session-hantering.

---

## Session Handling

### Hämta session i Server Components

```typescript
import { auth } from "@/lib/auth"

export default async function ProfilePage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <div>
      <h1>Välkommen {session.user.name}</h1>
      <p>{session.user.email}</p>
    </div>
  )
}
```

### Hämta session i Client Components

```typescript
"use client"

import { useSession } from "next-auth/react"

export function UserMenu() {
  const { data: session, status } = useSession()

  if (status === "loading") return <Spinner />
  if (!session) return <LoginButton />

  return <span>{session.user?.name}</span>
}
```

**Wrappa appen med SessionProvider:**

```typescript
// app/providers.tsx
"use client"

import { SessionProvider } from "next-auth/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

```typescript
// app/layout.tsx
import { Providers } from "./providers"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Sign In / Sign Out

```typescript
// Server Action
import { signIn, signOut } from "@/lib/auth"

export async function loginWithGitHub() {
  await signIn("github", { redirectTo: "/dashboard" })
}

export async function logout() {
  await signOut({ redirectTo: "/" })
}
```

```typescript
// I formulär
<form action={loginWithGitHub}>
  <button type="submit">Logga in med GitHub</button>
</form>
```

---

## Proxy för Skyddade Routes

> **Next.js 16+** använder `proxy.ts` istället för `middleware.ts`. Exemplen nedan visar `proxy.ts`. För Next.js 14-15, använd `middleware.ts` med samma innehåll.

### Grundläggande Proxy

```typescript
// proxy.ts (Next.js 16+) eller middleware.ts (Next.js 14-15)
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*"],
}
```

### Proxy med Rollbaserad Access

```typescript
// proxy.ts (Next.js 16+) eller middleware.ts (Next.js 14-15)
import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { auth: session, nextUrl } = req

  const isLoggedIn = !!session?.user
  const isAdmin = session?.user?.role === "admin"

  // Admin-sidor
  if (nextUrl.pathname.startsWith("/admin")) {
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/unauthorized", req.url))
    }
  }

  // Skyddade sidor
  if (nextUrl.pathname.startsWith("/dashboard")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

### Edge-kompatibel Setup (rekommenderat med Prisma)

⚠️ **Vid Prisma-användning MÅSTE konfigurationen delas upp.** Prisma och andra ORMs kräver Node.js. I Next.js 16 körs `proxy.ts` på Node.js runtime, men uppdelningen är fortfarande rekommenderad för att hålla proxy lätt och snabb — den ska inte behöva ladda hela Prisma-klienten bara för att kolla auth.

Mönstret: `auth.config.ts` (edge-kompatibel, inga DB-importer) + `auth.ts` (full config med PrismaAdapter). Proxy importerar **bara** från `auth.config.ts`.

```typescript
// src/lib/auth.config.ts (edge-kompatibel — INGA databas-importer här)
import type { NextAuthConfig } from "next-auth"
import GitHub from "next-auth/providers/github"

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [GitHub],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected = nextUrl.pathname.startsWith("/dashboard")

      if (isProtected && !isLoggedIn) {
        return false // Redirect till signIn page
      }

      return true
    },
  },
}
```

```typescript
// src/lib/auth.ts (full config med adapter — körs INTE i Edge)
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  ...authConfig,
})
```

```typescript
// proxy.ts (Next.js 16+) eller middleware.ts (Next.js 14-15)
// OBS: Importerar BARA från auth.config — ALDRIG från auth.ts
import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
```

---

## Database Adapters (Prisma)

### Installation

```bash
npm install @auth/prisma-adapter prisma
```

> **OBS:** Prisma 7 kräver `prisma` i `dependencies` (inte `devDependencies`). Se `/workspace/docs/prisma.md` för korrekt Prisma 7-setup.

### Prisma Schema

```prisma
// prisma/schema.prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  role          String    @default("user")
  accounts      Account[]
  sessions      Session[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

### Konfiguration med Adapter

> **Rekommenderat:** Vid Prisma-användning, dela upp i `auth.config.ts` + `auth.ts` för Edge-kompatibilitet. Se [Edge-kompatibel Setup](#edge-kompatibel-setup-rekommenderat-med-prisma).

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import GitHub from "next-auth/providers/github"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // Krävs för Edge-kompatibilitet
  providers: [GitHub],
})
```

> **Prisma 7:** Importera ALLTID din singleton-instans från `@/lib/prisma` — skapa aldrig `new PrismaClient()` direkt. Se `/workspace/docs/prisma.md` för korrekt setup av `lib/prisma.ts`.

---

## JWT vs Database Sessions

### JWT Sessions (Default)

```typescript
export const { handlers, auth } = NextAuth({
  session: { strategy: "jwt" },
  // ...
})
```

| Fördelar | Nackdelar |
|----------|-----------|
| Ingen databas krävs | Kan inte invalideras server-side |
| Snabbare (ingen DB-lookup) | Session-data lagras i cookie |
| Edge-kompatibel | Större cookie-storlek |
| Enklare skalning | |

### Database Sessions

```typescript
export const { handlers, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  // ...
})
```

| Fördelar | Nackdelar |
|----------|-----------|
| Kan invalideras omedelbart | Kräver databas-lookup |
| Mindre cookies | Inte Edge-kompatibel (de flesta adapters) |
| Full kontroll över sessions | Mer komplex setup |

**Rekommendation:** Använd JWT för de flesta användningsfall. Använd database sessions om du behöver kunna invalidera sessions omedelbart (t.ex. vid lösenordsbyte).

---

## Callbacks

### Utöka Session med Extra Data

```typescript
export const { handlers, auth } = NextAuth({
  callbacks: {
    async jwt({ token, user }) {
      // Lägg till user.role i token vid inloggning
      if (user) {
        token.role = user.role
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      // Exponera role och id i session
      if (session.user) {
        session.user.role = token.role as string
        session.user.id = token.id as string
      }
      return session
    },
  },
})
```

**TypeScript-typer:**

```typescript
// types/next-auth.d.ts
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
    } & DefaultSession["user"]
  }

  interface User {
    role: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string
  }
}
```

---

## Vanliga Problem

### "Edge runtime not supported"

Prisma och de flesta ORMs kräver Node.js runtime. I Next.js 16 körs `proxy.ts` redan på Node.js, men uppdelningen i `auth.config.ts` + `auth.ts` rekommenderas fortfarande för att hålla proxyn lätt. Lösning:
1. Använd `strategy: "jwt"` istället för database sessions
2. Dela upp config i `auth.config.ts` (providers) och `auth.ts` (full med adapter) — se [Edge-kompatibel Setup](#edge-kompatibel-setup-rekommenderat-med-prisma)

### "CSRF token mismatch"

Kontrollera att `AUTH_URL` matchar din faktiska URL i produktion.

### Session försvinner efter deploy

Sätt `AUTH_SECRET` som miljövariabel i produktion. Samma secret måste användas över alla instanser.

---

## Mobil/Expo-autentisering

### Begränsningar med Auth.js i Expo

Auth.js förutsätter httpOnly cookies för session-hantering. Detta fungerar INTE i React Native/Expo som saknar webbläsare-kontext. Auth.js har inget officiellt Expo-stöd.

### Rekommenderad lösning för Expo

**OAuth-flöden:**
- Använd `expo-auth-session` för Google, GitHub, Discord etc.
- Följer PKCE-flöde (Proof Key for Code Exchange)
- Hanterar redirect till app automatiskt

**Token-lagring:**
- Spara access/refresh tokens med `expo-secure-store` (krypterad lagring)
- Använd ALDRIG `AsyncStorage` för tokens (okrypterat)

**WebView OAuth:**
- Använd ALDRIG WebView för OAuth (säkerhetsrisk — användaren ser inte riktig URL)
- Expo öppnar system-webbläsare istället

---

## Dual Auth-strategi (Webb + Mobil)

### Backend-for-Frontend (BFF) Pattern

En backend kan stödja båda auth-typerna samtidigt:

**Webb:** Secure httpOnly cookies (server-side sessions)
- Session-token i cookie
- CSRF-skydd inkluderat
- Auth.js standardflöde

**Mobil:** JWT Bearer tokens (stateless)
- `Authorization: Bearer <token>` header
- Ingen cookie-support krävs
- Längre TTL än cookies (refresh tokens)

### Implementering

Backend detekterar klient-typ baserat på header:

```typescript
// API route — stödjer både cookie-auth och Bearer token
export async function GET(req: Request) {
  // Försök cookie-auth först (Next.js/webb)
  const session = await auth()
  if (session?.user) {
    return Response.json({ user: session.user })
  }

  // Fallback: Bearer token (Expo/mobil)
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7)
    const user = await verifyJWT(token)
    if (user) {
      return Response.json({ user })
    }
  }

  return Response.json({ error: "Unauthorized" }, { status: 401 })
}
```

**Login-endpoints:**
- `/api/auth/[...nextauth]` — Auth.js för webb (cookies)
- `/api/mobile/login` — Custom endpoint för Expo (returnerar JWT)

---

## Låst konto-hantering

### Prisma Schema

Lägg till i User-modellen:

```prisma
model User {
  // ... existing fields
  failedLoginAttempts Int      @default(0)
  lockedAt            DateTime?
}
```

### Implementering i Credentials Provider

```typescript
Credentials({
  async authorize(credentials) {
    const { email, password } = loginSchema.parse(credentials)

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.hashedPassword) return null

    // Kontrollera om kontot är låst
    if (user.lockedAt) {
      const lockDuration = 15 * 60 * 1000 // 15 min
      const isStillLocked = Date.now() - user.lockedAt.getTime() < lockDuration

      if (isStillLocked) {
        throw new Error("Kontot är låst. Försök igen senare.")
      }

      // Lås har gått ut — återställ
      await db.user.update({
        where: { id: user.id },
        data: { lockedAt: null, failedLoginAttempts: 0 },
      })
    }

    const isValid = await bcrypt.compare(password, user.hashedPassword)

    if (!isValid) {
      const newAttempts = user.failedLoginAttempts + 1
      const shouldLock = newAttempts >= 5

      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedAt: shouldLock ? new Date() : null,
        },
      })

      if (shouldLock) {
        throw new Error("För många misslyckade försök. Kontot är låst i 15 minuter.")
      }

      return null
    }

    // Lyckad inloggning — återställ räknare
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedAt: null },
    })

    return { id: user.id, email: user.email, name: user.name }
  },
})
```

**Viktiga detaljer:**
- Kontrollera låsstatus INNAN lösenordsjämförelse (förhindra timing attacks)
- Lås efter 5 misslyckade försök (anpassningsbart)
- Automatisk timeout efter 15 minuter (eller permanent tills admin låser upp)
- Återställ räknare vid lyckad inloggning

---

## Referenser

- [Auth.js Dokumentation](https://authjs.dev/)
- [Auth.js Installation Guide](https://authjs.dev/getting-started/installation)
- [Migrating to v5](https://authjs.dev/getting-started/migrating-to-v5)
- [Prisma Adapter](https://authjs.dev/getting-started/adapters/prisma)
- [Session Strategies](https://authjs.dev/concepts/session-strategies)
- [Next.js Authentication Tutorial](https://nextjs.org/learn/dashboard-app/adding-authentication)
- [Expo Auth Session](https://docs.expo.dev/guides/authentication/)
- [Expo Secure Store](https://docs.expo.dev/versions/latest/sdk/securestore/)