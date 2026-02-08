import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/session";
import { deleteCompanionTokenByUserId, getCompanionStatusByUserId, upsertCompanionToken } from "@/lib/companion/store";
import { generateCompanionToken } from "@/lib/companion/token";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await getCompanionStatusByUserId(session.user.id);

    return NextResponse.json({
      configured: Boolean(token),
      tokenPreview: token?.tokenPreview ?? null,
      createdAt: token?.createdAt ?? null,
      rotatedAt: token?.rotatedAt ?? null,
      lastUsedAt: token?.lastUsedAt ?? null,
      lastSource: token?.lastSource ?? null,
    });
  } catch (error) {
    console.error("Companion token status failed", error);
    return NextResponse.json(
      {
        error: "Companion token setup not ready. Run `npm run prisma:push` and restart dev server.",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const generated = generateCompanionToken();
  try {
    const row = await upsertCompanionToken({
      userId: session.user.id,
      tokenHash: generated.tokenHash,
      tokenPreview: generated.tokenPreview,
    });

    return NextResponse.json({
      token: generated.token,
      tokenPreview: row.tokenPreview,
      createdAt: row.createdAt,
      rotatedAt: row.rotatedAt,
    });
  } catch (error) {
    console.error("Companion token create failed", error);
    return NextResponse.json(
      {
        error: "Companion token setup not ready. Run `npm run prisma:push` and restart dev server.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteCompanionTokenByUserId(session.user.id);
  } catch (error) {
    console.error("Companion token revoke failed", error);
    return NextResponse.json(
      {
        error: "Companion token setup not ready. Run `npm run prisma:push` and restart dev server.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
