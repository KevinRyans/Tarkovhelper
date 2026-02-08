import { FleaMarket } from "@/components/flea/flea-market";
import { getFleaDefaultSnapshot } from "@/lib/tarkov/service";

export const dynamic = "force-dynamic";

export default async function FleaPage() {
  let initialItems: Awaited<ReturnType<typeof getFleaDefaultSnapshot>>["items"] = [];
  let initialLastUpdated: string | null = null;

  try {
    const snapshot = await getFleaDefaultSnapshot(90);
    initialItems = snapshot.items;
    initialLastUpdated = snapshot.lastUpdated;
  } catch (error) {
    console.error("Failed to preload flea page", error);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Flea Market</h1>
        <p className="text-sm text-[var(--muted)]">Price search, trend signals and watchlist foundation.</p>
      </div>

      <FleaMarket initialItems={initialItems} initialLastUpdated={initialLastUpdated} />
    </div>
  );
}
