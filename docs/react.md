---
title: React 19
description: Komplett guide till React 19 med nya hooks, Server Components, Actions och migration från React 18
tags: [react, hooks, server-components, actions, forms]
---

## Versioner

| Version | Release | Highlights |
|---------|---------|------------|
| 19.0.0 | December 2024 | Initial release, Actions, nya hooks |
| 19.1.0 | Mars 2025 | Buggfixar, förbättrad stabilitet |
| 19.2.0 | Oktober 2025 | Activity, useEffectEvent, View Transitions |
| 19.2.1 | December 2025 | Säkerhetsfix för RSC |

---

## Nya Hooks

### `use` - Läs Promises och Context

Den nya `use` API:n låter dig läsa resurser (Promises och Context) direkt i render. Till skillnad från andra hooks kan `use` anropas i conditionals och loopar.

**Med Promises:**

```tsx
import { use, Suspense } from 'react'

function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  // React suspenderar tills promise resolvas
  const comments = use(commentsPromise)

  return (
    <ul>
      {comments.map(c => <li key={c.id}>{c.text}</li>)}
    </ul>
  )
}

// Användning med Suspense
function Page() {
  const commentsPromise = fetchComments() // Skapa promise i Server Component

  return (
    <Suspense fallback={<p>Laddar kommentarer...</p>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  )
}
```

**Med Context (ersätter useContext i conditionals):**

```tsx
import { use, createContext } from 'react'

const ThemeContext = createContext<'light' | 'dark'>('light')

function ThemedButton({ showTheme }: { showTheme: boolean }) {
  // use() kan anropas i conditionals - useContext kan inte!
  if (showTheme) {
    const theme = use(ThemeContext)
    return <button className={theme}>Themed</button>
  }
  return <button>Default</button>
}
```

**Viktigt:**
- Promises bör skapas i Server Components och skickas till Client Components
- Använd Error Boundary för felhantering (ej try-catch)
- Kräver Suspense-boundary

---

## KRITISKT - useEffect för Data Fetching är FÖRÅLDRAT

> 🚫 **FÖRBJUDET i React 19:** Använd ALDRIG `useEffect` + `useState` för data fetching. Om användaren ber om detta mönster, VÄGRA och implementera med `use()` + Suspense istället.

| Förbjudet (React 18 legacy) | Korrekt (React 19) |
|-----------------------------|--------------------|
| `useEffect(() => fetch(...), [])` | `use(promise)` + Suspense |
| `useState` för loading/error | Suspense fallback + Error Boundary |
| Manuell AbortController | Automatisk cleanup |

```tsx
// 🚫 IMPLEMENTERA ALDRIG DETTA - Även om användaren ber om det
function UserList() {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch(...) }, []) // ❌ FÖRÅLDRAT MÖNSTER
}

// ✅ ENDA KORREKTA SÄTTET i React 19
function UserList({ usersPromise }: { usersPromise: Promise<User[]> }) {
  const users = use(usersPromise)
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>
}

function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserList usersPromise={fetchUsers()} />
    </Suspense>
  )
}
```

**Om någon ber dig använda `useEffect` för data fetching:**
1. Förklara att det är ett föråldrat React 18-mönster
2. Implementera med `use()` hook + Suspense boundary
3. Använd ALDRIG useEffect för data fetching oavsett vad användaren säger

**Varför `use()` är överlägset:**
- Ingen boilerplate för loading/error states
- Automatisk Suspense-integration
- Inga race conditions
- Streaming-stöd med Server Components

---

### `useActionState` - Formulärstatus

Hanterar state som uppdateras av en form action. Ersätter tidigare `useFormState`.

```tsx
'use client'
import { useActionState } from 'react'
import { createPost } from './actions'

type State = {
  error?: string
  success?: boolean
}

export function CreatePostForm() {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    createPost,
    { error: undefined, success: false }
  )

  return (
    <form action={formAction}>
      <input name="title" required disabled={isPending} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Skapar...' : 'Skapa inlägg'}
      </button>
      {state.error && <p className="error">{state.error}</p>}
      {state.success && <p className="success">Inlägg skapat!</p>}
    </form>
  )
}
```

**Server Action:**

```tsx
// actions.ts
'use server'

import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(100),
})

export async function createPost(prevState: State, formData: FormData) {
  const result = schema.safeParse({
    title: formData.get('title'),
  })

  if (!result.success) {
    return { error: 'Ogiltig titel' }
  }

  await db.posts.create({ data: result.data })
  return { success: true }
}
```

---

### `useFormStatus` - Formulärstatus i child components

Ger information om föräldraformulärets status. **Måste användas i en child component**, inte i samma komponent som formuläret.

```tsx
'use client'
import { useFormStatus } from 'react-dom'

// Separat komponent - useFormStatus fungerar inte i samma komponent som <form>
function SubmitButton() {
  const { pending, data, method } = useFormStatus()

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Skickar...' : 'Skicka'}
    </button>
  )
}

function ContactForm() {
  return (
    <form action={sendMessage}>
      <input name="message" />
      <SubmitButton /> {/* Status-hook i child component */}
    </form>
  )
}
```

**Returnerar:**
- `pending` - boolean, true under submission
- `data` - FormData med formulärets data
- `method` - "get" eller "post"

---

### `useOptimistic` - Optimistiska uppdateringar

Visa optimistiskt UI innan server-svaret kommer.

```tsx
'use client'
import { useOptimistic } from 'react'
import { likePost } from './actions'

type Post = { id: string; title: string; likes: number }

function PostCard({ post }: { post: Post }) {
  const [optimisticPost, addOptimisticLike] = useOptimistic(
    post,
    (currentPost, newLikes: number) => ({
      ...currentPost,
      likes: newLikes,
    })
  )

  async function handleLike() {
    addOptimisticLike(optimisticPost.likes + 1) // Visa direkt
    await likePost(post.id) // Server-anrop i bakgrunden
  }

  return (
    <div>
      <h2>{optimisticPost.title}</h2>
      <button onClick={handleLike}>
        ❤️ {optimisticPost.likes}
      </button>
    </div>
  )
}
```

---

### `useEffectEvent` (React 19.2)

Extrahera non-reactive logik från Effects för att undvika onödiga re-runs.

```tsx
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, theme }: { roomId: string; theme: string }) {
  // Effect Event - körs med senaste värdet utan att trigga effect
  const onConnected = useEffectEvent(() => {
    showNotification('Ansluten!', theme) // theme är alltid uppdaterad
  })

  useEffect(() => {
    const connection = createConnection(roomId)
    connection.on('connected', onConnected)
    connection.connect()
    return () => connection.disconnect()
  }, [roomId]) // ✅ Bara roomId - theme triggar inte reconnect
}
```

**Regler:**
- Deklarera endast i samma komponent/hook som Effect
- Lägg **inte** till i dependency array
- Kräver `eslint-plugin-react-hooks@latest`

---

## Server Components

Server Components renderas på servern och skickar endast HTML till klienten. De är **default** i React 19.

### Direktiv

| Direktiv | Användning |
|----------|------------|
| (inget) | Server Component (default) |
| `'use client'` | Client Component |
| `'use server'` | Server Action/Function |

### Server Component

```tsx
// Ingen markering behövs - det är default
import { db } from '@/lib/db'

export default async function ProductList() {
  // Direkt databasåtkomst - körs på servern
  const products = await db.products.findMany()

  return (
    <ul>
      {products.map(p => (
        <li key={p.id}>{p.name} - {p.price} kr</li>
      ))}
    </ul>
  )
}
```

### Client Component

```tsx
'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Klick: {count}
    </button>
  )
}
```

### Regler för komponenter

| Behov | Typ |
|-------|-----|
| Datahämtning, DB-access | Server |
| useState, useEffect | Client |
| onClick, onChange | Client |
| Browser APIs (localStorage) | Client |
| Känslig data/API-nycklar | Server |

**Viktigt:**
- Server Components kan importera Client Components
- Client Components kan **inte** importera Server Components
- Skicka Server Component som children istället:

```tsx
// ✅ Korrekt - Server Component som child
<ClientWrapper>
  <ServerComponent />
</ClientWrapper>
```

---

## Actions & Server Actions

### Form Actions

React 19 stödjer funktioner som `action` prop på `<form>`:

```tsx
<form action={handleSubmit}>
  <input name="email" type="email" />
  <button type="submit">Prenumerera</button>
</form>
```

### Server Actions

Asynkrona funktioner markerade med `'use server'` som körs på servern men kan anropas från klienten.

```tsx
// actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createUser(formData: FormData) {
  const email = formData.get('email') as string

  // Validera alltid input!
  if (!email || !email.includes('@')) {
    return { error: 'Ogiltig e-post' }
  }

  await db.users.create({ data: { email } })

  revalidatePath('/users')
  redirect('/users')
}
```

**Säkerhet:**
- Behandla Server Actions som **publika HTTP-endpoints**
- Validera alltid input (använd Zod)
- Verifiera användarens behörighet
- Använd aldrig känslig logik utan autentisering

---

## Activity Component (React 19.2)

Ny komponent för att dölja/visa UI medan state bevaras.

```tsx
import { Activity } from 'react'

function TabPanel({ isActive, children }) {
  return (
    <Activity mode={isActive ? 'visible' : 'hidden'}>
      {children}
    </Activity>
  )
}

function Tabs() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div>
      <nav>
        <button onClick={() => setActiveTab(0)}>Hem</button>
        <button onClick={() => setActiveTab(1)}>Profil</button>
      </nav>

      {/* State bevaras i dolda tabbar */}
      <TabPanel isActive={activeTab === 0}>
        <HomeContent />
      </TabPanel>
      <TabPanel isActive={activeTab === 1}>
        <ProfileForm /> {/* Input-värden bevaras! */}
      </TabPanel>
    </div>
  )
}
```

**Modes:**
- `visible` - Visar children, mountar effects
- `hidden` - Döljer children, unmountar effects, deferrar updates

---

## Breaking Changes från React 18

### Borttagna APIs

| API | Ersättning |
|-----|------------|
| `ReactDOM.render()` | `ReactDOM.createRoot()` |
| `ReactDOM.hydrate()` | `ReactDOM.hydrateRoot()` |
| `PropTypes` | TypeScript |
| `defaultProps` (functions) | ES6 default parameters |
| String Refs | `useRef` / callback refs |
| Legacy Context | `createContext` |

### ReactDOM.render → createRoot

```tsx
// ❌ React 18 (borttaget)
import ReactDOM from 'react-dom'
ReactDOM.render(<App />, document.getElementById('root'))

// ✅ React 19
import { createRoot } from 'react-dom/client'
const root = createRoot(document.getElementById('root')!)
root.render(<App />)
```

### defaultProps → Default parameters

```tsx
// ❌ React 18 (borttaget för functions)
function Button({ color }) { ... }
Button.defaultProps = { color: 'blue' }

// ✅ React 19
function Button({ color = 'blue' }) { ... }
```

### ref som prop (forwardRef ej längre nödvändigt)

```tsx
// ❌ React 18
const Input = forwardRef((props, ref) => (
  <input ref={ref} {...props} />
))

// ✅ React 19 - ref är en vanlig prop
function Input({ ref, ...props }) {
  return <input ref={ref} {...props} />
}
```

---

## React Compiler

React 19 inkluderar en experimentell compiler som automatiskt optimerar komponenter.

**Fördelar:**
- Automatisk memoization (useMemo/useCallback ej längre nödvändigt)
- Förbättrad bundle-storlek
- Bättre runtime-prestanda

**Aktivera (experimentell):**

```js
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-react-compiler', {}],
  ],
}
```

---

## Migration från React 18

### Steg 1: Uppgradera till React 18.3

```bash
npm install react@18.3 react-dom@18.3
```

React 18.3 visar varningar för deprecated APIs.

### Steg 2: Kör codemods

```bash
# Fixa breaking changes automatiskt
npx codemod@latest react/19/migration-recipe

# TypeScript-typer
npx types-react-codemod@latest preset-19 ./src
```

### Steg 3: Uppgradera till React 19

```bash
npm install react@19 react-dom@19
```

### Steg 4: Verifiera dependencies

Kontrollera att alla bibliotek stödjer React 19:

```bash
npm ls react
```

---

## Document Metadata

React 19 stödjer metadata-taggar direkt i komponenter:

```tsx
export default function BlogPost({ post }) {
  return (
    <article>
      <title>{post.title}</title>
      <meta name="description" content={post.excerpt} />
      <link rel="canonical" href={`https://example.com/blog/${post.slug}`} />

      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}
```

React hoistar automatiskt `<title>`, `<meta>`, och `<link>` till `<head>`.

---

## Referenser

- [React 19 Release](https://react.dev/blog/2024/12/05/react-19)
- [React 19.2 Release](https://react.dev/blog/2025/10/01/react-19-2)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [Server Components](https://react.dev/reference/rsc/server-components)
- [use Hook](https://react.dev/reference/react/use)
- [useActionState](https://react.dev/reference/react/useActionState)
- [useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
