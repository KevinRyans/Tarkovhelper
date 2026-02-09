"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function HeaderAuthActions(props: { username: string | null }) {
  return (
    <div className="flex min-w-[220px] items-center justify-end gap-2">
      {props.username ? (
        <>
          <Link href="/profile" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
            @{props.username}
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
  );
}
