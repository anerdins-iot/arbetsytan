import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicKeyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 10) ?? "NOT_SET",
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    openaiKeyPrefix: process.env.OPENAI_API_KEY?.substring(0, 10) ?? "NOT_SET",
    nodeEnv: process.env.NODE_ENV,
  });
}
