# Förslag: Proaktiv promptsektion för chat-agenten

## Syfte

Ny sektion som gör chat-agenten mer proaktiv vid otydliga eller korta användarfrågor: agenten ska först utforska bredt och testa hypoteser med verktyg, och endast fråga användaren när verkligt blockerande oklarheter kvarstår.

---

## Konkret prompttext (klistra in i systemprompten)

Följande block kan läggas in i `buildSystemPrompt` i `web/src/app/api/ai/chat/route.ts` (t.ex. efter sökstrategin) eller i den dokumentation som styr prompten.

```text
PROAKTIV HANTERING AV OTYDLIGA FRÅGOR

När användaren ställer en fråga som är vag, kort eller kan betyda flera saker:
1. Tolka frågan i en eller flera rimliga betydelser — välj den mest sannolika utifrån kontext (aktivit projekt, tidigare meddelanden, sammanfattning).
2. Utforska först med verktyg innan du frågar användaren: använd listProjects, getUserTasks, getProjectTasks, searchFiles, getUnreadAIMessages eller andra lämpliga verktyg för att hämta fakta och testa din tolkning.
3. Svara utifrån det du hittat. Om flera tolkningar ger olika svar, presentera det kort (t.ex. "Om du menar X: … Om du menar Y: …") eller välj den mest troliga och nämn att du antog X.
4. Fråga användaren endast när något verkligt blockerar: t.ex. val mellan flera projekt/uppgifter som du inte kan rangordna, eller när en kritisk parameter (projekt, uppgift, datum) saknas och inte går att sluta sig till från kontext.

Undvik att börja med "Vilket projekt menar du?", "Vilken uppgift?" eller "Kan du förtydliga?" om du kan lista projekt/uppgifter, kolla aktiva projekt eller sökande verktyg först och sedan ge ett svar eller ett begränsat val.
```

---

## Rationale

- **Färre varv:** Användare (särskilt hantverkare i fält) formulerar ofta kort och kontextberoende ("Vad är status?", "När är nästa?", "Finns det ritning för badrummet?"). En agent som genast svarar "Vilket projekt?" skapar onödig friction.
- **Kontext finns:** Aktivit projekt, projektlista, uppgifter och sökverktyg ger tillräckligt med data för att gissa rimligt eller begränsa alternativ. Agenten ska använda denna data innan den ger upp.
- **Hypotes-testning:** Genom att använda verktyg (listProjects, getUserTasks, searchFiles) kan agenten verifiera eller förkasta tolkningar och sedan antingen svara med ett antagande eller erbjuda ett litet, tydligt val istället för en öppen "förtydliga"-fråga.
- **Fråga bara vid blockering:** När valet verkligen påverkar utfallet (t.ex. vilken av tre liknamede uppgifter som ska uppdateras) är det rätt att fråga — men då med konkret val, inte generellt "kan du förtydliga?".

---

## Före / Efter

### Exempel 1: Vag fråga om status

**Före (mindre proaktiv):**  
Användare: "Vad är status?"  
Agent: "Vilket projekt eller vilken uppgift menar du? Jag behöver veta för att kunna kolla status."

**Efter (proaktiv):**  
Användare: "Vad är status?"  
Agent anropar t.ex. getUnreadAIMessages, och om projectId finns i kontext getProjectTasks eller getProjectDetailCore.  
Agent: "För projektet Kvarnbergsskolan är statusen aktiv. Du har 3 pågående uppgifter och 2 olästa meddelanden från projekt-AI — vill du att jag sammanfattar dem?"  
*(Om ingen projektkontext:* Agent listar användarens projekt och ger status per projekt eller för "senast aktiva" innan hen eventuellt frågar vilket projekt användaren vill fokusera på.)

---

### Exempel 2: Sökning efter innehåll

**Före (mindre proaktiv):**  
Användare: "Finns det ritning för badrummet?"  
Agent: "Vilket projekt gäller det? Och menar du badrum i allmänhet eller ett särskilt badrum?"

**Efter (proaktiv):**  
Agent anropar searchFiles (och vid behov getProjectFiles om projectId finns).  
Agent: "Jag hittade [1] en ritning 'Plan badrum vån 2' i Kvarnbergsskolan och [2] en fil 'El badrum' i samma projekt. Om du menar ett annat projekt kan jag söka vidare — vilket projekt är det?"  
*(Frågan kommer efter att agenten har gett konkret svar och begränsat val.)*

---

### Exempel 3: Verkligt blockerande val

**Situationsdär agenten ska fråga:**  
Användare: "Flytta deadline till nästa vecka."  
Det finns tre uppgifter tilldelade användaren med deadline nästa vecka eller senare; ingen kontext pekar på vilken.  
Agent: "Du har flera uppgifter med deadline kring då: 'Dra kabel källare' (idag 22/2), 'Montera tavlor plan 2' (23/2), 'Slutkontroll' (25/2). Vilken av dem ska få ny deadline till nästa vecka, eller ska alla tre ändras?"

Här är valet kritiskt för utfallet — agenten har utforskat (getUserTasks/getProjectTasks) och ställer en **konkret** fråga med alternativ istället för en generell "förtydliga".

---

## Var lägga in prompttexten

- **I koden:** I `web/src/app/api/ai/chat/route.ts`, i funktionen `buildSystemPrompt`, lägg till en ny `parts.push(...)` med rubriken "PROAKTIV HANTERING AV OTYDLIGA FRÅGOR" och de fyra punkterna ovan (eventuellt som en konstant `PROACTIVE_UNCLEAR_QUESTIONS` i samma fil eller i en delad prompt-modul om sådan införs).
- **I dokumentationen:** Uppdatera `AI.md` under "Systemprompt" (personlig AI) med att denna sektion ingår, så att framtida prompt-ändringar håller sig till samma beteende.
