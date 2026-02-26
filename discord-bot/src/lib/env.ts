/**
 * Environment variable validation and typed exports.
 * Validates all required variables on import and lists every missing one.
 */

const REQUIRED_KEYS = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DATABASE_URL",
  "REDIS_URL",
] as const;

const OPTIONAL_WITH_DEFAULTS: Record<string, string> = {
  WEB_APP_URL: "http://localhost:3000",
  S3_ENDPOINT: "",
  S3_ACCESS_KEY: "",
  S3_SECRET_KEY: "",
  S3_BUCKET: "",
};

function validateEnv(): void {
  const missing = REQUIRED_KEYS.filter(
    (key) => !process.env[key] || process.env[key]!.trim() === ""
  );
  if (missing.length > 0) {
    const list = missing.map((k) => `   - ${k}`).join("\n");
    const message = `❌ Missing required environment variables:\n${list}\n\nPlease set these in your .env file or environment.`;
    throw new Error(message);
  }
}

validateEnv();

export const env = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL!,
  WEB_APP_URL:
    process.env.WEB_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    OPTIONAL_WITH_DEFAULTS.WEB_APP_URL,
  S3_ENDPOINT: process.env.S3_ENDPOINT?.trim() ?? OPTIONAL_WITH_DEFAULTS.S3_ENDPOINT,
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY?.trim() ?? OPTIONAL_WITH_DEFAULTS.S3_ACCESS_KEY,
  S3_SECRET_KEY: process.env.S3_SECRET_KEY?.trim() ?? OPTIONAL_WITH_DEFAULTS.S3_SECRET_KEY,
  S3_BUCKET: process.env.S3_BUCKET?.trim() ?? OPTIONAL_WITH_DEFAULTS.S3_BUCKET,
} as const;
