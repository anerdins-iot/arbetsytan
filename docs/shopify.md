---
title: Shopify Storefront API
description: Headless commerce med Shopify Storefront API, GraphQL och Next.js-integration
tags: [shopify, ecommerce, graphql, headless, nextjs, hydrogen]
---

## Översikt

Shopify Storefront API är ett GraphQL-baserat API för att bygga headless e-handelslösningar. REST är officiellt legacy sedan 2026 - GraphQL är enda vägen för moderna storefronts.

**API-endpoint:**
```
https://{store-name}.myshopify.com/api/2026-01/graphql.json
```

**Versionering:** Nya versioner släpps fyra gånger per år (2026-01, 2026-04, 2026-07, 2026-10).

---

## Setup

### 1. Skapa Access Token

1. Gå till Shopify Admin → **Sales channels** → **Headless**
2. Klicka **Add storefront**
3. Kopiera din **Storefront Access Token**

> **Begränsning:** Max 100 aktiva storefronts/access tokens per butik.

### 2. Installera Client

```bash
npm install @shopify/storefront-api-client
```

### 3. Konfigurera Client

```typescript
// lib/shopify.ts
import { createStorefrontApiClient } from '@shopify/storefront-api-client'

export const shopify = createStorefrontApiClient({
  storeDomain: 'https://your-store.myshopify.com',
  apiVersion: '2026-01',
  publicAccessToken: process.env.SHOPIFY_STOREFRONT_TOKEN!,
})
```

### Miljövariabler

```bash
# .env.local
SHOPIFY_STOREFRONT_TOKEN=your_storefront_access_token
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
```

---

## GraphQL Queries

### Hämta produkter

```graphql
query GetProducts($first: Int!) {
  products(first: $first) {
    edges {
      node {
        id
        title
        handle
        description
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        images(first: 1) {
          edges {
            node {
              url
              altText
              width
              height
            }
          }
        }
        variants(first: 10) {
          edges {
            node {
              id
              title
              availableForSale
              price {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Hämta enskild produkt

```graphql
query GetProduct($handle: String!) {
  product(handle: $handle) {
    id
    title
    description
    images(first: 10) {
      edges {
        node {
          url
          altText
        }
      }
    }
    variants(first: 100) {
      edges {
        node {
          id
          title
          availableForSale
          selectedOptions {
            name
            value
          }
          price {
            amount
            currencyCode
          }
        }
      }
    }
    options {
      name
      values
    }
  }
}
```

### Hämta collections

```graphql
query GetCollections($first: Int!) {
  collections(first: $first) {
    edges {
      node {
        id
        title
        handle
        description
        image {
          url
          altText
        }
        products(first: 10) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    }
  }
}
```

### Produktrekommendationer

```graphql
query GetRecommendations($productId: ID!) {
  productRecommendations(productId: $productId) {
    id
    title
    handle
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    images(first: 1) {
      edges {
        node {
          url
        }
      }
    }
  }
}
```

### Filtrera produkter i collection

```graphql
query GetFilteredProducts(
  $handle: String!
  $filters: [ProductFilter!]
  $first: Int!
) {
  collection(handle: $handle) {
    products(first: $first, filters: $filters) {
      edges {
        node {
          id
          title
          vendor
          productType
        }
      }
    }
  }
}
```

---

## Cart API

Checkout API är deprecated sedan april 2025. Använd Cart API istället.

### Skapa varukorg

```graphql
mutation CreateCart($input: CartInput!) {
  cartCreate(input: $input) {
    cart {
      id
      checkoutUrl
      lines(first: 10) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Input:**

```typescript
const input = {
  lines: [
    {
      merchandiseId: 'gid://shopify/ProductVariant/123456',
      quantity: 1,
    },
  ],
  buyerIdentity: {
    email: 'customer@example.com',
    countryCode: 'SE',
  },
}
```

### Lägg till produkter

```graphql
mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart {
      id
      lines(first: 10) {
        edges {
          node {
            id
            quantity
            merchandise {
              ... on ProductVariant {
                id
                title
              }
            }
          }
        }
      }
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### Uppdatera kvantitet

```graphql
mutation UpdateCartLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart {
      id
      lines(first: 10) {
        edges {
          node {
            id
            quantity
          }
        }
      }
      cost {
        totalAmount {
          amount
          currencyCode
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### Ta bort produkter

```graphql
mutation RemoveFromCart($cartId: ID!, $lineIds: [ID!]!) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart {
      id
      lines(first: 10) {
        edges {
          node {
            id
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

### Hämta varukorg

```graphql
query GetCart($cartId: ID!) {
  cart(id: $cartId) {
    id
    checkoutUrl
    totalQuantity
    lines(first: 100) {
      edges {
        node {
          id
          quantity
          merchandise {
            ... on ProductVariant {
              id
              title
              image {
                url
              }
              price {
                amount
                currencyCode
              }
              product {
                title
                handle
              }
            }
          }
        }
      }
    }
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
      totalTaxAmount {
        amount
        currencyCode
      }
      totalAmount {
        amount
        currencyCode
      }
    }
  }
}
```

---

## Checkout Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  cartCreate │ ──► │ cartLines   │ ──► │ checkoutUrl │
│             │     │ Add/Update  │     │  redirect   │
└─────────────┘     └─────────────┘     └─────────────┘
```

1. **Skapa cart** med `cartCreate` mutation
2. **Hantera linjer** med `cartLinesAdd`, `cartLinesUpdate`, `cartLinesRemove`
3. **Redirect till checkout** via `cart.checkoutUrl`

```typescript
// Redirect till Shopify Checkout
function proceedToCheckout(checkoutUrl: string) {
  window.location.href = checkoutUrl
}
```

---

## Webhooks

### Skapa webhook via Admin

1. Gå till **Settings** → **Notifications** → **Webhooks**
2. Klicka **Create webhook**
3. Välj event och format (JSON/XML)
4. Ange endpoint-URL

### Viktiga events

| Event | Beskrivning |
|-------|-------------|
| `orders/create` | Ny order skapad |
| `orders/paid` | Order betald |
| `orders/fulfilled` | Order skickad |
| `fulfillments/create` | Fulfillment skapad |
| `products/create` | Ny produkt |
| `products/update` | Produkt uppdaterad |
| `inventory_levels/update` | Lagersaldo ändrat |
| `customers/create` | Ny kund |

### Webhook-handler (Next.js)

```typescript
// app/api/webhooks/shopify/route.ts
import crypto from 'crypto'
import { headers } from 'next/headers'

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET!

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()

  // Verifiera HMAC
  const hmacHeader = headersList.get('x-shopify-hmac-sha256')
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64')

  if (hash !== hmacHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  const topic = headersList.get('x-shopify-topic')
  const data = JSON.parse(body)

  // Hantera duplicate events
  const eventId = headersList.get('x-shopify-event-id')
  // Spara eventId och kontrollera om det redan hanterats

  switch (topic) {
    case 'orders/create':
      await handleNewOrder(data)
      break
    case 'orders/fulfilled':
      await handleOrderFulfilled(data)
      break
    case 'products/update':
      await handleProductUpdate(data)
      break
  }

  // Svara inom 5 sekunder!
  return new Response('OK', { status: 200 })
}

async function handleNewOrder(order: any) {
  // Processa ordern asynkront
  // Lägg i kö för tung bearbetning
}
```

---

## Next.js Integration

### Med @shopify/hydrogen-react

```bash
npm install @shopify/hydrogen-react
```

```typescript
// app/providers.tsx
'use client'

import { ShopifyProvider, CartProvider } from '@shopify/hydrogen-react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ShopifyProvider
      storeDomain={process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN!}
      storefrontToken={process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN!}
      storefrontApiVersion="2026-01"
      countryIsoCode="SE"
      languageIsoCode="SV"
    >
      <CartProvider>{children}</CartProvider>
    </ShopifyProvider>
  )
}
```

```typescript
// app/layout.tsx
import { Providers } from './providers'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Cart Hook

```typescript
'use client'

import { useCart } from '@shopify/hydrogen-react'

export function AddToCartButton({ variantId }: { variantId: string }) {
  const { linesAdd, status } = useCart()

  const handleAdd = () => {
    linesAdd([
      {
        merchandiseId: variantId,
        quantity: 1,
      },
    ])
  }

  return (
    <button onClick={handleAdd} disabled={status === 'creating'}>
      {status === 'creating' ? 'Lägger till...' : 'Lägg i varukorg'}
    </button>
  )
}
```

### Server Component för produkter

```typescript
// app/products/page.tsx
import { shopify } from '@/lib/shopify'

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 1) {
            edges {
              node {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`

export default async function ProductsPage() {
  const { data } = await shopify.request(PRODUCTS_QUERY, {
    variables: { first: 20 },
  })

  return (
    <div className="grid grid-cols-3 gap-4">
      {data.products.edges.map(({ node }: any) => (
        <ProductCard key={node.id} product={node} />
      ))}
    </div>
  )
}
```

### Produktsida med ISR

```typescript
// app/products/[handle]/page.tsx
import { shopify } from '@/lib/shopify'
import { notFound } from 'next/navigation'

const PRODUCT_QUERY = `
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      id
      title
      description
      variants(first: 100) {
        edges {
          node {
            id
            title
            availableForSale
            price {
              amount
              currencyCode
            }
          }
        }
      }
      images(first: 10) {
        edges {
          node {
            url
            altText
          }
        }
      }
    }
  }
`

export async function generateStaticParams() {
  const { data } = await shopify.request(`
    query {
      products(first: 100) {
        edges {
          node {
            handle
          }
        }
      }
    }
  `)

  return data.products.edges.map(({ node }: any) => ({
    handle: node.handle,
  }))
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params

  const { data } = await shopify.request(PRODUCT_QUERY, {
    variables: { handle },
  })

  if (!data.product) {
    notFound()
  }

  return <ProductDetails product={data.product} />
}
```

---

## Hydrogen Framework

Shopify Hydrogen är ett React-baserat framework byggt på React Router, optimerat för Shopify.

### När välja Hydrogen?

- Shopify är din långsiktiga plattform (3-5 år)
- Du vill ha snabb time-to-market
- Du vill använda Oxygen (Shopifys hosting, inkluderat i planen)
- DTC-varumärke med fokus på Shopify-features

### När välja Next.js?

- Du behöver composable stack (Shopify + CMS + PIM + Search)
- Du har stora produktkataloger (ISR/PPR)
- Du vill undvika vendor lock-in
- Du redan använder Vercel

### Hydrogen 2026 Features

- **Storefront MCP** - AI-agenter direkt i din storefront
- **React Router** - Senaste versionen med nested routes
- **Optimistic UI** - Snabba uppdateringar utan väntan
- **Oxygen hosting** - Global edge hosting inkluderat

---

## Vanliga Problem

### Rate Limits

Cart API har inga hårda rate limits, men har inbyggt bot-skydd.

### Tokenless vs Token Requests

| Typ | Complexity Limit | Användning |
|-----|-----------------|------------|
| Tokenless | 1,000 | Enkel read-only |
| Token | Högre | Full funktionalitet |

### Checkout API Migration

```typescript
// ❌ Gammalt (deprecated)
checkoutCreate(input: {...})

// ✅ Nytt
cartCreate(input: {...})
// Använd cart.checkoutUrl för redirect
```

---

## Referenser

- [Shopify Storefront API](https://shopify.dev/docs/api/storefront/latest)
- [Storefront API Learning Kit](https://github.com/Shopify/storefront-api-learning-kit)
- [Hydrogen Framework](https://hydrogen.shopify.dev)
- [Hydrogen React](https://shopify.dev/docs/api/hydrogen-react)
- [Vercel + Shopify Guide](https://vercel.com/guides/building-ecommerce-sites-with-next-js-and-shopify)
- [Next.js Commerce](https://github.com/vercel/commerce)
- [Shopify Webhooks](https://shopify.dev/docs/apps/build/webhooks)
