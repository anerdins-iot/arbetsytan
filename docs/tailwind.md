---
title: Tailwind CSS v4
description: Komplett guide för Tailwind CSS v4 - CSS-first konfiguration, breaking changes från v3, och Next.js integration
tags: [tailwind, css, styling, nextjs, frontend]
---

## KRITISKT - Tailwind v4 vs v3

> ⚠️ **VIKTIGT:** Tailwind CSS v4 har helt ny syntax. Följande v3-mönster är **FÖRÅLDRADE och ska ALDRIG användas**:

| Föråldrat (v3) | Korrekt (v4) |
|----------------|--------------|
| `tailwind.config.js` | CSS med `@theme { }` |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| `@apply` | **⛔ ANVÄND ALDRIG** (Se sektion 9) |
| `module.exports = { theme: {...} }` | `@theme { --color-*: ... }` |

```css
/* ❌ ANVÄND ALDRIG - Detta är v3-syntax */
@tailwind base;
@tailwind components;
@tailwind utilities;

.btn { @apply px-4 py-2 bg-blue-500; }

/* ✅ KORREKT v4-syntax */
@import "tailwindcss";

@theme {
  --color-brand: #3b82f6;
}

@utility btn {
  padding: var(--spacing-2) var(--spacing-4);
  background: var(--color-brand);
}
```

---

## Översikt

Tailwind CSS v4.0 släpptes i januari 2025 och representerar en helt ny version av ramverket:

- **5x snabbare** full builds
- **100x snabbare** inkrementella builds (mikrosekunder)
- **CSS-first konfiguration** - inget behov av `tailwind.config.js`
- **Automatisk content detection** - inga sökvägar att konfigurera
- **Moderna CSS-features** - cascade layers, `@property`, `color-mix()`

### Webbläsarstöd

Tailwind v4 kräver moderna webbläsare:
- Safari 16.4+
- Chrome 111+
- Firefox 128+

> ⚠️ Om du behöver stödja äldre webbläsare, använd v3.4 tills vidare.

---

## Breaking Changes från v3

### 1. Konfigurationssystemet

Den största förändringen är hur konfiguration fungerar. Istället för JavaScript definierar du nu ditt designsystem i CSS.

```css
/* ❌ Gammalt (v3) - tailwind.config.js */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: '#3b82f6',
      },
    },
  },
}

/* ✅ Nytt (v4) - globals.css */
@import "tailwindcss";

@theme {
  --color-brand: #3b82f6;
}
```

### 2. Import-syntax

```css
/* ❌ Gammalt (v3) */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ✅ Nytt (v4) */
@import "tailwindcss";
```

### 3. Borttagna/Omdöpta utilities

| v3 | v4 |
|----|-----|
| `decoration-slice` | `box-decoration-slice` |
| `decoration-clone` | `box-decoration-clone` |
| `filter` | Borttaget (behövs ej) |
| `backdrop-filter` | Borttaget (behövs ej) |

### 4. Gradient-beteende

I v3 "nollställdes" gradienter vid variant-override. I v4 bevaras värdena:

```html
<!-- I v4 måste du explicit ta bort via-färgen -->
<div class="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500
            hover:via-none">
</div>
```

### 5. Container-utility

Container-konfigurationen (`center`, `padding`) finns inte längre. Använd `@utility`:

```css
@utility container {
  margin-inline: auto;
  padding-inline: 1rem;
  max-width: 80rem;
}
```

### 6. Border/Divide standardfärger

I v3 använde `border-*` och `divide-*` automatiskt `gray-200`. I v4 måste färg specificeras explicit.

### 7. Arbitrary values med komma

Understreck (`_`) måste nu användas istället för komma i arbitrary values:

```html
<!-- ❌ v3 syntax -->
<div class="grid-cols-[1fr,2fr,1fr]">

<!-- ✅ v4 syntax -->
<div class="grid-cols-[1fr_2fr_1fr]">
```

### 8. Transition-ändringar

`transition-transform` inkluderar nu 4 properties: `transform`, `translate`, `scale`, `rotate`.

`transition` och `transition-colors` inkluderar nu `outline-color`.

### 9. @apply är Deprecated - ANVÄND INTE ⛔

> [!CAUTION]
> **ANVÄND ALDRIG `@apply` i nya projekt.** Det är deprecated, prestandamässigt sämre och kommer att tas bort helt i framtida versioner. Detta gäller särskilt i `@layer base`.

Använd `@utility` eller rena CSS-variabler istället.

#### Migration av Base Layer

**❌ FEL (Tailwind v3-mönster - UNDVIK):**
```css
@layer base {
  body {
    @apply bg-white text-gray-900;
  }
  h1, h2, h3 {
    @apply font-bold;
  }
}
```

**✅ RÄTT (Tailwind v4 - REKOMMENDERAT):**
```css
@layer base {
  body {
    background: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }
  h1, h2, h3 {
    font-weight: 700;
  }
}
```

#### Migration av Komponenter

**❌ FEL (v3 syntax):**
```css
/* Deprecated - undvik @apply */
.btn {
  @apply px-4 py-2 bg-blue-500 text-white rounded;
}
```

**✅ RÄTT (v4 syntax):**
```css
/* Använd @utility istället */
@utility btn {
  padding: var(--spacing-2) var(--spacing-4);
  background: var(--color-blue-500);
  color: white;
  border-radius: var(--radius-md);
}

/* Eller använd CSS-variabler direkt */
.btn {
  padding: var(--spacing-2) var(--spacing-4);
  background: var(--color-blue-500);
  color: white;
  border-radius: var(--radius-md);
}
```

**Varför?** `@apply` skapar oförutsägbar CSS-ordning, gör build-processen långsammare och går emot Tailwinds moderna utility-first filosofi. `@utility` ger bättre kontroll och integrerar korrekt med Tailwinds layer-system.

---

## Nya Features i v4

### @theme Directive

Definiera design tokens som genererar utility-klasser:

```css
@import "tailwindcss";

@theme {
  /* Färger */
  --color-brand: #3b82f6;
  --color-brand-dark: #1d4ed8;

  /* Spacing */
  --spacing-18: 4.5rem;

  /* Fonts */
  --font-display: "Cal Sans", sans-serif;

  /* Border radius */
  --radius-pill: 9999px;
}
```

Nu kan du använda: `bg-brand`, `text-brand-dark`, `p-18`, `font-display`, `rounded-pill`.

### @utility Directive

Skapa egna utility-klasser:

```css
@utility text-gradient {
  background: linear-gradient(to right, var(--color-brand), var(--color-brand-dark));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Med dynamiska värden */
@utility grid-cols-auto-fill-* {
  grid-template-columns: repeat(auto-fill, minmax(--value(*, 200px), 1fr));
}
```

### 3D Transform Utilities

```html
<div class="rotate-x-45 rotate-y-30 perspective-500">
  3D transformerad
</div>
```

### Utökade Gradient APIs

```html
<!-- Radiell gradient -->
<div class="bg-radial from-blue-500 to-transparent">

<!-- Konisk gradient -->
<div class="bg-conic from-red-500 via-yellow-500 to-red-500">
```

### @starting-style Variant

Enter/exit-animationer utan JavaScript:

```html
<div class="opacity-100 starting:opacity-0 transition-opacity">
  Fade in vid mount
</div>
```

### not-* Variant

```html
<div class="not-hover:opacity-50">
  Tonad när inte hovrad
</div>
```

### nth-* Variants

```html
<li class="nth-odd:bg-gray-100 nth-even:bg-white">
```

### in-* Variant

Som `group-*` men utan att behöva `group` klassen:

```html
<div class="in-hover:scale-105">
  <!-- Skalas när någon förälder hovras -->
</div>
```

### Inbyggda Container Queries

Inget plugin behövs längre:

```html
<div class="@container">
  <div class="@sm:flex @lg:grid">
    Responsiv baserat på container
  </div>
</div>
```

---

## v4.1 Features

### Text Shadow Utilities

```html
<!-- Storlekar: 2xs, xs, sm, DEFAULT, md, lg -->
<h1 class="text-shadow-lg">Stor skugga</h1>
<h2 class="text-shadow">Normal skugga</h2>
<p class="text-shadow-sm">Liten skugga</p>

<!-- Färgad skugga -->
<h1 class="text-shadow-lg text-shadow-blue-500">Blå skugga</h1>

<!-- Med opacity -->
<h1 class="text-shadow-lg/50">50% opacity</h1>
```

### Mask Utilities

```html
<!-- Edge masks -->
<div class="mask-t-from-50">Tonar från toppen vid 50%</div>
<div class="mask-b-to-80">Tonar till botten vid 80%</div>

<!-- Radiella masks -->
<div class="mask-radial-from-50">Radiell mask</div>

<!-- Kombinera -->
<img class="mask-b-from-80 mask-l-from-20" src="..." />
```

### Colored Drop Shadows

```html
<div class="drop-shadow-lg drop-shadow-indigo-500">
  Färgad drop shadow
</div>

<div class="drop-shadow-cyan-500/50">
  Med opacity
</div>
```

### Pointer-baserade Variants

```html
<!-- Endast för mus/trackpad (fine pointer) -->
<button class="pointer-fine:hover:scale-105">

<!-- Endast för touch (coarse pointer) -->
<button class="pointer-coarse:active:scale-95">
```

### Nya Variants

```html
<noscript class="noscript:block hidden">JS disabled</noscript>

<input class="user-valid:border-green-500" />

<div class="inverted-colors:invert">
  Anpassar sig till inverted color mode
</div>
```

### @source inline()

Tvinga Tailwind att inkludera klasser som inte finns i källkoden:

```css
@source inline("bg-red-500 bg-blue-500 bg-green-500");
```

---

## Next.js Integration

### Installation (Nytt projekt)

```bash
npx create-next-app@latest my-app --ts --tailwind --eslint --app
```

### Installation (Befintligt projekt)

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

> ⚠️ **Viktigt:** Tailwind CSS, `@tailwindcss/postcss` och `postcss` behövs vid build-time (de kompilerar CSS under `next build`). Om projektet byggs i Docker med `NODE_ENV=production` eller `npm ci --omit=dev`, installeras **inte** `devDependencies`. Se därför till att dessa paket installeras som `dependencies`.

**postcss.config.mjs:**
```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

**app/globals.css:**
```css
@import "tailwindcss";
```

**app/layout.tsx:**
```typescript
import "./globals.css"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  )
}
```

### Dark Mode med Next.js

```css
/* globals.css */
@import "tailwindcss";

@theme {
  --color-background: #ffffff;
  --color-foreground: #0a0a0a;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0a0a0a;
    --color-foreground: #ffffff;
  }
}
```

```html
<body class="bg-background text-foreground">
```

### Med class-baserad Dark Mode

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

```typescript
// next-themes integration
import { ThemeProvider } from "next-themes"

export default function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      {children}
    </ThemeProvider>
  )
}
```

---

## Migrering från v3

### Automatiskt Upgrade Tool

```bash
# Kräver Node.js 20+
npx @tailwindcss/upgrade
```

Verktyget hanterar:
- Uppdaterar dependencies
- Migrerar `tailwind.config.js` till CSS
- Uppdaterar template-filer

### Manuell Migrering

1. **Uppdatera dependencies:**
```bash
npm install tailwindcss@latest @tailwindcss/postcss@latest postcss@latest
```

> ⚠️ **Viktigt:** Se till att dessa paket installeras som `dependencies` och inte `devDependencies`, då de krävs under byggprocessen i miljöer som Docker (där `devDependencies` ofta exkluderas).

2. **Uppdatera postcss.config.mjs:**
```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}
```

3. **Migrera CSS:**
```css
/* Ersätt @tailwind directives */
@import "tailwindcss";

/* Migrera theme extensions till @theme */
@theme {
  --color-primary: #your-color;
}
```

4. **Ta bort tailwind.config.js** (om allt är migrerat)

### Behålla JavaScript Config

Om du fortfarande behöver JS-config:

```css
@import "tailwindcss";
@config "./tailwind.config.js";
```

---

## Vanliga Problem

### Klasser fungerar inte

**Problem:** Nya klasser dyker inte upp.

**Lösning:** Kontrollera att Tailwind hittar dina filer. Lägg till explicit:

```css
@source "./src/**/*.{js,ts,jsx,tsx}";
```

### Plugins fungerar inte

Många v3-plugins behövs inte längre:
- `@tailwindcss/container-queries` → Inbyggt
- `@tailwindcss/aspect-ratio` → Inbyggt (`aspect-video`, `aspect-square`)

### Build-fel efter uppgradering

Kör upgrade tool igen eller kontrollera:
1. Node.js 20+ installerat
2. Alla dependencies uppdaterade
3. PostCSS-config korrekt

---

## Referenser

- [Tailwind CSS v4.0 Announcement](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS v4.1 Release](https://tailwindcss.com/blog/tailwindcss-v4-1)
- [Official Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Theme Variables Documentation](https://tailwindcss.com/docs/theme)
- [Functions and Directives](https://tailwindcss.com/docs/functions-and-directives)
- [Next.js Installation Guide](https://tailwindcss.com/docs/guides/nextjs)
- [shadcn/ui Tailwind v4 Guide](https://ui.shadcn.com/docs/tailwind-v4)
