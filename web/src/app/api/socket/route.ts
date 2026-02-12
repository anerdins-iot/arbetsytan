import { NextResponse } from "next/server";
import { getSocketServer } from "@/lib/socket";

export async function GET() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  getSocketServer();
  return NextResponse.json({ ok: true });
}
