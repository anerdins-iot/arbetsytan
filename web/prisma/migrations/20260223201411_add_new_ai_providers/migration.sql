-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AIProvider" ADD VALUE 'CLAUDE_HAIKU';
ALTER TYPE "AIProvider" ADD VALUE 'CLAUDE_SONNET';
ALTER TYPE "AIProvider" ADD VALUE 'MISTRAL_LARGE';
ALTER TYPE "AIProvider" ADD VALUE 'MISTRAL_SMALL';
ALTER TYPE "AIProvider" ADD VALUE 'GROK_FAST';
ALTER TYPE "AIProvider" ADD VALUE 'GEMINI_PRO';
ALTER TYPE "AIProvider" ADD VALUE 'GEMINI_FLASH';
