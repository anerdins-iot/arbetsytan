import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  let dbStatus = "ok";
  try {
    // Basic connectivity check
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("Healthcheck database error:", error);
    dbStatus = "error";
  }

  return NextResponse.json({
    status: dbStatus === "ok" ? "ok" : "error",
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
