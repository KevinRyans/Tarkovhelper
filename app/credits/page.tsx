import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/config/env";

export default function CreditsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Credits & Attribution</h1>
        <p className="text-sm text-[var(--muted)]">Data and assets used by this project.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data provider</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Tarkov data source: <Link href="https://api.tarkov.dev/graphql" target="_blank" className="text-[var(--accent)] hover:underline">api.tarkov.dev/graphql</Link>
          </p>
          <p>Used for tasks, items, traders, prices and compatibility metadata.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Icon sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Primary in-app fallback icons: tarkov.dev assets CDN via proxy route `/api/icons/[itemId]`.</p>
          <p>
            Optional external icon pack base URL: {env.EFT_ICONS_BASE_URL ? <span className="mono">{env.EFT_ICONS_BASE_URL}</span> : "not configured"}
          </p>
          <p>
            Optional wiki fallback icon base URL: {env.EFT_WIKI_ICON_BASE_URL ? <span className="mono">{env.EFT_WIKI_ICON_BASE_URL}</span> : "not configured"}
          </p>
          <p>Check and comply with each source license/TOS before deployment.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disclaimer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>This project is community-made and not affiliated with Battlestate Games.</p>
          <p>Escape from Tarkov and related assets/trademarks belong to their respective owners.</p>
        </CardContent>
      </Card>
    </div>
  );
}
