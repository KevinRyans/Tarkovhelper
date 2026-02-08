import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-1 px-4 py-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
        <p>Data: tarkov.dev GraphQL API. This project is not affiliated with Battlestate Games.</p>
        <Link href="/credits" className="underline-offset-4 hover:text-[var(--text)] hover:underline">
          Asset credits and licenses
        </Link>
      </div>
    </footer>
  );
}
