import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

const partSchema = z.object({
  slotKey: z.string().min(1),
  itemId: z.string().min(1),
  itemName: z.string().min(1).optional(),
  source: z.string().optional(),
  priceRub: z.number().int().nonnegative().optional(),
});

const createBuildSchema = z.object({
  weaponItemId: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string()).max(12).default([]),
  patch: z.string().min(1).max(40),
  isPublic: z.boolean().default(false),
  parts: z.array(partSchema).default([]),
  snapshot: z
    .object({
      recoil: z.number().optional(),
      ergo: z.number().optional(),
      cost: z.number().int().optional(),
      weight: z.number().optional(),
      muzzleVelocity: z.number().optional(),
    })
    .optional(),
});

export async function GET() {
  const session = await getServerAuthSession();

  const where = session?.user?.id
    ? {
        OR: [{ isPublic: true }, { userId: session.user.id }],
      }
    : { isPublic: true };

  const builds = await db.build.findMany({
    where,
    include: {
      author: {
        select: {
          username: true,
          id: true,
        },
      },
      snapshot: true,
      parts: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return NextResponse.json({ builds });
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = createBuildSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const build = await db.build.create({
    data: {
      userId: session.user.id,
      weaponItemId: data.weaponItemId,
      name: data.name,
      description: data.description,
      tags: data.tags,
      patch: data.patch,
      isPublic: data.isPublic,
      parts: {
        create: data.parts.map((part) => ({
          slotKey: part.slotKey,
          itemId: part.itemId,
          itemName: part.itemName,
          source: part.source,
          priceRub: part.priceRub,
        })),
      },
      snapshot: data.snapshot
        ? {
            create: {
              recoil: data.snapshot.recoil,
              ergo: data.snapshot.ergo,
              cost: data.snapshot.cost,
              weight: data.snapshot.weight,
              muzzleVelocity: data.snapshot.muzzleVelocity,
            },
          }
        : undefined,
    },
    include: {
      parts: true,
      snapshot: true,
      author: {
        select: {
          username: true,
        },
      },
    },
  });

  return NextResponse.json({ build }, { status: 201 });
}
