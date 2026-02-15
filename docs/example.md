---
title: Exempel-dokumentation
description: En kort beskrivning av vad denna doc handlar om
tags: [example, demo]
---

# Exempel-dokumentation

Detta är en exempelfil som visar hur YAML frontmatter används för att generera dokumentationsindex.

## Frontmatter-format

Frontmatter placeras mellan `---` i början av filen:

```yaml
---
title: Titel på dokumentet
description: En kort beskrivning
tags: [tag1, tag2]
---
```

## Tillgängliga fält

- `title` - Dokumentets titel
- `description` - En kort beskrivning som visas i indexet
- `tags` - Lista med taggar för kategorisering

## Användning

När en agent startas skannas alla `.md`-filer i `/workspace/docs/` och deras frontmatter extraheras för att generera ett dokumentationsindex i systemprompten.
