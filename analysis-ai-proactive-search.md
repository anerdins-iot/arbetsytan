# Analys: Varför AI-assistenten inte söker proaktivt

**Datum:** 2026-02-16  
**Frågeställning:** När användaren ställer frågor som "Vad gillar jag?" svarar AI:n att den inte vet och föreslår att söka, men **utför aldrig sökningen proaktivt**.

---

## 1. Vilka verktyg har AI:n för att söka i användarens data?

Personlig AI har tillgång till följande verktyg (från `web/src/lib/ai/tools/personal-tools.ts` och chat-route):

| Verktyg | Beskrivning (kort) | Användning för "Vad gillar jag?" |
|--------|---------------------|----------------------------------|
| `searchFiles` | Semantisk sökning i dokument/OCR-text över projekt + personliga filer | Kan hitta dokument om preferenser |
| `listFiles` / `getProjectFiles` | Lista filer i projekt | Indirekt |
| `searchNotes` (searchProjectNotes) | Sök i projektanteckningar (titel + innehåll) | Ja – projektanteckningar |
| `searchPersonalNotes` | Sök i personliga anteckningar (titel + innehåll) | **Ja – huvudsaklig källa** |
| `getPersonalNotes` | Lista personliga anteckningar (filtrera på kategori) | Ja – bred översikt |
| `getProjectNotes` | Lista projektanteckningar | Ja |
| `getUserTasks` | Användarens uppgifter från alla projekt | Ja – prioriteringar, intressen |
| `getProjectTasks` | Uppgifter i ett projekt | Ja om projekt kontext |
| `searchMyEmails` | Semantisk sökning i e-post | Ja – preferenser i mail |
| `getConversationContext` | Hela e-posttråd | Följupp efter searchMyEmails |
| `getProjectList` | Lista projekt användaren är med i | Kontext |
| `getUnreadAIMessages` | Olästa meddelanden från projekt-AI | Mindre relevant för "gillar" |

Verktygen **finns** och täcker anteckningar, uppgifter, filer och e-post. AI:n har alltså tillräckligt med verktyg för att kunna besvara "Vad gillar jag?" utifrån data – om den använder dem.

---

## 2. Finns instruktioner i systemprompten om proaktiv sökning?

**Ja.** I `web/src/app/api/ai/chat/route.ts` (funktionen `buildSystemPrompt`) finns:

- **Proaktiv policy** (rad 396–402):  
  "VAR ALLTID PROAKTIV", "INGA MOTFRÅGOR FÖRST", "BRED SÖKNING", "SLUTA ALDRIG MED EN FRÅGA UTAN ATT HA GJORT NÅGOT".
- **Sökstrategi** (rad 405–414):  
  Ordning searchFiles → listFiles → searchNotes/searchPersonalNotes → getProjectTasks/getUserTasks → getProjectNotes/getPersonalNotes → searchMyEmails.

**Men:**

- Sökstrategin är formulerad som: *"Använd denna ordning **när användaren söker efter något**"* – alltså när användaren uttryckligen söker (t.ex. dokument, filer, ritningar).
- Det finns **ingen explicit regel** som säger att frågor om *vad användaren gillar, tycker, föredrar, minns eller vill* ska trigga samma proaktiva sökning.
- "Vad gillar jag?" kan därför tolkas som en **personlig/filosofisk** fråga som modellen inte kan svara på från data, varpå den svarar "Jag vet inte, vill du att jag söker?" i stället för att själv anropa verktyg.

Så: instruktionerna om proaktivitet finns, men de är **kopplade till "söka efter något"**, inte till **inferensfrågor** (preferenser, minnen, vad användaren skrivit/sparat).

---

## 3. Varför väljer AI:n att inte anropa verktygen automatiskt?

Troliga orsaker:

1. **Sökstrategin är inte explicit för inferensfrågor**  
   Modellen ser att "SÖKSTRATEGI" gäller när användaren *söker efter något*. "Vad gillar jag?" är inte formulerat som en sökning, så modellen kopplar inte frågan till att köra searchPersonalNotes / getPersonalNotes / getUserTasks / searchMyEmails.

2. **Tool descriptions nämner inte preferenser**  
   - `searchPersonalNotes`: "Sök bland personliga anteckningar. Söker i titel och innehåll."  
   - `getPersonalNotes`: "Hämta användarens personliga anteckningar …"  
   Ingen beskrivning säger att verktygen ska användas för att besvara "vad användaren gillar" eller "preferenser". Modellen får ingen stark signal att använda just dessa verktyg för den typen av fråga.

3. **Ett svar utan tool call är tillåtet**  
   Modellen kan i en enda turn svara "Jag vet inte, vill du att jag söker i dina anteckningar?" utan att anropa något verktyg. Regeln "SLUTA ALDRIG MED EN FRÅGA UTAN ATT HA GJORT NÅGOT" kan tolkas som att man inte ska *avsluta* med en fråga – men modellen kan tro att den "gjort något" genom att erbjuda sökning, eller bara ge ett kort "jag vet inte" utan tydlig instruktion om att det är **förbjudet** att säga "jag vet inte" om användarens data utan att först ha sökt.

4. **Ingen explicit "aldrig säg jag vet inte utan att ha sökt"**  
   Det finns ingen formulering i prompten som explicit säger: "Svara ALDRIG 'jag vet inte' eller 'vill du att jag söker?' på frågor om användarens egna data (preferenser, minnen, vad du skrivit) utan att först ha anropat minst 2–3 relevanta verktyg (t.ex. searchPersonalNotes, getPersonalNotes, getUserTasks, searchMyEmails)."

---

## 4. Rekommendationer – vad behöver ändras?

### A. Utöka systemprompten med regel för inferensfrågor (högsta prioritet)

I `buildSystemPrompt` i `web/src/app/api/ai/chat/route.ts`, lägg till en tydlig block efter SÖKSTRATEGI (eller inkludera i proaktiv policy):

**Förslag på text:**

```
INFERENSFRÅGOR - När användaren frågar om vad hen gillar, tycker, föredrar, minns, vill ha, eller om "min data" / "mina anteckningar" / "mina uppgifter":
1. Du MÅSTE söka/liste först – anropa minst 2–3 verktyg (t.ex. searchPersonalNotes med relevant sökord, getPersonalNotes, getUserTasks, eller searchMyEmails) INNAN du svarar.
2. Svara ALDRIG "jag vet inte" eller "vill du att jag söker?" utan att först ha anropat dessa verktyg.
3. Sammanfatta vad du hittat och ge ett konkret svar eller förslag. Om inget relevant hittas efter sökning, säg det då – men först efter att du faktiskt sökt.
```

Detta kopplar "Vad gillar jag?"-liknande frågor explicit till **att anropa verktyg först**.

### B. Skärpa proaktiv policy kring "jag vet inte"

Lägg till en rad i den befintliga PROAKTIV POLICY-blocket, t.ex.:

- "För frågor om användarens egna data (preferenser, minnen, vad användaren skrivit): du får INTE svara 'jag vet inte' eller erbjuda att söka – du ska SÖKA först med verktygen och sedan svara utifrån resultatet."

### C. Förtydliga tool descriptions (valfritt men bra)

I `web/src/lib/ai/tools/personal-tools.ts`:

- **searchPersonalNotes**: Lägg till att verktyget kan användas för att besvara frågor om vad användaren skrivit, noterat eller föredrar (t.ex. en mening i description).
- **getPersonalNotes**: Samma sak – använd för att få en översikt av vad användaren sparade, inklusive för att besvara frågor om preferenser eller minnen.
- **getUserTasks**: Nämn kort att det kan användas för att se vad användaren arbetar med och prioriterar, vilket kan underlätta svar på "vad jag gillar" / "vad jag fokuserar på".

Det ger modellen tydligare signal om att dessa verktyg är relevanta för "Vad gillar jag?".

### D. Konsistens i prompt: getProjectList vs listProjects

I SÖKSTRATEGI står "getProjectFiles/listFiles" och "listProjects" – det exporterade verktyget heter `getProjectList`, inte `listProjects`. Byta till "getProjectList" i prompten undviker förvirring (om modellen läser namnen bokstavligt).

---

## Sammanfattning

| Fråga | Svar |
|-------|------|
| Vilka sökverktyg finns? | searchFiles, searchNotes, searchPersonalNotes, getPersonalNotes, getProjectNotes, getUserTasks, getProjectTasks, searchMyEmails, getConversationContext – tillräckligt för att besvara "Vad gillar jag?" utifrån data. |
| Finns proaktiv-sökning i prompt? | Ja, men kopplat till "när användaren söker efter något", inte till inferensfrågor (preferenser, minnen). |
| Varför anropar AI:n inte verktygen? | Inferensfrågor triggar inte sökstrategin; tool descriptions nämner inte preferenser; modellen kan svara "jag vet inte" i en turn utan att först söka. |
| Vad ändra? | (1) Explicit regel för inferensfrågor: alltid söka med 2–3 verktyg innan svar. (2) Förbjud "jag vet inte" / "vill du att jag söker?" utan att ha sökt. (3) Eventuellt skärpa tool descriptions. (4) Rätt namn getProjectList i prompt. |

Implementering av A och B i `route.ts` bör göra AI:n tydligt mer proaktiv för frågor som "Vad gillar jag?".
