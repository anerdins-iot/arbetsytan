# Prisma Schema & Migrationer

## Schema-ändringar kräver migration

**När du lägger till eller ändrar modeller, kolumner eller index i `schema.prisma` MÅSTE du skapa en migration.** Annars finns inte ändringarna i databasen och appen kraschar med fel som `column does not exist` eller `relation does not exist`.

### Arbetsflöde

1. Redigera `schema.prisma`
2. Kör: `npx prisma migrate dev --name beskrivande_namn`
3. Verifiera att filen skapades i `migrations/`
4. Committa schema + migrationsfilen

### Kommandon

```bash
npx prisma migrate dev --name add_my_feature   # Skapa migration (utveckling)
npx prisma migrate deploy                      # Applicera migrationer (produktion)
npx prisma generate                            # Generera Prisma Client
npx prisma studio                              # Öppna DB-gui
npx prisma db seed                             # Kör seed
```

Se `/workspace/docs/prisma.md` för mer information.
