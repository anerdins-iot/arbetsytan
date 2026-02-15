---
title: Zod 4
description: TypeScript-first schema validering med statisk typinferens
tags: [zod, validation, typescript, forms, server-actions]
---

## Installation

```bash
npm install zod
# eller för minimal bundle
npm install @zod/mini
```

**Aktuell version:** 4.3.5 (januari 2026)

**Krav:** TypeScript 5.5+

### Import-paths

```typescript
// Om du installerar zod@latest (v4 som default):
import { z } from 'zod'

// Om du uppgraderar från v3 eller har v3 som default:
import { z } from 'zod/v4'
```

`from 'zod'` fungerar direkt om `npm install zod` ger v4. Om du har ett befintligt projekt med Zod v3 och vill använda v4 parallellt, eller om v3 fortfarande är default i ditt lockfile, använd `from 'zod/v4'` istället.

---

## Grundläggande Schemas

### Primitiva typer

```typescript
import { z } from 'zod'

// Primitiver
const stringSchema = z.string()
const numberSchema = z.number()
const booleanSchema = z.boolean()
const dateSchema = z.date()
const bigintSchema = z.bigint()

// Literals
const literalSchema = z.literal('active')

// Enums
const statusSchema = z.enum(['pending', 'active', 'completed'])

// Nullable & Optional
const nullableString = z.string().nullable()    // string | null
const optionalString = z.string().optional()    // string | undefined
const nullishString = z.string().nullish()      // string | null | undefined
```

### String-validering

```typescript
const emailSchema = z.string()
  .email('Ogiltig e-postadress')
  .min(5, 'Minst 5 tecken')
  .max(100, 'Max 100 tecken')

const urlSchema = z.string().url()
const uuidSchema = z.string().uuid()
const emojiSchema = z.string().emoji()
const datetimeSchema = z.string().datetime()

// Regex
const slugSchema = z.string().regex(/^[a-z0-9-]+$/, 'Ogiltigt slug-format')

// Transformera
const trimmedSchema = z.string().trim()
const lowercaseSchema = z.string().toLowerCase()
```

### Number-validering

```typescript
const ageSchema = z.number()
  .int('Måste vara heltal')
  .min(0, 'Måste vara positiv')
  .max(150, 'Ogiltigt värde')

const priceSchema = z.number()
  .positive()
  .multipleOf(0.01)  // Två decimaler

const percentSchema = z.number().min(0).max(100)
```

### Coercion (automatisk typkonvertering)

```typescript
// Konverterar automatiskt från FormData/query strings
const coercedNumber = z.coerce.number()  // "42" → 42
const coercedDate = z.coerce.date()      // "2026-01-19" → Date
const coercedBoolean = z.coerce.boolean() // "true" → true

// Nytt i Zod 4: stringbool för strängbooleaner
const stringBool = z.stringbool()  // "yes", "true", "1" → true
```

---

## Objekt-schemas

### Grundläggande objekt

```typescript
const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
})

// TypeScript-typ extraheras automatiskt
type User = z.infer<typeof userSchema>
// { id: string; name: string; email: string; age?: number }
```

### Strikt vs Lös validering

```typescript
// Standard: ignorerar okända fält
const standardObject = z.object({ name: z.string() })

// Strict: kastar fel vid okända fält
const strictObject = z.strictObject({ name: z.string() })

// Loose: tillåter och bevarar okända fält
const looseObject = z.looseObject({ name: z.string() })

// Passthrough: explicit tillåt extra fält
const passthroughObject = z.object({ name: z.string() }).passthrough()

// Strip: ta bort okända fält (default beteende, explicit)
const strippedObject = z.object({ name: z.string() }).strip()
```

### Modifiera schemas

```typescript
const baseUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
})

// Partial - alla fält blir optional
const updateUser = baseUser.partial()

// Pick - välj specifika fält
const userCredentials = baseUser.pick({ email: true })

// Omit - uteslut fält
const publicUser = baseUser.omit({ role: true })

// Extend - lägg till fält
const userWithMeta = baseUser.extend({
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Merge - kombinera två schemas
const combined = schema1.merge(schema2)
```

---

## Arrays & Tuples

```typescript
// Arrays
const tagsSchema = z.array(z.string())
  .min(1, 'Minst en tagg krävs')
  .max(10, 'Max 10 taggar')

// Nonempty - garanterar minst ett element
const nonEmptyTags = z.array(z.string()).nonempty()
// Infererad typ: [string, ...string[]]

// Tuples - fast längd och typer per position
const coordinatesSchema = z.tuple([
  z.number(),  // latitude
  z.number(),  // longitude
])

// Tuple med rest-element
const argsSchema = z.tuple([z.string()]).rest(z.number())
// [string, ...number[]]
```

---

## Unions & Discriminated Unions

```typescript
// Enkel union
const stringOrNumber = z.union([z.string(), z.number()])

// Shorthand
const stringOrNumber2 = z.string().or(z.number())

// Discriminated union (mer effektiv)
const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('click'),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    type: z.literal('keypress'),
    key: z.string(),
  }),
  z.object({
    type: z.literal('scroll'),
    direction: z.enum(['up', 'down']),
  }),
])

// Nytt i Zod 4: z.xor() - exklusiv union (exakt en match)
const exclusiveUnion = z.xor([
  z.object({ email: z.string().email() }),
  z.object({ phone: z.string() }),
])
// Fel om båda eller ingen matchar
```

---

## Refinements & Transforms

### Custom validering

```typescript
// Enkel refinement
const passwordSchema = z.string()
  .min(8)
  .refine(
    (val) => /[A-Z]/.test(val),
    { message: 'Måste innehålla minst en stor bokstav' }
  )
  .refine(
    (val) => /[0-9]/.test(val),
    { message: 'Måste innehålla minst en siffra' }
  )

// SuperRefine för flera fel
const formSchema = z.object({
  password: z.string(),
  confirmPassword: z.string(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Lösenorden matchar inte',
      path: ['confirmPassword'],
    })
  }
})
```

### Transforms

```typescript
// Transformera värden
const trimmedEmail = z.string()
  .email()
  .transform((val) => val.toLowerCase().trim())

// Parse och transformera
const userInput = z.object({
  birthday: z.string().transform((val) => new Date(val)),
  tags: z.string().transform((val) => val.split(',').map(t => t.trim())),
})

// Pipe - kedja schemas
const numberFromString = z.string()
  .transform((val) => parseInt(val, 10))
  .pipe(z.number().positive())
```

### Codecs (Nytt i Zod 4)

```typescript
// Bidirektionell transformation
const dateCodec = z.codec(
  z.iso.date(),  // decode: string → Date
  z.string(),    // encode: Date → string
)

// Användning
const decoded = dateCodec.parse('2026-01-19')  // Date
const encoded = dateCodec.serialize(new Date()) // '2026-01-19'
```

---

## Validering med Next.js Server Actions

### Grundläggande Server Action

```typescript
// actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const createPostSchema = z.object({
  title: z.string()
    .min(1, 'Titel krävs')
    .max(100, 'Titel får max vara 100 tecken'),
  content: z.string()
    .min(10, 'Innehåll måste vara minst 10 tecken'),
  published: z.boolean().default(false),  // OBS: Undvik .default() i schemas som används med React Hook Form, se varning nedan
})

export async function createPost(formData: FormData) {
  const result = createPostSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
    published: formData.get('published') === 'true',
  })

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    }
  }

  await db.posts.create({ data: result.data })
  revalidatePath('/posts')

  return { success: true }
}
```

### Med autentisering

```typescript
'use server'

import { z } from 'zod'
import { auth } from '@/lib/auth'

const updateProfileSchema = z.object({
  name: z.string().min(1).max(50),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal('')),
})

export async function updateProfile(formData: FormData) {
  // 1. Autentisering
  const session = await auth()
  if (!session?.user) {
    return { success: false, error: 'Unauthorized' }
  }

  // 2. Validering
  const result = updateProfileSchema.safeParse({
    name: formData.get('name'),
    bio: formData.get('bio'),
    website: formData.get('website'),
  })

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    }
  }

  // 3. Uppdatera
  await db.users.update({
    where: { id: session.user.id },
    data: result.data,
  })

  return { success: true }
}
```

### Returnera formaterade fel

```typescript
'use server'

import { z } from 'zod'

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> }

export async function submitForm(formData: FormData): Promise<ActionResult> {
  const result = schema.safeParse(Object.fromEntries(formData))

  if (!result.success) {
    // Nytt i Zod 4: prettifyError
    console.log(z.prettifyError(result.error))

    return {
      success: false,
      errors: result.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  // ... logik

  return { success: true, data: undefined }
}
```

---

## Integration med React Hook Form

### Installation

```bash
npm install react-hook-form @hookform/resolvers
```

### Varning: `.default()` och React Hook Form

> **OBS:** Undvik `.default()` i Zod-schemas som används med `zodResolver`. `.default()` gör att Zod:s **input-typ** blir `T | undefined` medan **output-typen** blir `T`. Eftersom `zodResolver` använder input-typen för formulärvalidering, och `z.infer` (som är output-typen) används för `useForm<T>`, uppstår en typkonflikt.
>
> Exempelvis ger `z.boolean().default(false)` input-typen `boolean | undefined` men output-typen `boolean`. TypeScript klagar då på att formulärets typer inte matchar.
>
> **Lösning:** Sätt defaults i `useForm({ defaultValues: { ... } })` istället för i schemat.

```typescript
// Fel: Skapar typkonflikt med zodResolver
const schema = z.object({
  published: z.boolean().default(false),
})

// Rätt: Sätt default i useForm istället
const schema = z.object({
  published: z.boolean(),
})

useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema),
  defaultValues: { published: false },
})
```

### Grundläggande användning

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const formSchema = z.object({
  email: z.string().email('Ogiltig e-postadress'),
  password: z.string().min(8, 'Minst 8 tecken'),
})

type FormData = z.infer<typeof formSchema>

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  const onSubmit = async (data: FormData) => {
    // data är typat och validerat
    await signIn(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input {...register('email')} placeholder="E-post" />
        {errors.email && <span>{errors.email.message}</span>}
      </div>

      <div>
        <input {...register('password')} type="password" />
        {errors.password && <span>{errors.password.message}</span>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Loggar in...' : 'Logga in'}
      </button>
    </form>
  )
}
```

### Med Server Action

```typescript
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createPost } from './actions'

const schema = z.object({
  title: z.string().min(1, 'Titel krävs'),
  content: z.string().min(10, 'Minst 10 tecken'),
})

type FormData = z.infer<typeof schema>

export function CreatePostForm() {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value)
    })

    const result = await createPost(formData)

    if (!result.success && result.errors) {
      // Mappa server-fel till formuläret
      Object.entries(result.errors).forEach(([field, messages]) => {
        setError(field as keyof FormData, {
          message: messages?.[0],
        })
      })
      return
    }

    reset()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* ... fält */}
    </form>
  )
}
```

---

## Exempel

### Environment Variables

```typescript
// env.ts
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DEBUG: z.stringbool().default(false),
})

export const env = envSchema.parse(process.env)
```

### API Response Validering

```typescript
const apiResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
  pagination: z.object({
    page: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
  }),
})

async function fetchUsers() {
  const response = await fetch('/api/users')
  const json = await response.json()

  // Validera och typa svaret
  return apiResponseSchema.parse(json)
}
```

### Form med fil-uppladdning

```typescript
const fileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size < 5_000_000, 'Max 5MB')
    .refine(
      (f) => ['image/jpeg', 'image/png'].includes(f.type),
      'Endast JPEG och PNG'
    ),
})

// I Server Action
export async function uploadFile(formData: FormData) {
  const file = formData.get('file')

  const result = fileSchema.safeParse({ file })
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors }
  }

  // Spara filen...
}
```

### Conditional Fields

```typescript
const paymentSchema = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('card'),
    cardNumber: z.string().regex(/^\d{16}$/),
    cvv: z.string().regex(/^\d{3,4}$/),
    expiryDate: z.string(),
  }),
  z.object({
    method: z.literal('paypal'),
    email: z.string().email(),
  }),
  z.object({
    method: z.literal('invoice'),
    companyName: z.string().min(1),
    orgNumber: z.string().regex(/^\d{6}-\d{4}$/),
  }),
])
```

### Recursive Types

```typescript
interface Category {
  name: string
  children: Category[]
}

const categorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.array(categorySchema),
  })
)
```

---

## TypeScript Inference

### Extrahera typer från schemas

```typescript
const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
})

// Input-typ (vad som accepteras)
type UserInput = z.input<typeof userSchema>

// Output-typ (vad som returneras efter validering/transform)
type User = z.output<typeof userSchema>
// Samma som: z.infer<typeof userSchema>
```

### Med transforms

```typescript
const schema = z.object({
  createdAt: z.string().transform((s) => new Date(s)),
})

type Input = z.input<typeof schema>
// { createdAt: string }

type Output = z.output<typeof schema>
// { createdAt: Date }
```

### Generiska schemas

```typescript
function createPaginatedSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number(),
    totalPages: z.number(),
  })
}

const paginatedUsers = createPaginatedSchema(userSchema)
type PaginatedUsers = z.infer<typeof paginatedUsers>
```

---

## Error Handling

### SafeParse vs Parse

```typescript
// parse() - kastar ZodError vid fel
try {
  const user = userSchema.parse(input)
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log(error.issues)
  }
}

// safeParse() - returnerar result-objekt (rekommenderat)
const result = userSchema.safeParse(input)

if (result.success) {
  console.log(result.data)  // Validerad data
} else {
  console.log(result.error.issues)  // Fel-lista
}
```

### Formatera fel

```typescript
const result = schema.safeParse(input)

if (!result.success) {
  // flatten() - gruppera efter fält
  const flattened = result.error.flatten()
  // {
  //   formErrors: string[],
  //   fieldErrors: { [field]: string[] }
  // }

  // format() - nästlad struktur
  const formatted = result.error.format()
  // { _errors: [], email: { _errors: ['Invalid'] } }

  // Nytt i Zod 4: prettifyError() - läsbar sträng
  const pretty = z.prettifyError(result.error)
  // "email: Invalid email address"
}
```

### Custom error messages

```typescript
const schema = z.object({
  email: z.string({
    required_error: 'E-post krävs',
    invalid_type_error: 'E-post måste vara text',
  }).email({
    message: 'Ogiltig e-postadress',
  }),
})

// Global error map
z.setErrorMap((issue, ctx) => {
  if (issue.code === z.ZodIssueCode.too_small) {
    return { message: `Minst ${issue.minimum} tecken krävs` }
  }
  return { message: ctx.defaultError }
})
```

---

## Zod 4 - Nya Features

### Prestandaförbättringar

- **14x snabbare** string-parsing
- **7x snabbare** array-parsing
- **6.5x snabbare** object-parsing
- **57% mindre** bundle-storlek
- **20x färre** TypeScript-instantieringar

### @zod/mini

För prestandakritiska miljöer (edge, serverless):

```typescript
import { z } from '@zod/mini'

// Samma API, ~1.9 KB gzipped
const schema = z.object({
  name: z.string(),
})
```

### Schema Registry & Metadata

```typescript
import { z } from 'zod'

// Registrera metadata för schemas
const registry = z.registry<{ description: string }>()

const emailSchema = z.string().email()
registry.register(emailSchema, {
  description: 'Användarens e-postadress',
})

// Hämta metadata
const meta = registry.get(emailSchema)
// { description: 'Användarens e-postadress' }
```

### JSON Schema Import (v4.3+)

```typescript
import { z } from 'zod'

// Konvertera JSON Schema till Zod
const zodSchema = z.fromJsonSchema({
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
  required: ['name'],
})
```

---

## Referenser

- [Zod Dokumentation](https://zod.dev/)
- [Zod 4 Release Notes](https://zod.dev/v4)
- [Zod Migration Guide v3 → v4](https://zod.dev/v4/changelog)
- [React Hook Form + Zod](https://react-hook-form.com/get-started#SchemaValidation)
- [GitHub: colinhacks/zod](https://github.com/colinhacks/zod)
