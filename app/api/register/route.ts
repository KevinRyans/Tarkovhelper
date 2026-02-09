import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getInviteOnlyMode } from "@/lib/admin/invite-mode";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";

const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(72),
  inviteCode: z.string().min(5).max(64).optional(),
});

class InviteCodeValidationError extends Error {}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid registration payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const username = parsed.data.username;
    const inviteCode = parsed.data.inviteCode?.trim().toUpperCase();
    const inviteOnlyMode = await getInviteOnlyMode();

    if (inviteOnlyMode && !inviteCode) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const existing = await db.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
    }

    const hashed = await hashPassword(parsed.data.password);

    const user = await db.$transaction(async (tx) => {
      if (inviteOnlyMode && inviteCode) {
        const claimed = await tx.inviteCode.updateMany({
          where: {
            code: inviteCode,
            usedAt: null,
          },
          data: {
            usedAt: new Date(),
          },
        });

        if (claimed.count !== 1) {
          throw new InviteCodeValidationError("Invite code invalid or already used");
        }
      }

      const createdUser = await tx.user.create({
        data: {
          email,
          username,
          hash: hashed,
          settings: {
            create: {
              level: 1,
              fleaUnlocked: false,
              traderLevels: {},
            },
          },
        },
        select: {
          id: true,
          email: true,
          username: true,
        },
      });

      if (inviteOnlyMode && inviteCode) {
        await tx.inviteCode.update({
          where: { code: inviteCode },
          data: {
            usedById: createdUser.id,
          },
        });
      }

      return createdUser;
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof InviteCodeValidationError) {
      return NextResponse.json({ error: "Invite code invalid or already used" }, { status: 403 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email or username already in use" }, { status: 409 });
    }

    console.error("Register error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
