"use client";

import dynamic from "next/dynamic";

const GlobalCommand = dynamic(
  () => import("@/components/search/global-command").then((module) => module.GlobalCommand),
  {
    ssr: false,
    loading: () => (
      <div
        className="hidden h-10 min-w-[260px] rounded-md border border-[var(--border)] bg-[var(--surface-2)] lg:flex"
        aria-hidden
      />
    ),
  },
);

export function HeaderGlobalCommand() {
  return <GlobalCommand />;
}
