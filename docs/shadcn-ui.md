---
title: shadcn/ui
description: Komponentbibliotek med kopierbara komponenter för React och Next.js
tags: [react, nextjs, tailwind, ui, components, radix]
---

## Vad är shadcn/ui?

shadcn/ui är ett unikt komponentbibliotek där du **kopierar komponentkoden** direkt in i ditt projekt istället för att installera ett npm-paket. Detta ger dig:

- **Full ägarskap** - Koden är din att modifiera
- **Ingen vendor lock-in** - Inga externa beroenden för UI
- **Tillgängliga komponenter** - Byggda på Radix UI primitives
- **Tailwind CSS** - Enkel styling med utility classes

Används av OpenAI, Sonos, Adobe och fler.

---

## Installation med Next.js

### 1. Skapa nytt projekt (rekommenderat)

```bash
npx shadcn@latest init
```

CLI:n auto-detekterar ditt framework och konfigurerar allt automatiskt.

### 2. Lägg till i befintligt projekt

```bash
# Med Tailwind v4 (default)
npx shadcn@latest init

# Med Tailwind v3
npx shadcn@2.3.0 init
```

**OBS:** Med npm och React 19 behöver du `--legacy-peer-deps`:

```bash
npm install --legacy-peer-deps
```

pnpm, yarn och bun hanterar detta automatiskt.

### 3. Lägg till komponenter

```bash
# Lägg till enskilda komponenter
npx shadcn@latest add button
npx shadcn@latest add dialog card form

# Lägg till flera samtidigt
npx shadcn@latest add button dialog card
```

Komponenter installeras till `components/ui/` i ditt projekt.

---

## Visual Styles (Nytt 2025+)

shadcn/ui erbjuder nu 5 visuella stilar att välja mellan vid init:

| Stil | Beskrivning |
|------|-------------|
| **Vega** | Klassisk shadcn/ui-look |
| **Nova** | Kompakt med reducerad padding |
| **Maia** | Mjuk och rundad med generöst spacing |
| **Lyra** | Kantig och skarp, passar mono-fonter |
| **Mira** | Extra kompakt för täta interfaces |

### Component Library Val

Du kan nu välja mellan **Radix** eller **Base UI** som underliggande primitives. CLI:n skriver om komponentkoden för att matcha ditt val.

---

## Viktiga Komponenter

### Button

```typescript
import { Button } from "@/components/ui/button"

// Varianter
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Storlekar
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Icon /></Button>
```

### Dialog

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button>Öppna dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Rubrik</DialogTitle>
      <DialogDescription>
        Beskrivning av dialogen.
      </DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button type="submit">Spara</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Form med React Hook Form & Zod

```typescript
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

const formSchema = z.object({
  username: z.string().min(2, {
    message: "Användarnamn måste vara minst 2 tecken.",
  }),
})

export function ProfileForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Användarnamn</FormLabel>
              <FormControl>
                <Input placeholder="johndoe" {...field} />
              </FormControl>
              <FormDescription>
                Ditt publika användarnamn.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Skicka</Button>
      </form>
    </Form>
  )
}
```

### Card

```typescript
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Projekttitel</CardTitle>
    <CardDescription>Kort beskrivning av projektet.</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Huvudinnehåll här...</p>
  </CardContent>
  <CardFooter>
    <Button>Läs mer</Button>
  </CardFooter>
</Card>
```

### Data Table

```bash
npx shadcn@latest add table
```

```typescript
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Namn</TableHead>
      <TableHead>Status</TableHead>
      <TableHead className="text-right">Belopp</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {invoices.map((invoice) => (
      <TableRow key={invoice.id}>
        <TableCell>{invoice.name}</TableCell>
        <TableCell>{invoice.status}</TableCell>
        <TableCell className="text-right">{invoice.amount}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

---

## Theming & Customization

### CSS-variabler (OKLCH)

shadcn/ui använder CSS-variabler med OKLCH-färgformat. Redigera `globals.css`:

```css
@layer base {
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --radius: 0.5rem;
  }

  .dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --primary: oklch(0.985 0 0);
    --primary-foreground: oklch(0.205 0 0);
    /* ... övriga dark mode-värden */
  }
}
```

### Tailwind v4 Theme Directive

Med Tailwind v4, använd `@theme inline`:

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  /* ... */
}
```

### Anpassa komponenter

Eftersom koden finns i ditt projekt kan du modifiera den direkt:

```typescript
// components/ui/button.tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground...",
        // Lägg till egen variant
        brand: "bg-blue-600 text-white hover:bg-blue-700",
      },
      size: {
        // Lägg till egen storlek
        xl: "h-14 px-8 text-lg",
      },
    },
  }
)
```

---

## Dark Mode Setup

### 1. Installera next-themes

```bash
npm install next-themes
```

### 2. Skapa ThemeProvider

```typescript
// components/theme-provider.tsx
"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

### 3. Lägg till i Root Layout

```typescript
// app/layout.tsx
import { ThemeProvider } from "@/components/theme-provider"

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### 4. Skapa Mode Toggle

```bash
npx shadcn@latest add dropdown-menu
```

```typescript
// components/mode-toggle.tsx
"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Byt tema</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Ljust
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Mörkt
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

---

## Server Components Stöd

shadcn/ui-komponenter fungerar med React Server Components:

| Typ | Komponenter | Server Component? |
|-----|-------------|-------------------|
| **Statiska** | Card, Badge, Separator, Table | ✅ Ja |
| **Interaktiva** | Dialog, Dropdown, Tabs | ❌ Nej (use client) |

Interaktiva komponenter har `"use client"` automatiskt.

---

## CLI-kommandon

```bash
# Initiera projekt
npx shadcn@latest init

# Lägg till komponenter
npx shadcn@latest add [component]

# Lista tillgängliga komponenter
npx shadcn@latest add

# Diff - visa ändringar mot original
npx shadcn@latest diff [component]
```

### Monorepo-stöd

CLI:n har inbyggt monorepo-stöd för att hantera var komponenter installeras och importvägar.

---

## Komponenter Översikt

| Kategori | Komponenter |
|----------|-------------|
| **Layout** | Card, Separator, Aspect Ratio, Resizable |
| **Navigation** | Tabs, Navigation Menu, Breadcrumb, Pagination, Sidebar |
| **Forms** | Button, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Form |
| **Feedback** | Alert, Toast (Sonner), Progress, Skeleton, Spinner |
| **Overlay** | Dialog, Sheet, Drawer, Popover, Tooltip, Hover Card, Alert Dialog |
| **Data** | Table, Data Table, Calendar, Date Picker, Chart |
| **Typography** | Badge, Label, Kbd |

---

## Referenser

- [shadcn/ui Dokumentation](https://ui.shadcn.com/)
- [Installation Next.js](https://ui.shadcn.com/docs/installation/next)
- [Dark Mode](https://ui.shadcn.com/docs/dark-mode/next)
- [Theming](https://ui.shadcn.com/docs/theming)
- [Komponenter](https://ui.shadcn.com/docs/components)
- [Changelog](https://ui.shadcn.com/docs/changelog)
- [GitHub Releases](https://github.com/shadcn-ui/ui/releases)
