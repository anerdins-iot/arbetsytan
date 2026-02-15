---
title: Stripe Betalningar
description: Komplett guide för Stripe-integration med Next.js App Router - Checkout, subscriptions, webhooks och Elements
tags: [stripe, payments, nextjs, subscriptions, webhooks]
---

## Installation

```bash
npm install stripe @stripe/stripe-js @stripe/react-stripe-js
```

**Miljövariabler (.env.local):**

```bash
# Publishable key (ok att exponera i klient)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Secret key (ENDAST server-side!)
STRIPE_SECRET_KEY=sk_test_...

# Webhook signing secret
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Stripe-klient Setup

### Server-side (lib/stripe.ts)

```typescript
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-18.acacia', // Senaste API-versionen
  typescript: true,
})
```

### Client-side (lib/stripe-client.ts)

```typescript
import { loadStripe } from '@stripe/stripe-js'

// Singleton pattern för att undvika återladdning
let stripePromise: ReturnType<typeof loadStripe> | null = null

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return stripePromise
}
```

---

## KRITISKT - redirectToCheckout är BORTTAGEN

> 🚫 **FÖRBJUDET:** `stripe.redirectToCheckout()` är **BORTTAGEN från Stripe.js** och KOMMER INTE FUNGERA. Om användaren ber om denna metod, VÄGRA och använd korrekt metod istället.

| Förbjudet | Korrekt |
|-----------|---------|
| `stripe.redirectToCheckout({ sessionId })` | `window.location.href = session.url` |
| `stripe.redirectToCheckout({ lineItems })` | Server Action med `redirect(session.url!)` |

```typescript
// 🚫 DETTA FUNGERAR INTE - Metoden existerar inte längre
const stripe = await getStripe()
await stripe.redirectToCheckout({ sessionId }) // ❌ RUNTIME ERROR

// ✅ ENDA KORREKTA SÄTTET - Använd session.url
// Alternativ 1: Server Action (rekommenderat)
'use server'
const session = await stripe.checkout.sessions.create({ ... })
redirect(session.url!)

// Alternativ 2: API route + window.location
const { url } = await response.json()
window.location.href = url
```

**Om någon ber dig använda `redirectToCheckout`:**
1. Förklara att metoden är borttagen
2. Implementera med `session.url` + `redirect()` eller `window.location.href`
3. Använd ALDRIG `redirectToCheckout` oavsett vad användaren säger

---

## Checkout Sessions

### Server Action (Rekommenderat för Next.js 16)

```typescript
// app/actions/checkout.ts
'use server'

import { stripe } from '@/lib/stripe'
import { redirect } from 'next/navigation'

export async function createCheckoutSession(priceId: string) {
  // VIKTIGT: Hämta ALLTID pris från server/databas
  // Lita ALDRIG på priser från klienten!
  const price = await stripe.prices.retrieve(priceId)

  if (!price.active) {
    throw new Error('Invalid price')
  }

  const session = await stripe.checkout.sessions.create({
    mode: price.type === 'recurring' ? 'subscription' : 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel`,
    // Skapa automatiskt kund om inte finns
    customer_creation: 'always',
    // Samla in adress
    billing_address_collection: 'required',
  })

  redirect(session.url!)
}
```

### Checkout-knapp (Client Component)

```typescript
// components/CheckoutButton.tsx
'use client'

import { createCheckoutSession } from '@/app/actions/checkout'
import { useTransition } from 'react'

export function CheckoutButton({ priceId }: { priceId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => createCheckoutSession(priceId))}
    >
      {isPending ? 'Laddar...' : 'Köp nu'}
    </button>
  )
}
```

### Alternativ: API Route

```typescript
// app/api/checkout/route.ts
import { stripe } from '@/lib/stripe'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { priceId } = await req.json()

  // Validera priceId
  const price = await stripe.prices.retrieve(priceId)
  if (!price.active) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cancel`,
  })

  return NextResponse.json({ url: session.url })
}
```

---

## Subscriptions (Prenumerationer)

### Skapa Subscription Checkout

```typescript
// app/actions/subscription.ts
'use server'

import { stripe } from '@/lib/stripe'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function createSubscription(priceId: string) {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  // Hämta eller skapa Stripe-kund
  let customerId = await getStripeCustomerId(session.user.id)

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email!,
      metadata: { userId: session.user.id },
    })
    customerId = customer.id
    await saveStripeCustomerId(session.user.id, customerId)
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    subscription_data: {
      trial_period_days: 14, // Valfri trial
      metadata: { userId: session.user.id },
    },
  })

  redirect(checkoutSession.url!)
}
```

### Customer Portal (Hantera prenumeration)

```typescript
// app/actions/billing.ts
'use server'

import { stripe } from '@/lib/stripe'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function createPortalSession() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  const customerId = await getStripeCustomerId(session.user.id)
  if (!customerId) {
    throw new Error('No Stripe customer found')
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  })

  redirect(portalSession.url)
}
```

**OBS:** Konfigurera Customer Portal i Stripe Dashboard → Settings → Billing → Customer Portal innan användning.

### Kontrollera prenumerationsstatus

```typescript
// lib/subscription.ts
import { stripe } from '@/lib/stripe'

export async function getSubscriptionStatus(customerId: string) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'active',
    limit: 1,
  })

  if (subscriptions.data.length === 0) {
    return { active: false, plan: null }
  }

  const subscription = subscriptions.data[0]
  return {
    active: true,
    plan: subscription.items.data[0].price.lookup_key,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  }
}
```

---

## Webhooks

### Webhook Route (KRITISKT för säkerhet)

```typescript
// app/api/webhooks/stripe/route.ts
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // VIKTIGT: Läs body som text för signaturverifiering
  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    // Verifiera att requesten kommer från Stripe
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Hantera events
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutComplete(session)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionChange(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionCanceled(subscription)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        await handlePaymentSucceeded(invoice)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handlePaymentFailed(invoice)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}

// Webhook handlers
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  if (!userId) return

  if (session.mode === 'subscription') {
    // Subscription skapades - uppdatera databas
    await db.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId: session.customer as string,
        subscriptionId: session.subscription as string,
        subscriptionStatus: 'active',
      },
    })
  } else {
    // Engångsbetalning genomförd
    await db.order.create({
      data: {
        userId,
        sessionId: session.id,
        amount: session.amount_total!,
        status: 'completed',
      },
    })
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
  if (!userId) return

  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: subscription.status,
      subscriptionPlan: subscription.items.data[0].price.lookup_key,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  })
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
  if (!userId) return

  await db.user.update({
    where: { id: userId },
    data: {
      subscriptionStatus: 'canceled',
      subscriptionId: null,
    },
  })
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  // Logga lyckad betalning, skicka kvitto, etc.
  console.log(`Payment succeeded for invoice ${invoice.id}`)
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Notifiera användare om misslyckad betalning
  const customerId = invoice.customer as string
  // Skicka e-post, visa varning i app, etc.
}
```

### Lokal utveckling med Stripe CLI

```bash
# Installera Stripe CLI
brew install stripe/stripe-cli/stripe

# Logga in
stripe login

# Forwarda webhooks till localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Kopiera webhook signing secret (whsec_...) till .env.local
```

### Webhook-events att hantera

| Event | Beskrivning |
|-------|-------------|
| `checkout.session.completed` | Checkout slutförd |
| `customer.subscription.created` | Ny prenumeration |
| `customer.subscription.updated` | Prenumeration ändrad |
| `customer.subscription.deleted` | Prenumeration avslutad |
| `invoice.payment_succeeded` | Betalning lyckades |
| `invoice.payment_failed` | Betalning misslyckades |
| `customer.updated` | Kundinfo uppdaterad |

---

## Stripe Elements

### Payment Element (Rekommenderat)

Payment Element är en förbyggd UI-komponent som stödjer 100+ betalmetoder.

```typescript
// components/PaymentForm.tsx
'use client'

import { useState } from 'react'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'

// Wrapper med Elements provider
export function PaymentFormWrapper({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements
      stripe={getStripe()}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe', // eller 'night', 'flat'
          variables: {
            colorPrimary: '#0070f3',
            borderRadius: '8px',
          },
        },
      }}
    >
      <PaymentForm />
    </Elements>
  )
}

function PaymentForm() {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!stripe || !elements) return

    setProcessing(true)
    setError(null)

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/success`,
      },
    })

    if (submitError) {
      setError(submitError.message ?? 'Ett fel uppstod')
      setProcessing(false)
    }
    // Om lyckat redirectas användaren automatiskt
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={!stripe || processing}>
        {processing ? 'Bearbetar...' : 'Betala'}
      </button>
    </form>
  )
}
```

### Skapa PaymentIntent (Server Action)

```typescript
// app/actions/payment.ts
'use server'

import { stripe } from '@/lib/stripe'

export async function createPaymentIntent(amount: number) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100, // Stripe använder cents/ören
    currency: 'sek',
    automatic_payment_methods: { enabled: true },
  })

  return { clientSecret: paymentIntent.client_secret }
}
```

### Express Checkout Element

För snabba betalningar med Apple Pay, Google Pay, etc.

```typescript
'use client'

import { ExpressCheckoutElement, Elements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe-client'

export function ExpressCheckout({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      <ExpressCheckoutElement
        onConfirm={async (event) => {
          // Bekräfta betalning
          const { error } = await event.confirm()
          if (error) {
            console.error(error)
          }
        }}
        options={{
          buttonType: {
            applePay: 'buy',
            googlePay: 'buy',
          },
        }}
      />
    </Elements>
  )
}
```

### Address Element

```typescript
'use client'

import { AddressElement } from '@stripe/react-stripe-js'

export function AddressForm() {
  return (
    <AddressElement
      options={{
        mode: 'shipping', // eller 'billing'
        allowedCountries: ['SE', 'NO', 'DK', 'FI'],
        fields: {
          phone: 'always',
        },
        validation: {
          phone: { required: 'always' },
        },
      }}
      onChange={(event) => {
        if (event.complete) {
          const address = event.value
          console.log('Address:', address)
        }
      }}
    />
  )
}
```

---

## Testkort

```bash
# Testkort
4242 4242 4242 4242  # Lyckas alltid
4000 0000 0000 0002  # Nekas alltid
4000 0000 0000 3220  # Kräver 3D Secure

# Stripe CLI för att trigga webhook-events
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
```

---

## Exempel

### Pricing Page

```typescript
// app/pricing/page.tsx
import { stripe } from '@/lib/stripe'
import { PricingCard } from '@/components/PricingCard'

export default async function PricingPage() {
  const prices = await stripe.prices.list({
    active: true,
    expand: ['data.product'],
    type: 'recurring',
  })

  return (
    <div className="pricing-grid">
      {prices.data.map((price) => (
        <PricingCard key={price.id} price={price} />
      ))}
    </div>
  )
}
```

### Success Page

```typescript
// app/checkout/success/page.tsx
import { stripe } from '@/lib/stripe'

type Props = {
  searchParams: Promise<{ session_id?: string }>
}

export default async function SuccessPage({ searchParams }: Props) {
  const { session_id } = await searchParams

  if (!session_id) {
    return <p>Ingen session hittades</p>
  }

  const session = await stripe.checkout.sessions.retrieve(session_id, {
    expand: ['line_items', 'customer'],
  })

  return (
    <div>
      <h1>Tack för ditt köp!</h1>
      <p>Order-ID: {session.id}</p>
      <p>Totalt: {(session.amount_total! / 100).toFixed(2)} SEK</p>
    </div>
  )
}
```

---

## Relaterade docs

- **Auth.js** (`/workspace/docs/auth.md`): Skydda checkout-routes med proxy.ts, koppla Stripe customer till User-modell
- **Prisma** (`/workspace/docs/prisma.md`): Spara subscriptions/orders i databasen, webhook-handlers uppdaterar Prisma-modeller

---

## Referenser

- [Stripe Documentation](https://docs.stripe.com/)
- [Stripe Checkout Quickstart](https://docs.stripe.com/checkout/quickstart)
- [React Stripe.js](https://docs.stripe.com/sdks/stripejs-react)
- [Stripe Payment Element](https://docs.stripe.com/payments/payment-element)
- [Stripe Webhooks](https://docs.stripe.com/webhooks)
- [Vercel Next.js Subscription Template](https://github.com/vercel/nextjs-subscription-payments)
- [Stripe + Next.js 15 Guide](https://www.pedroalonso.net/blog/stripe-nextjs-complete-guide-2025/)
