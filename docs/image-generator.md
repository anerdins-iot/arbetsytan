---
title: AI-bildgenerering (Prompt Generator)
description: Genererar engelska prompts for AI-bildgenerering baserat på bildtyp, affärskontext och geografisk plats
tags: [image, prompt, generation, ai, design]
---

## Syfte

Denna guide beskriver hur man skapar effektiva engelska prompts for AI-bildgenerering. Prompten anpassas efter **bildtyp**, **affärskontext** och **geografisk/kulturell miljö**.

---

## Bildtyper och strategi

| Bildtyp | Format | Strategi | Nyckelord i prompt |
|---------|--------|----------|--------------------|
| `hero_bg` | 16:9 | **Kopieringsutrymme krävs.** Bilden ska ha tomrum for textöverlagring. | "wide angle view of [subject], empty space in center/left for text overlay, soft focus background" |
| `about_image` | 16:9 / 4:3 | **Miljöfokus.** Visa verksamhetens inredning eller atmosfär. | "interior view of [business], warm atmosphere, no people, photorealistic" |
| `service_*` | 4:3 / 1:1 | **Ikonisk/Minimal.** Närbild på verktyg eller detalj kopplad till tjänsten. | "close-up of [tool/detail], minimalist composition, shallow depth of field" |
| `product_*` | 1:1 | **Studio.** Centrerad produkt mot ren bakgrund. | "centered [product] on clean background, soft shadows, commercial photography" |
| `team_*` | 1:1 | **Abstrakt/Miljö.** Undvik ansikten. Visa arbetsplats eller händer. | "professional workspace with laptop and coffee", "hands working on [task]" |
| `gallery_*` | 4:3 | **Atmosfär.** Verksamhet, produkter eller miljö i naturligt sammanhang. | "natural context, authentic atmosphere, documentary style" |
| `background` | 16:9 | **Subtil.** Abstrakt eller oskarp, avsedd att ligga bakom text. | "abstract soft pattern, blurred, subtle texture, muted tones" |

---

## Promptregler

1. **Skriv alltid på engelska** - Ger bättre resultat i alla bildgenereringsmodeller
2. **Inga hexkoder i prompten** - Färghantering sker separat
3. **Fokusera på fysiska objekt** - Beskriv material, ljus och komposition
4. **Var specifik** - "Oak wooden table" istället för "table"
5. **Inkludera atmosfär** - "Warm afternoon light" istället för "good lighting"
6. **Undvik perfektion** - "Natural, slightly worn" istället för "perfect"

---

## Geografisk och kulturell kontext

> Detta är den viktigaste delen. En bild som representerar verkligheten **måste matcha den miljö där verksamheten finns**.

### Princip

Läs av projektets språk, plats och målgrupp. Anpassa scenen efter lokal miljö, arkitektur, natur och ljus.

### Geografiska markörer

| Region | Använd | Undvik |
|--------|--------|--------|
| **Sverige/Norden** | "Scandinavian minimalism", "Nordic light", "Swedish pine forest", "birch trees", "midsummer light", "clean Nordic interior", "Swedish coastal town" | Amerikanska markörer (skolbussar, US-uttag, downtown skyline, palm trees) |
| **Mellanöstern** | "Warm desert tones", "ornate tile patterns", "arched doorways", "date palms" | Nordisk natur, snölandskap |
| **Sydeuropa** | "Mediterranean light", "terracotta roofs", "olive trees", "warm stone facades" | Nordisk minimalism, mörka vintrar |
| **Nordamerika** | "Suburban setting", "wide streets", "downtown skyline", "American diner aesthetic" | Europeisk gatumiljö |

### Så fungerar det i praktiken

En **frisör i Sverige** ska se ut som en svensk frisörsalong:
- Ljus, minimalistisk inredning med trägolv
- Stora fönster med nordiskt dagsljus
- Inte en mörk barbershop i Brooklyn eller en salong i Dubai

En **restaurang i Grekland** ska visa:
- Medelhavsljus, vita väggar, olivträd utanför
- Inte en mörk skandinavisk matsal

---

## Exempel: Bra prompts

### Hero-bilder
```
"Abstract architectural details of a modern Scandinavian building, wide angle,
soft Nordic light, large empty negative space in the center for text overlay."
```
```
"Misty Swedish forest at dawn, pine trees fading into fog, empty sky area
for text, peaceful nordic atmosphere."
```

### Tjänstebilder
```
"Close-up of gardening shears resting on a weathered wooden table, green
plants in blurred background, natural Scandinavian daylight, high quality photography."
```
```
"Hairdresser scissors and comb on marble surface, soft natural light from
large window, professional Nordic salon equipment, minimalist composition."
```

### Produktbilder
```
"A ceramic vase centered on a light oak table, wide framing with empty space
on sides, natural window light, Scandinavian interior."
```
```
"Handmade candle on rustic wooden surface, warm lighting, shallow depth of
field, clean background."
```

### Kontextbilder
```
"A yoga session on a wooden dock by a Swedish lake, surrounded by pine trees
and calm water. Peaceful nordic summer morning with soft golden light."
```
```
"Cozy Swedish cafe interior with light wooden furniture, large windows showing
a cobblestone street outside, steam rising from coffee cups, hygge atmosphere."
```

---

## Exempel: Dåliga prompts

| Prompt | Problem |
|--------|---------|
| "Dark moody website background" | För vag, ingen fysisk beskrivning |
| "Portrait of John Smith smiling" | Triggar safety filters, namngivna personer |
| "Text saying 'Welcome'" | AI kan inte stava |
| "Beautiful delivery van" | För generisk, ingen kontext |
| "Perfect product shot" | Ospecifik, "perfect" ger inget |
| "A salon in a city" | Ingen geografisk kontext, kan bli vilken stad som helst |

---

## CLI-verktyget `generate_image`

### Användning

```bash
generate_image <output> -p "<prompt>" [flaggor]
```

### Flaggor

| Flagga | Beskrivning | Default |
|--------|-------------|---------|
| `-p, --prompt` | Beskrivning av önskad bild (obligatorisk) | - |
| `-a, --aspect-ratio` | Bildformat: `16:9`, `4:3`, `1:1`, `9:16`, `3:4`, `2:3`, `3:2`, `4:5`, `5:4`, `21:9` | `16:9` |
| `-P, --preset` | Bildmall (se presets nedan) | - |
| `-t, --type` | `photo` (fotorealistisk) eller `logo` (flat grafisk) | `photo` |
| `-r, --reference` | Referensbild (kan anges flera gånger) | - |
| `-s, --system-prompt` | Egen systemprompt-fil | auto |
| `-W, --width` | Bredd i pixlar | - |
| `-H, --height` | Höjd i pixlar | - |
| `--list-presets` | Lista alla bildmallar | - |
| `--json` | Output som JSON | - |

### Storleksprioritet (högst till lägst)

1. `--width` + `--height` (exakta pixelvärden)
2. `--width` + `-a` (höjd beräknas från aspect ratio)
3. `--height` + `-a` (bredd beräknas från aspect ratio)
4. `--preset` (fördefinierad storlek)
5. `-a` (aspect ratio med default-storlek)

### Presets

| Preset | Storlek | Kategori |
|--------|---------|----------|
| `logo_square` | 1024x1024 | Logo |
| `logo_banner` | 2048x512 | Logo |
| `logo_favicon` | 512x512 | Logo |
| `instagram_post` | 1080x1080 | Instagram |
| `instagram_story` | 1080x1920 | Instagram |
| `instagram_landscape` | 1080x566 | Instagram |
| `instagram_portrait` | 1080x1350 | Instagram |
| `web_hero` | 1920x1080 | Banner |
| `web_header` | 1920x400 | Banner |
| `facebook_cover` | 1200x630 | Banner |
| `twitter_header` | 1500x500 | Banner |
| `linkedin_cover` | 1584x396 | Banner |
| `youtube_thumbnail` | 1280x720 | Banner |
| `photo_landscape` | 1920x1080 | Allmänt |
| `photo_portrait` | 1080x1920 | Allmänt |
| `photo_classic` | 1600x1200 | Allmänt |

### Format

| Filändelse | Resultat |
|------------|----------|
| `.jpg` | Rasterbild |
| `.png` | Rasterbild med transparens |
| `.svg` | Vektorlogotyp (genererar PNG först, konverterar via vtracer) |

### System prompts

Skriptet väljer systemprompt automatiskt baserat på bildtyp:

| Läge | Systemprompt | Trigger |
|------|-------------|---------|
| Fotorealistisk | `/opt/generate-image/prompts/image_generator.md` | `-t photo` (default) |
| Logotyp | `/opt/generate-image/prompts/logo_generator.md` | `-t logo` eller `.svg`-output |
| Comic | `/opt/generate-image/prompts/comic_generator.md` | `-s /opt/generate-image/prompts/comic_generator.md` |
| Egen | Valfri `.md`-fil | `-s <sökväg>` |

### Miljövariabler

| Variabel | Beskrivning | Default |
|----------|-------------|---------|
| `IMAGE_PROVIDER` | `gemini` eller `openai` | `gemini` |
| `GEMINI_API_KEY` | API-nyckel för Gemini | - |
| `OPENAI_API_KEY` | API-nyckel för OpenAI | - |

### Exempel

```bash
# Hero-bild för webbplats
generate_image hero.jpg -p "Modern kontorsmiljö" -a 16:9

# Logo med transparent bakgrund (SVG)
generate_image logo.svg -p "Minimalistisk blomma" -t logo

# Instagram-post med preset
generate_image post.jpg -P instagram_post -p "Kaffe och bok"

# Med referensbild
generate_image ny.png -p "Liknande stil" -r original.jpg

# Använd OpenAI istället för Gemini
IMAGE_PROVIDER=openai generate_image bild.png -p "Solnedgång"
```

---

## Promptstrategi per bildtyp

Bildtyperna i tabellen ovan (`hero_bg`, `service_*`, etc.) är **konceptuella kategorier** som styr hur du formulerar prompten. De är inte CLI-parametrar utan guider för promptskrivning.

### Promptmall

```
[Composition/angle] of [specific subject with materials],
[lighting description],
[atmosphere/mood],
[geographical/cultural markers],
[technical photography terms],
[negative space instructions if hero/background]
```

### Exempel

**Scenario:** Spa i Stockholm, tjänstebild för massage

**CLI-anrop:**
```bash
generate_image massage.jpg -P web_hero -p "Close-up of warm massage stones arranged on a white linen towel, soft candlelight, aromatic oils in glass bottles nearby, clean Scandinavian spa interior with birch wood details, shallow depth of field, serene atmosphere."
```
