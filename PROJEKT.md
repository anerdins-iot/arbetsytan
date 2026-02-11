# ArbetsYtan (AY)

## Översikt

En kommersiell multi-tenant SaaS-plattform för hantverkare. Projektledning med AI-assistans. Plattformen är byggd för att passa alla typer av hantverkare - elektriker, VVS, målare, byggare och fler.

## Kärnfunktioner

- Projekthantering med att-göra-listor
- Filhantering - PDF-ritningar, dokument, Excel, bilder
- Dokumentskapande - generera Excel, PDF och Word-dokument
- AI-assistent i vardagen - läsa ritningar, sammanfatta dokument, skriva offerter och hjälpa med det mesta
- Fleranvändarstöd med rollbaserad åtkomst
- Multi-tenant - varje företag har isolerad data
- Kommentarer på uppgifter - diskutera arbetet direkt i uppgiften
- Aktivitetslogg - spåra vem som gjort vad i projektet (audit trail)
- Global sökning - sök i projekt, uppgifter, filer och dokumentinnehåll
- Tidrapportering - rapportera tid per uppgift och projekt
- Export och rapporter - sammanställningar som PDF eller Excel
- Påminnelser vid inaktivitet - automatiska notiser om uppgifter som inte rört sig

## Roller och behörigheter

Alla roller har konfigurerbara rättigheter så man kan anpassa vad varje roll ser och gör.

### Superadmin
Plattformsägare. Ser och hanterar hela plattformen och alla företag.

### Företagsadmin
Administrerar sitt eget företag. Ser alla projekt inom företaget.

### Projektledare
Hanterar specifika projekt. Tilldelar uppgifter och följer upp arbetet.

### Montör
Ser sina tilldelade uppgifter och relevanta delar av projektet.

## Registrering och onboarding

Ny användare registrerar sig med e-post, lösenord och företagsnamn. Vid registrering skapas en ny tenant och användaren blir automatiskt företagsadmin. En 14-dagars trial startas via Stripe. Organisationsnummer och övriga företagsuppgifter fylls i senare via inställningar.

Nya användare inom ett företag läggs till genom att admin skickar en e-postinbjudan med en vald roll. Mottagaren klickar på länken, skapar sitt konto och kopplas till företaget.

## Sidstruktur och navigation

### Landningssida (publik)
Modern marknadsföringssida som visas för besökare innan inloggning. Består av en hero-sektion med stark rubrik, kort beskrivning av ArbetsYtan och en tydlig "Kom igång gratis"-knapp som leder till registrering, gärna med en bild eller illustration av appen. Därefter en funktionssektion som presenterar projekthantering, filhantering, AI-assistent och teamsamarbete med ikoner och korta texter i rutnät. Sen en "Så fungerar det"-sektion i tre steg: registrera, skapa projekt, bjud in teamet. Efter det en prissättningssektion med planer, priser och tydlig markering av 14 dagars gratis trial. Sedan socialt bevis med citat från hantverkare (placeholder i början). Till sist en footer med kontaktinfo, sociala medier och länkar.

### Dashboard
Landningssida efter inloggning. Visar tilldelade uppgifter, senaste aktiviteten i projekten och notifikationer. Rent och enkelt utan informationsöverbelastning. För montörer fokuserar dashboarden helt på "mina uppgifter idag" — en enkel lista med tilldelade uppgifter, statusändring och bilduppladdning.

### Projektlista
Finns i vänstermenyn. Listar alla projekt användaren har tillgång till.

### Projektvy
Öppnas när man klickar på ett projekt. Har flikar för översikt, uppgifter, filer och AI-assistent. Översikten visar projektets status, adress och senaste händelser. Uppgifter visas som kanban med kolumnerna att göra, pågående och klart. Filer visas i rutnät med förhandsgranskning. AI-assistenten är en chatt i projektkontexten som redan vet vilket projekt man jobbar med.

### Inställningar
Längst ner i vänstermenyn. Åtkomlig för admin. Innehåller företagsuppgifter, användarhantering med inbjudningar, roller och rättigheter, samt fakturering och Stripe-prenumeration.

### AI-assistent (global)
Tillgänglig via en knapp i nedre högra hörnet oavsett var man befinner sig i appen. Kan användas för frågor som inte är kopplade till ett specifikt projekt.

## Affärsmodell

- SaaS med månadsavgift per företag
- Prissättning per användare

## Utvecklingsfaser

Detaljerad byggplan med 12 faser och 47 block finns i `plan/README.md`. Faserna täcker:

1. Projektsetup och infrastruktur
2. Autentisering och multi-tenant
3. Dashboard och projekthantering
4. Filhantering och dokument
5. AI-assistenter
6. Notifikationer och realtid
7. Inställningar och administration
8. Tidrapportering och export
9. Betalning (Stripe)
10. Landningssida
11. Mobilapp (Expo)
12. Deploy och produktion
