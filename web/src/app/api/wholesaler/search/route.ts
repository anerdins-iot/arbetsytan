import { NextRequest, NextResponse } from "next/server";
import { searchWholesalers } from "@/lib/wholesaler-search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.length < 2) {
    return NextResponse.json({ elektroskandia: null, ahlsell: null });
  }
  const results = await searchWholesalers(q, { limit: 10 });
  return NextResponse.json(results);
}
