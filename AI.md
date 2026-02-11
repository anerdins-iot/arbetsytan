# AI-arkitektur

## Koncept

Varje användare har en personlig AI-assistent. Varje projekt har en projekt-AI. Användaren kan prata med sin personliga AI eller med ett projekts AI. De två typerna har olika kontext och olika verktyg.

## Stateless med verktyg

AI-assistenterna är stateless — de startar från noll vid varje samtal. Ingen lång konversationshistorik lagras i kontexten. Istället har varje AI tillgång till verktyg som hämtar det den behöver från databasen.

Vid ett nytt samtal skickas systemprompt, de senaste meddelandena från konversationen, och en komprimerad sammanfattning av äldre meddelanden. Allt annat hämtas via verktyg.

## Personlig AI

Varje användare har en egen AI-assistent som lever oberoende av projekt. Den har tillgång till en personlig databas med notiser från projekt-AI:er, sammanfattningar och personlig historik. Den vet vad som hänt sedan sist genom att läsa sin databas, inte genom att minnas.

Den personliga AI:n nås via knappen i nedre högra hörnet, oavsett var i appen användaren befinner sig.

### Systemprompt

Den personliga AI:n får en systemprompt som beskriver vem användaren är, vilken roll den har, vilka projekt den är med i, och att den ska agera som en personlig arbetsassistent. Prompten instruerar AI:n att alltid börja med att kolla olästa meddelanden från projekt-AI:er.

Exempel: "Du är en personlig arbetsassistent åt Fredrik Anerdin. Fredrik är företagsadmin på Anerdins El och har tre aktiva projekt. Du hjälper honom med daglig planering, uppgifter och att hålla koll på vad som händer i hans projekt. Börja alltid med att kolla om det finns olästa meddelanden från projekt-AI:er. Svara på svenska, var konkret och kort."

### Verktyg

- Hämta olästa AIMessage (filtrerat på userId, read = false)
- Markera AIMessage som läst
- Skicka AIMessage till projekt-AI (riktning PERSONAL_TO_PROJECT)
- Hämta användarens uppgifter (alla projekt, filtrerat på membership)
- Hämta användarens projektlista
- Söka i filer (inom projekt användaren har tillgång till)
- Skapa och uppdatera uppgifter
- Hämta konversationssammanfattning

### Kontextuppbyggnad

1. Systemprompt med användarens namn, roll och tenant
2. Komprimerad sammanfattning av tidigare konversationer (från Conversation.summary)
3. De senaste meddelandena i pågående konversation (från Message-tabellen)
4. AI:n hämtar resten via verktyg vid behov

## Projekt-AI

Varje projekt har en egen AI-assistent som alla projektmedlemmar delar. Den har tillgång till projektets databas — uppgifter, filer, historik, ritningar och allt som rör projektet. Den lever i projektkontexten och nås via AI-fliken i projektvyn.

### Systemprompt

Projekt-AI:n får en systemprompt som beskriver projektet — namn, adress, status, antal uppgifter, antal medlemmar. Den instrueras att hjälpa med allt som rör projektet och att notifiera relevanta användares personliga AI:er vid viktiga händelser.

Exempel: "Du är AI-assistenten för projektet Kvarnbergsskolan. Projektet är aktivt, adressen är Kvarnbergsvägen 12 i Göteborg. Det finns fyra teammedlemmar och tolv uppgifter varav tre är pågående. Du hjälper teamet med allt som rör projektet — uppgifter, filer, ritningar och planering. Om du skapar eller ändrar uppgifter som berör en specifik person, skicka ett meddelande till deras personliga AI."

### Verktyg

- Hämta projektets uppgifter (filtrerat på projectId)
- Skapa, uppdatera och tilldela uppgifter
- Hämta projektets filer
- Analysera filer (PDF, ritningar, bilder via OCR)
- Hämta projektmedlemmar
- Skicka AIMessage till användares personliga AI (riktning PROJECT_TO_PERSONAL)
- Läsa svar från personliga AI:er (AIMessage med riktning PERSONAL_TO_PROJECT)
- Generera dokument (Excel, PDF, Word)
- Hämta konversationssammanfattning

### Kontextuppbyggnad

1. Systemprompt med projektets namn, status, adress och grunddata
2. Komprimerad sammanfattning av projektkonversationen
3. De senaste meddelandena i pågående konversation
4. AI:n hämtar resten via verktyg vid behov

## Kommunikation mellan AI:er

Kommunikationen mellan AI:er är tvåvägs via AIMessage-tabellen.

### Triggers — projekt till personlig

Projekt-AI:n skickar automatiskt meddelanden till en användares personliga AI vid dessa händelser:

- En uppgift tilldelas användaren
- En deadline ändras på en uppgift som berör användaren
- En viktig fil laddas upp (t.ex. ny ritning)
- Projektets status ändras
- En annan användare lämnar en kommentar som berör dem
- Projektledaren ber AI:n meddela en specifik person

Meddelandet skapas som en AIMessage med riktning PROJECT_TO_PERSONAL, kopplad till användaren och projektet. Read sätts till false.

### Triggers — personlig till projekt

Den personliga AI:n kan skicka meddelanden tillbaka till projekt-AI:n:

- Användaren har sett och bekräftat en uppgift
- Användaren ställer en fråga om projektet via sin personliga AI
- Användaren rapporterar att en uppgift är klar eller försenad
- Användaren ber sin personliga AI uppdatera projektet

Meddelandet skapas som en AIMessage med riktning PERSONAL_TO_PROJECT, kopplad till användaren och projektet.

### Trådning

Meddelanden kan kedjas via parentId. Om projekt-AI:n skickar "Du har en ny uppgift" och den personliga AI:n svarar "Användaren börjar på måndag", blir svaret ett barn av det ursprungliga meddelandet. Detta gör det möjligt att följa konversationstrådar mellan AI:er.

### Flödesexempel

1. Projektledaren tilldelar en uppgift till montören i projekt-AI:n
2. Projekt-AI:n skapar uppgiften i databasen
3. Projekt-AI:n skickar en AIMessage till montörens personliga AI med typ "task_assigned" och beskrivning
4. Montören öppnar appen och pratar med sin personliga AI
5. Personliga AI:n ser oläst meddelande, berättar: "Du har fått en ny uppgift i Kvarnbergsprojektet — dra kabel i källaren, deadline fredag"
6. Montören säger "Jag börjar med det på måndag"
7. Personliga AI:n skickar tillbaka en AIMessage till projekt-AI:n med typ "task_acknowledged" och kommentaren
8. Nästa gång någon pratar med projekt-AI:n kan den berätta att montören planerar att börja på måndag

## Notifikationer

AI:n bestämmer om ett meddelande är tillräckligt viktigt för att trigga en notis. Inte varje AIMessage blir en notis — AI:n gör bedömningen baserat på händelsens typ och vikt.

När AI:n beslutar att en notis ska skapas, använder den ett verktyg som skapar en Notification i databasen. AI:n formulerar innehållet på svenska i en naturlig ton.

### Kanaler

Tre kanaler finns tillgängliga. Expo Push Notifications för mobilappen — appen registrerar en push-token som sparas på användaren, och backend skickar via Expos push-API. Web Push API för webbläsaren. Resend för e-post vid viktiga händelser.

AI:n väljer kanal baserat på händelsens vikt. Användaren kan i sina inställningar styra vilka kanaler som är aktiva och för vilka typer av händelser.

### Exempel

En ny uppgift med deadline imorgon — AI:n skapar en notis som går ut på alla aktiva kanaler. En fil laddas upp — AI:n skickar bara ett AIMessage till den personliga AI:n, ingen notis. En deadline ändras — AI:n bedömer och kan välja in-app plus push men inte e-post.

## Sammanfattning och komprimering

När en konversation blir lång (över ett konfigurerbart antal meddelanden) triggas en komprimering. AI:n sammanfattar de äldre meddelandena till en kort text som sparas i Conversation.summary. De sammanfattade meddelandena behålls i databasen men skickas inte med till AI:n — bara sammanfattningen.

Detta håller kontexten liten och kostnaderna nere, utan att tappa viktig information.

## Providers

Claude används som primär AI-modell för chattassistenterna. OpenAI används för viss analys. Mistral används för OCR på ritningar och dokument. Val av provider sker via abstraktionslagret i `src/lib/ai/`.

## Realtidskommunikation

Server-Sent Events (SSE) används för all realtidskommunikation. SSE är enkelriktat — servern skickar data till klienten — och fungerar över vanlig HTTP utan extra infrastruktur.

### Användningsområden

- Streaming av AI-svar — token för token medan AI:n genererar sitt svar
- Live-notifikationer — in-app-notiser visas direkt utan att användaren behöver ladda om
- Statusuppdateringar — uppgifter, projekt och andra ändringar som görs av teammedlemmar

### Varför SSE och inte WebSockets

Klienten skickar data via Server Actions och API-anrop, inte via en öppen kanal. Därför behövs inte tvåvägskommunikation. SSE fungerar direkt med Next.js App Router, kräver ingen separat server, har inbyggd återanslutning i webbläsaren, och passerar brandväggar och proxys utan problem. WebSockets hade krävt extra infrastruktur och komplexitet utan att ge något mervärde för våra behov.

### Implementation

En SSE-endpoint skapas som en API-route i Next.js. Klienten ansluter med EventSource. Servern skickar events med data i JSON-format. Varje event har en typ (t.ex. "notification", "ai-token", "task-update") som klienten lyssnar på.

## Mobilautentisering

Webappen använder cookies via Auth.js — det är standardbeteendet och fungerar direkt. Mobilappen (Expo) kan däremot inte använda httpOnly cookies på samma sätt, eftersom React Native inte har en webbläsare med inbyggt cookie-stöd.

### Strategi

Webben använder cookies som vanligt via Auth.js. Mobilappen använder JWT Bearer tokens. Vid inloggning i mobilappen anropas ett API-endpoint som returnerar en JWT. Token lagras säkert i expo-secure-store på enheten. Varje API-anrop från mobilappen skickar token i Authorization-headern.

### Auth.js-konfiguration

Auth.js konfigureras med dubbla strategier — session-baserad för webb och JWT för mobil. API-routes kontrollerar först Authorization-headern (mobil) och faller tillbaka på session-cookies (webb). En gemensam hjälpfunktion abstraherar detta så att resten av koden inte behöver bry sig om vilken klient som anropar.

## Datamodell

Se `prisma/schema.prisma` för tabellstruktur. AI-relaterade modeller: Conversation, Message, AIMessage, Notification, ConversationType, AIDirection, NotificationChannel, AIProvider, MessageRole.
