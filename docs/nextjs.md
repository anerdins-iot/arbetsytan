---
title: Next.js 16
description: Breaking changes och viktiga regler för Next.js 16
tags: [nextjs, react, framework, app-router]
---

## KRITISKT - Versionskrav

> ⚠️ **OBLIGATORISKT:** Projektet kräver **exakt Next.js 16.0.9**. Inga andra versioner stöds.

```bash
# Installation - ALLTID denna exakta version
npm install next@16.0.9 react@latest react-dom@latest
```

**Varför?** Andra versioner av Next.js 16 har kända kompatibilitetsproblem med vår CPU-arkitektur och kravspecifikation. Använd ALLTID `next@16.0.9`.

| Scenario | Kommando |
|----------|----------|
| Nytt projekt | `npx create-next-app@16.0.9` |
| Uppgradering | `npm install next@16.0.9` |
| Verifiera | `npx next --version` → ska visa `16.0.9` |

---

## Breaking Changes från Next.js 15

### 1. Async Request APIs (Kritisk!)

Synkron åtkomst till request-APIs är **helt borttagen** i Next.js 16. Dessa måste nu alltid vara asynkrona:

```typescript
// ❌ Fungerar INTE längre
const cookieStore = cookies()
const headersList = headers()
const { slug } = params

// ✅ Korrekt i Next.js 16
const cookieStore = await cookies()
const headersList = await headers()
const { slug } = await params
```

**Påverkade APIs:**
- `cookies()` - måste awaitas
- `headers()` - måste awaitas
- `draftMode()` - måste awaitas
- `params` - måste awaitas i page/layout
- `searchParams` - måste awaitas i page

**Typändringar:**

```typescript
// Page props
type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params
  const { query } = await searchParams
  // ...
}
```

**I Client Components - använd `use()`:**

```typescript
'use client'
import { use } from 'react'

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <div>{id}</div>
}
```

### 2. Middleware → Proxy

`middleware.ts` är deprecated och ersätts av `proxy.ts`:

```typescript
// ❌ Gammalt (deprecated)
// middleware.ts
export function middleware(request: NextRequest) { ... }

// ✅ Nytt i Next.js 16
// proxy.ts
export function proxy(request: NextRequest) { ... }
```

**Viktigt:** `proxy.ts` körs på Node.js runtime (inte Edge som middleware).

### 3. Node.js-krav

- **Minimum:** Node.js 20.9+
- **Node 18 stöds inte längre**

### 4. PPR-konfiguration

`experimental_ppr` är borttaget. Använd istället `cacheComponents`:

```typescript
// next.config.ts
const nextConfig = {
  cacheComponents: true, // Ersätter experimental.ppr
}
```

> ✅ **`cacheComponents: true` är rekommenderat** för alla produktionsappar. Det ger bättre prestanda genom att statiska delar cachas vid build-time.
>
> **Hantera dynamiska sidor korrekt:**
> - Sidor med databasanrop (Prisma/DB) → lägg till `export const dynamic = 'force-dynamic'` eller wrappa i `<Suspense>`
> - Icke-deterministiska anrop (`new Date()`, `Math.random()`) → flytta till dynamiska komponenter eller Client Components
> - Client Components med `usePathname()`/`useSearchParams()` → wrappa i `<Suspense>`
>
> **Typiskt mönster:** Statiska sidor (startsida, om-oss, priser) cachas automatiskt. Dynamiska sidor (dashboard, admin, sökresultat) markeras med `force-dynamic`.

### 5. Parallel Routes

Alla parallel route slots kräver nu en explicit `default.js`:

```
app/
├── @modal/
│   ├── page.tsx
│   └── default.tsx  // ← Krävs nu!
├── layout.tsx
└── page.tsx
```

### 6. AMP-stöd borttaget

AMP är helt borttaget från Next.js 16.

---

## Cache Components (`use cache`)

Next.js 16 introducerar **explicit opt-in caching** istället för implicit caching:

### Aktivera

```typescript
// next.config.ts
const nextConfig = {
  cacheComponents: true,
}
```

### Grundläggande användning

```typescript
import { cacheLife, cacheTag } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')

  return db.products.findMany()
}
```

### Cache-profiler

Inbyggda profiler: `'seconds'`, `'minutes'`, `'hours'`, `'days'`, `'weeks'`

**Egna profiler:**

```typescript
// next.config.ts
const nextConfig = {
  cacheComponents: true,
  cacheLife: {
    blog: {
      stale: 3600,      // 1 timme - klient använder cache utan check
      revalidate: 900,  // 15 min - bakgrundsuppdatering
      expire: 86400,    // 1 dag - cache raderas
    },
  },
}
```

### Cache-invalidering

```typescript
// I en Server Action
'use server'
import { updateTag, revalidateTag } from 'next/cache'

export async function updateProduct(id: string) {
  await db.products.update(id, { ... })

  updateTag('products')           // Soft invalidate
  // eller
  revalidateTag('products')       // Hard invalidate
}
```

---

## Dynamisk rendering

När `cacheComponents: true` är aktiverat är standardbeteendet att Server Components kan cachelagras vid build-time. För att tvinga dynamisk rendering:

### På sidnivå

```typescript
// app/dashboard/page.tsx
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const stats = await db.stats.getCurrent() // Hämtas vid varje request
  return <Dashboard stats={stats} />
}
```

### Med Suspense-boundaries

Kombinera statiskt skal med dynamiska delar genom `<Suspense>`:

```typescript
import { Suspense } from 'react'

export default function Page() {
  return (
    <div>
      <h1>Produkter</h1> {/* Statiskt — cachas */}
      <Suspense fallback={<p>Laddar...</p>}>
        <DynamicProductList /> {/* Dynamiskt — renderas vid request */}
      </Suspense>
    </div>
  )
}
```

### Relation till `cacheComponents`

| Scenario | Rendering |
|----------|-----------|
| `cacheComponents: false` (default) | Allt renderas dynamiskt |
| `cacheComponents: true` utan `'use cache'` | Komponenter kan prerenderas vid build |
| `cacheComponents: true` + `export const dynamic = 'force-dynamic'` | Sidan renderas vid varje request |
| `cacheComponents: true` + `'use cache'` + `cacheLife()` | Explicit cachning med kontrollerad livslängd |

---

## Server Components vs Client Components

### Server Components (default)

- Renderas på servern
- Kan inte använda hooks (`useState`, `useEffect`, etc.)
- Kan inte använda browser-APIs
- Kan direkt anropa databaser och APIs
- Kan inte använda React Context

```typescript
// Server Component (default)
export default async function ProductList() {
  const products = await db.products.findMany()
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}
```

### Client Components

Markeras med `'use client'` direktivet:

```typescript
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
```

### Regler

| Behov | Komponent |
|-------|-----------|
| Datahämtning, DB-access | Server |
| Interaktivitet (onClick, onChange) | Client |
| useState, useEffect | Client |
| Browser APIs (localStorage, etc.) | Client |
| Känslig data/nycklar | Server |

**Blanda komponenter:**

```typescript
// Server Component
import ClientButton from './ClientButton'

export default async function Page() {
  const data = await fetchData()
  return (
    <div>
      <h1>{data.title}</h1>
      <ClientButton /> {/* Client component som child */}
    </div>
  )
}
```

### Suspense-krav för navigation hooks

Client Components som använder `usePathname()`, `useSearchParams()` eller `useParams()` **måste wrappas i `<Suspense>`** med en fallback i layouts. Utan Suspense blockerar dessa hooks prerendering av hela sidan.

```typescript
'use client'

import { useSearchParams } from 'next/navigation'

function SearchFilter() {
  const searchParams = useSearchParams()
  return <input defaultValue={searchParams.get('q') ?? ''} />
}

// ✅ I layout eller page — wrappa med Suspense
import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Suspense fallback={<div>Laddar filter...</div>}>
        <SearchFilter />
      </Suspense>
      {children}
    </div>
  )
}
```

---

## Server Actions

### Definition

```typescript
// actions.ts
'use server'

import { revalidatePath } from 'next/cache'

export async function createPost(formData: FormData) {
  const title = formData.get('title') as string

  await db.posts.create({ data: { title } })
  revalidatePath('/posts')
}
```

### Användning i formulär

```typescript
import { createPost } from './actions'

export default function CreatePostForm() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Skapa</button>
    </form>
  )
}
```

### Säkerhet

- Behandla Server Actions som **publika HTTP-endpoints**
- Validera alltid input (använd Zod)
- Verifiera användarens behörighet

```typescript
'use server'

import { z } from 'zod'
import { auth } from '@/lib/auth'

const schema = z.object({
  title: z.string().min(1).max(100),
})

export async function createPost(formData: FormData) {
  const session = await auth()
  if (!session) throw new Error('Unauthorized')

  const result = schema.safeParse({
    title: formData.get('title'),
  })

  if (!result.success) {
    return { error: result.error.flatten() }
  }

  await db.posts.create({ data: result.data })
}
```

---

## Turbopack (Default)

Turbopack är nu default bundler i Next.js 16:

- **5-10x snabbare** Fast Refresh
- **2-5x snabbare** builds

För att använda webpack istället:

```bash
next dev --webpack
next build --webpack
```

---

## Upgrade-kommando

```bash
# Automatisk upgrade med codemod
npx @next/codemod@canary upgrade latest

# Manuell
npm install next@16.0.9 react@latest react-dom@latest
```

---

## Dev-server i agent-miljö

När en agent startar `next dev` (t.ex. för Playwright-tester) ska den **stoppa servern med PID**, aldrig med `pkill -f`. Annars kan agentens egen process dödas. Se `/workspace/docs/docker.md` avsnitt **"Dev-server i agent- och testmiljö (Playwright)"** för exakta kommandon (spara PID i `.dev-server.pid`, kill endast den).

---

## React 19-kompatibilitet

Next.js 16 använder React 19.2 med nya features:

- **View Transitions** - animera element mellan navigeringar
- **useEffectEvent** - extrahera non-reactive logic
- **Activity** - bakgrundsrendering
- **React Compiler** - automatisk memoization (stabil)

---

## Referenser

- [Next.js 16 Release](https://nextjs.org/blog/next-16)
- [Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
- [use cache Directive](https://nextjs.org/docs/app/api-reference/directives/use-cache)
