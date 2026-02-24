# Designspråk

## Känsla

Professionell men varm. Seriöst och pålitligt utan att vara korporat. Funktionen styr designen — inga onödiga dekorationer.

## Färger

Primärfärg är en mörkblå som signalerar trygghet och professionalism. Accentfärg är en varm orange som ger energi och kontrast, med koppling till varselkläder och byggbranschen. Bakgrunden är ljusgrå för en ren känsla, med vitt för kort och paneler. I mörkt läge används en djup marinblå som bas.

Alla färger definieras som CSS-variabler via Tailwind v4 — se `/docs/tailwind.md`. Inga hårdkodade färgvärden i komponenterna.

## Typsnitt

Inter som primärt typsnitt för brödtext — lättläst och modernt. Ett tyngre typsnitt som rubrikfont för att ge karaktär.

## Komponenter

shadcn/ui som bas för alla komponenter — se `/docs/shadcn-ui.md`. Rundade hörn, tydliga knappar och generöst med luft. Mobil först i all layout.

## Stöd för dark mode

Hela appen ska fungera i både ljust och mörkt läge. Alla färger och bakgrunder definieras med CSS-variabler som anpassas per tema.

## Ikoner

Lucide Icons — ingår med shadcn/ui. Konsekvent ikonspråk genom hela appen.

## Tillgänglighet

Interaktiva element (knappar, länkar, klickbara ikoner) ska ha minst **44×44 px** touch-/klick-yta (WCAG 2.5.5 Target Size). Det gäller både webb och mobil.
