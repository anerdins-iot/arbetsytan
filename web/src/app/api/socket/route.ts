import { NextResponse } from "next/server";

// Socket.IO is now integrated into the custom server (server.ts)
// This endpoint is kept for backwards compatibility but does nothing
export async function GET() {
  return NextResponse.json({ ok: true, message: "Socket.IO runs via custom server" });
}
