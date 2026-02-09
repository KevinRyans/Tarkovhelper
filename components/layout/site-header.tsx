import Image from "next/image";
import Link from "next/link";

import { getServerAuthSession } from "@/lib/auth/session";

import { HeaderAuthActions } from "@/components/layout/header-auth-actions";
import { HeaderGlobalCommand } from "@/components/layout/header-global-command";
import { HeaderNav } from "@/components/layout/header-nav";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/kappa", label: "Kappa" },
  { href: "/builds", label: "Builds" },
  { href: "/companion", label: "Companion" },
  { href: "/flea", label: "Flea" },
  { href: "/credits", label: "Credits" },
];

export async function SiteHeader() {
  const session = await getServerAuthSession();
  const username = session?.user?.username ?? session?.user?.name ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex h-[72px] w-[233px] shrink-0 items-center sm:h-24 sm:w-[310px] lg:h-32 lg:w-[413px]"
              aria-label="Escape from Tarkov Helper"
            >
              <Image
                src="/tarkov-helper-logo-banner.webp"
                alt="Escape from Tarkov Helper"
                width={920}
                height={285}
                priority
                quality={62}
                sizes="(min-width: 1024px) 413px, (min-width: 640px) 310px, 234px"
                className="h-full w-full object-contain"
              />
            </Link>
          </div>

          <HeaderGlobalCommand />

          <HeaderAuthActions username={username} />
        </div>

        <HeaderNav items={navItems} />
      </div>
    </header>
  );
}
