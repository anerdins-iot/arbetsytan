/**
 * POST /api/auth/mobile
 * Mobile login endpoint. Takes email + password, returns JWT tokens.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMobile } from "@/lib/auth-mobile";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "E-post och lösenord krävs" },
        { status: 400 }
      );
    }

    const result = await authenticateMobile(email, password);

    if (!result) {
      return NextResponse.json(
        { error: "Felaktig e-post eller lösenord" },
        { status: 401 }
      );
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Internt serverfel" },
      { status: 500 }
    );
  }
}
