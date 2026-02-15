# Framtida funktioner för "Mitt utrymme"

Förslag på funktioner att lägga till på den personliga sidan.

## Prioritet: Hög

### Personliga uppgifter
- [ ] Att-göra-lista utan koppling till projekt
- [ ] Exempel: "Beställ material", "Boka service", "Ring kund"
- [ ] Enkel lista eller mini-kanban
- [ ] AI-verktyg: `createPersonalTask`, `getPersonalTasks`, `updatePersonalTask`, `deletePersonalTask`

## Prioritet: Medel

### Personliga checklistor
- [ ] Återkommande listor som kan återanvändas
- [ ] Exempel: "Packlista för jobb", "Före kundbesök", "Verktyg att ta med"
- [ ] Mallsystem för att snabbt skapa nya checklistor
- [ ] AI-verktyg: `createChecklist`, `getChecklists`, `copyChecklist`

### Favoriter
- [ ] Snabbåtkomst till ofta använda projekt och filer
- [ ] Pinna projekt till översikten
- [ ] Favoritmarkera filer
- [ ] AI-verktyg: `addFavorite`, `getFavorites`, `removeFavorite`

### Kontakter
- [ ] Personlig kontaktbok (kunder, leverantörer, samarbetspartners)
- [ ] Namn, telefon, e-post, företag, anteckningar
- [ ] Sökbar från AI-chatten
- [ ] AI-verktyg: `createContact`, `getContacts`, `searchContacts`, `updateContact`, `deleteContact`

## Prioritet: Låg

### Snabbanteckningar med röst
- [ ] Voice-to-text för snabba anteckningar i fält
- [ ] Transkribering via Whisper eller liknande
- [ ] Automatisk kategorisering

### Personlig kalender
- [ ] Synka med projekt-deadlines
- [ ] Visa uppgifter med förfallodatum
- [ ] Integration med externa kalendrar (Google, Outlook)

### Personlig tidrapport
- [ ] Tid utan koppling till specifikt projekt
- [ ] "Allmän arbetstid", "Administration", "Resor"
- [ ] Sammanställning över alla projekt + personlig tid

---

## Implementation

Varje funktion bör följa samma mönster:
1. Server actions i `personal.ts`
2. UI-komponent i `components/personal/`
3. AI-verktyg i `personal-tools.ts`
4. Socket-events för realtidsuppdatering
5. Översättningar i sv.json/en.json
