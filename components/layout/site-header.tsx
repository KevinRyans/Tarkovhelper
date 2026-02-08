"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { GlobalCommand } from "@/components/search/global-command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const nav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/kappa", label: "Kappa" },
  { href: "/builds", label: "Builds" },
  { href: "/companion", label: "Companion" },
  { href: "/flea", label: "Flea" },
  { href: "/credits", label: "Credits" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="inline-flex shrink-0 items-center" aria-label="Escape from Tarkov Helper">
              <Image
                src="/tarkov-helper-logo-banner.png"
                alt="Escape from Tarkov Helper"
                width={920}
                height={290}
                priority
                className="h-[72px] w-auto object-contain sm:h-24 lg:h-32"
              />
            </Link>
          </div>

          <GlobalCommand />

          <div className="flex items-center gap-2">
            {status === "authenticated" ? (
              <>
                <Link href="/profile" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
                  @{session.user.username}
                </Link>
                <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/auth/login" })}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button size="sm" variant="secondary">
                    Log in
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button size="sm">Create account</Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
