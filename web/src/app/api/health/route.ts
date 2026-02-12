import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "ok";
  try {
    // Basic connectivity check
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("Healthcheck database error:", error);
    dbStatus = "error";
  }

  // Return 200 even if database is down - container health is separate from db health
  // This allows the container to start while database issues are investigated
  return NextResponse.json(
    {
      status: dbStatus === "ok" ? "healthy" : "degraded",
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    { status: 200 }
  );
}
