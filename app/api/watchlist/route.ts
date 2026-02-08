import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const schema = z.object({
  itemId: z.string().min(1),
  targetPrice: z.number().int().positive().optional(),
});

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const watchlist = await db.watchlistItem.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ watchlist });
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const row = await db.watchlistItem.upsert({
    where: {
      userId_itemId: {
        userId: session.user.id,
        itemId: parsed.data.itemId,
      },
    },
    create: {
      userId: session.user.id,
      itemId: parsed.data.itemId,
      targetPrice: parsed.data.targetPrice,
    },
    update: {
      targetPrice: parsed.data.targetPrice,
    },
  });

  return NextResponse.json({ watchlistItem: row }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = schema.pick({ itemId: true }).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  await db.watchlistItem.delete({
    where: {
      userId_itemId: {
        userId: session.user.id,
        itemId: parsed.data.itemId,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
