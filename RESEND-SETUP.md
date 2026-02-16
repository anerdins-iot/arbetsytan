# Resend Setup Guide för tvåvägskommunikation

## Översikt

För att aktivera inkommande mail i Arbetsytan behöver du:
1. En domän för inkommande mail (t.ex. mail.lowly.se)
2. Webhook-konfiguration i Resend
3. Miljövariabler i din deployment

## Steg 1: Domänkonfiguration

### 1.1 Lägg till domän i Resend

1. Gå till [Resend Dashboard](https://resend.com/domains)
2. Klicka "Add Domain"
3. Ange din inkommande domän, t.ex. `mail.lowly.se`
4. Välj "Inbound" som typ (eller både Inbound och Outbound om du vill använda samma domän)

### 1.2 DNS-poster

Lägg till följande DNS-poster hos din domänleverantör:

**MX-post för inkommande mail:**
```
Typ: MX
Namn: mail (eller @ för rotdomän)
Värde: inbound.resend.com
Prioritet: 10
```

**SPF-post (om du också skickar från domänen):**
```
Typ: TXT
Namn: mail
Värde: v=spf1 include:resend.com ~all
```

### 1.3 Verifiera domänen

Tillbaka i Resend Dashboard:
1. Klicka på din domän
2. Klicka "Verify" för att kontrollera DNS-posterna
3. Vänta tills statusen blir "Verified" (kan ta upp till 48 timmar, oftast snabbare)

## Steg 2: Webhook-konfiguration

### 2.1 Skapa webhook i Resend

1. Gå till [Resend Webhooks](https://resend.com/webhooks)
2. Klicka "Add Webhook"
3. Ange din endpoint URL:
   ```
   https://din-domän.se/api/webhooks/resend
   ```
4. Välj följande events:
   - `email.received` (inkommande mail)
   - `email.delivered` (bekräftelse på leverans)
   - `email.bounced` (studsat mail)
   - `email.complained` (spam-markering)

### 2.2 Kopiera webhook-secret

Efter att webhook skapats:
1. Klicka på din webhook
2. Kopiera "Signing Secret" (börjar med `whsec_`)
3. Spara denna säkert, du behöver den för miljövariabler

## Steg 3: Miljövariabler

Lägg till följande i din deployment (Coolify, Vercel, eller .env.local):

```env
# Domän som tar emot inkommande mail
RESEND_RECEIVING_DOMAIN=mail.lowly.se

# Webhook-secret för signaturverifiering
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
```

## Steg 4: Testa

### 4.1 Skicka testmail från systemet

1. Logga in i Arbetsytan
2. Gå till E-post och fliken "Skriv"
3. Skicka ett mail till din egen e-postadress
4. Kontrollera att mailet har en reply-to adress som `inbox+abc123@mail.lowly.se`

### 4.2 Svara på mailet

1. Svara på mailet från din vanliga e-postklient
2. Kontrollera i Arbetsytan att svaret dyker upp i konversationen
3. Du bör också få en notifikation

### 4.3 Felsökning

Om svar inte kommer fram:
- Kontrollera webhook-loggen i Resend Dashboard
- Kontrollera serverloggar för webhook-endpoint
- Verifiera att DNS-posterna är korrekta med `dig MX mail.lowly.se`

## Säkerhet

- Webhook-endpoint validerar Resend-signaturen med HMAC
- Alla mail filtreras på tenant och användare
- Spårningskoder är unika per konversation
- Mail utan giltig spårningskod ignoreras (loggas men skapar inte ny konversation)

## Framtida förbättringar

Funktioner som kan läggas till senare:
- Skapa ny konversation från okänd avsändare (kräver spam-skydd)
- Hantering av bilagor på inkommande mail
- E-postmallar för snabbsvar
