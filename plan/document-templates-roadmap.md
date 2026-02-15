# Dokumentmallar för byggbranschen - Roadmap

## Fas 1: Grundmallar (implementeras nu)

| Mall | Format | Beskrivning |
|------|--------|-------------|
| `projektrapport` | PDF/Word | Header med projektnamn, sektioner, footer med datum |
| `offert` | PDF/Word | Villkorstext, prissumma, signaturplats |
| `protokoll` | PDF/Word | Deltagarlista, beslutspunkter, datum |
| `materiallista` | Excel | Tabellformat med summeringsrad |

## Fas 2: Byggspecifika mallar

| Mall | Format | Beskrivning | Innehåll |
|------|--------|-------------|----------|
| `besiktningsprotokoll` | PDF | Formellt besiktningsdokument | Objekt, datum, deltagare, observationer, åtgärder, signatur |
| `avvikelserapport` | PDF | Rapportering av avvikelser | Beskrivning, plats, orsak, åtgärd, ansvarig, deadline |
| `dagbok` | PDF | Byggdagbok | Datum, väder, närvaro, utfört arbete, material, händelser |
| `riskanalys` | PDF/Excel | Riskbedömning | Risk, sannolikhet, konsekvens, åtgärd, ansvarig |
| `egenkontroll` | PDF | Egenkontrollchecklista | Kontrollpunkter, status, signatur |
| `arbetsberedning` | PDF | Förberedelse inför arbetsmoment | Moment, risker, skydd, utrustning |

## Fas 3: Ekonomimallar

| Mall | Format | Beskrivning |
|------|--------|-------------|
| `faktura` | PDF | Faktura med rader, moms, betalningsvillkor |
| `budget` | Excel | Projektbudget med kategorier, utfall, prognos |
| `kostnadskalkyl` | Excel | Detaljerad kostnadsberäkning |
| `timredovisning` | Excel/PDF | Sammanställd tidrapport för fakturering |

## Fas 4: Avancerade mallar

| Mall | Format | Beskrivning |
|------|--------|-------------|
| `slutbesiktning` | PDF | Formellt slutbesiktningsdokument med standardtext |
| `garantibevis` | PDF | Garantidokumentation |
| `överlämning` | PDF | Projektöverlämning med checklista |
| `ändringsorder` | PDF | ÄTA-hantering (Ändrings- och Tilläggsarbeten) |

## Mallstruktur

Varje mall definieras av:

```typescript
interface DocumentTemplate {
  id: string;                    // t.ex. "besiktningsprotokoll"
  name: string;                  // "Besiktningsprotokoll"
  formats: ('pdf' | 'word' | 'excel')[];
  category: 'general' | 'construction' | 'economy' | 'advanced';

  // Layout
  hasHeader: boolean;
  hasFooter: boolean;
  hasLogo: boolean;

  // Sektioner (för PDF/Word)
  sections?: {
    id: string;
    label: string;
    required: boolean;
  }[];

  // Kolumner (för Excel)
  columns?: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date';
    width?: number;
  }[];

  // Standardtext
  defaultContent?: {
    header?: string;
    footer?: string;
    terms?: string;  // villkor för offert
  };
}
```

## Implementation

### Mallregister

```typescript
// web/src/lib/reports/templates/index.ts
export const documentTemplates: Record<string, DocumentTemplate> = {
  projektrapport: { ... },
  offert: { ... },
  protokoll: { ... },
  // ...
};
```

### Mallväljare (UI, framtida)

En komponent där användaren kan:
1. Välja mall från kategorier
2. Se förhandsvisning av mallen
3. Fylla i mallspecifika fält
4. Generera dokument

### AI-integration

System prompt utökas med:
- Lista över tillgängliga mallar
- När varje mall bör användas
- Vilka fält som krävs per mall

## Datamodell (framtida)

För att stödja mer avancerade mallar kan vi lägga till:

```prisma
// Rum/utrymmen
model Room {
  id          String   @id @default(cuid())
  roomNumber  String
  name        String?
  floor       Int      // 0 = nedervåning, 1 = övervåning
  area        Float?   // m²
  projectId   String
  project     Project  @relation(...)
}

// Material
model Material {
  id          String   @id @default(cuid())
  name        String
  unit        String   // st, m, m², kg
  quantity    Float
  unitPrice   Float?
  projectId   String
  project     Project  @relation(...)
}

// Observationer/avvikelser
model Observation {
  id          String   @id @default(cuid())
  type        ObservationType  // DEVIATION, NOTE, DEFECT
  description String
  location    String?
  roomId      String?
  room        Room?    @relation(...)
  status      ObservationStatus
  projectId   String
  project     Project  @relation(...)
}
```

## Prioritering

1. **Nu:** Grundmallar (projektrapport, offert, protokoll, materiallista)
2. **Nästa:** Besiktningsprotokoll, avvikelserapport (vanligast i bygg)
3. **Senare:** Dagbok, egenkontroll, ekonomimallar
4. **Framtid:** Datamodell för rum/material/observationer
