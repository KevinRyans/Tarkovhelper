import { NextResponse } from "next/server";

import { getSearchIndex } from "@/lib/tarkov/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const index = await getSearchIndex();

  const taskResults = index.tasks
    .filter((row) => row.name.toLowerCase().includes(q) || row.trader?.toLowerCase().includes(q) || row.map?.toLowerCase().includes(q))
    .slice(0, 15)
    .map((row) => ({ ...row, subtitle: [row.trader, row.map].filter(Boolean).join(" • ") }));

  const itemResults = index.items
    .filter((row) => row.name.toLowerCase().includes(q))
    .slice(0, 10)
    .map((row) => ({ ...row, subtitle: "Weapon / build platform" }));

  return NextResponse.json({
    results: [...taskResults, ...itemResults].slice(0, 20),
  });
}
