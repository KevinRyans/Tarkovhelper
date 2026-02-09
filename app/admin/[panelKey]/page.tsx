import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { generateInviteCodesAction, setInviteOnlyModeAction } from "@/app/admin/[panelKey]/actions";
import { isAdminSession, isValidAdminPanelKey } from "@/lib/admin/auth";
import { getInviteOnlyMode } from "@/lib/admin/invite-mode";
import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "-";
  }

  return value.toLocaleString();
}

export default async function AdminPanelPage(props: { params: Promise<{ panelKey: string }> }) {
  const { panelKey } = await props.params;

  if (!isValidAdminPanelKey(panelKey)) {
    notFound();
  }

  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/admin/${panelKey}`)}`);
  }

  if (!isAdminSession(session)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin Access Denied</CardTitle>
            <CardDescription>This account is not allowed to access the admin panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Signed in as: {session.user.email}</p>
            <p className="text-[var(--muted)]">Use your owner account, then open this link again.</p>
            <Link href="/dashboard" className="text-[var(--accent)] hover:underline">
              Back to dashboard
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [inviteOnlyMode, totalUsers, unusedCount, usedCount, unusedCodes, recentUsedCodes, users] = await Promise.all([
    getInviteOnlyMode(),
    db.user.count(),
    db.inviteCode.count({ where: { usedAt: null } }),
    db.inviteCode.count({ where: { usedAt: { not: null } } }),
    db.inviteCode.findMany({
      where: { usedAt: null },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { code: true, createdAt: true },
    }),
    db.inviteCode.findMany({
      where: { usedAt: { not: null } },
      orderBy: { usedAt: "desc" },
      take: 25,
      select: {
        code: true,
        usedAt: true,
        usedBy: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        usedInviteCodes: {
          where: { usedAt: { not: null } },
          orderBy: { usedAt: "desc" },
          take: 1,
          select: {
            code: true,
            usedAt: true,
          },
        },
      },
    }),
  ]);

  const inviteModeOnAction = setInviteOnlyModeAction.bind(null, panelKey, true);
  const inviteModeOffAction = setInviteOnlyModeAction.bind(null, panelKey, false);
  const createCodesAction = generateInviteCodesAction.bind(null, panelKey);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Admin Panel</h1>
        <p className="text-sm text-[var(--muted)]">Private controls for invite-only mode, code generation, and user visibility.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Invite mode</CardDescription>
            <CardTitle>{inviteOnlyMode ? "Closed" : "Open"}</CardTitle>
          </CardHeader>
          <CardContent>
            {inviteOnlyMode ? <Badge variant="warning">Invite code required</Badge> : <Badge variant="success">Public registration</Badge>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Unused invites</CardDescription>
            <CardTitle>{unusedCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Used invites</CardDescription>
            <CardTitle>{usedCount}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Total users</CardDescription>
            <CardTitle>{totalUsers}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Invite-Only Mode</CardTitle>
            <CardDescription>Toggle registration lock in real time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action={inviteModeOnAction}>
              <Button type="submit" variant={inviteOnlyMode ? "default" : "secondary"}>
                Enable Invite-Only
              </Button>
            </form>
            <form action={inviteModeOffAction}>
              <Button type="submit" variant={!inviteOnlyMode ? "default" : "secondary"}>
                Disable Invite-Only
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate Invite Codes</CardTitle>
            <CardDescription>Create additional one-time invite codes instantly.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCodesAction} className="flex flex-wrap items-end gap-2">
              <div className="w-28">
                <label className="mb-1 block text-xs text-[var(--muted)]" htmlFor="count">
                  Count
                </label>
                <Input id="count" name="count" type="number" min={1} max={200} defaultValue={5} />
              </div>
              <Button type="submit">Generate</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Unused Invite Codes</CardTitle>
            <CardDescription>Share these privately. Each code can only be used once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unusedCodes.length === 0 ? <p className="text-sm text-[var(--muted)]">No unused codes available.</p> : null}
            {unusedCodes.map((row) => (
              <div key={row.code} className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                <p className="mono text-sm">{row.code}</p>
                <p className="text-xs text-[var(--muted)]">{formatDate(row.createdAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Code Usage</CardTitle>
            <CardDescription>Latest invite claims.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentUsedCodes.length === 0 ? <p className="text-sm text-[var(--muted)]">No invite codes used yet.</p> : null}
            {recentUsedCodes.map((row) => (
              <div key={row.code} className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                <p className="mono text-sm">{row.code}</p>
                <p className="text-xs text-[var(--muted)]">
                  {row.usedBy?.username ?? row.usedBy?.email ?? "unknown"} | {formatDate(row.usedAt)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>User Overview (latest 50)</CardTitle>
          <CardDescription>Quick user snapshot for beta administration.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="px-2 py-2">Username</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Joined</th>
                <th className="px-2 py-2">Invite code</th>
                <th className="px-2 py-2">Code used at</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const used = user.usedInviteCodes[0];
                return (
                  <tr key={user.id} className="border-b border-[var(--border)]">
                    <td className="px-2 py-2 font-medium">{user.username}</td>
                    <td className="px-2 py-2">{user.email}</td>
                    <td className="px-2 py-2">{formatDate(user.createdAt)}</td>
                    <td className="px-2 py-2 mono">{used?.code ?? "-"}</td>
                    <td className="px-2 py-2">{formatDate(used?.usedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

