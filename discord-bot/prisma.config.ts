import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Placeholder for generate; runtime uses adapter in src/lib/prisma.ts
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/discord_bot",
  },
});
