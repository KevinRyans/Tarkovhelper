import { NextResponse } from "next/server";

import { getFleaDefaultSnapshot, searchFleaItems } from "@/lib/tarkov/service";

function clampLimit(input: string | null, fallback = 40) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(10, Math.min(120, Math.floor(parsed)));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = clampLimit(searchParams.get("limit"), q ? 40 : 80);
  const headers = {
    "cache-control": q ? "public, max-age=15, stale-while-revalidate=120" : "public, max-age=60, stale-while-revalidate=600",
  };

  try {
    if (!q) {
      const snapshot = await getFleaDefaultSnapshot(limit);
      return NextResponse.json({
        items: snapshot.items,
        lastUpdated: snapshot.lastUpdated,
        preloaded: true,
      }, { headers });
    }

    const items = await searchFleaItems(q, limit);
    return NextResponse.json({
      items,
      lastUpdated: new Date().toISOString(),
      preloaded: false,
    }, { headers });
  } catch (error) {
    console.error("Flea API error", error);
    return NextResponse.json({ items: [], lastUpdated: new Date().toISOString(), preloaded: false }, { status: 200, headers });
  }
}
