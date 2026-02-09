import { randomInt } from "node:crypto";

import { Prisma } from "@prisma/client";

import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type CreateInviteCodesInput = {
  count: number;
  prefix?: string;
  tokenLength?: number;
};

export type EnsureInvitePoolInput = {
  target: number;
  prefix?: string;
  tokenLength?: number;
  resetUnused?: boolean;
};

export function normalizeInviteCodePrefix(raw: string | undefined) {
  const fallback = env.INVITE_CODE_PREFIX;
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 12);
}

function normalizeTokenLength(raw: number | undefined) {
  const value = raw ?? env.INVITE_CODE_LENGTH;
  if (!Number.isFinite(value)) {
    return env.INVITE_CODE_LENGTH;
  }

  return Math.max(4, Math.min(20, Math.floor(value)));
}

function generateToken(length: number) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += INVITE_ALPHABET[randomInt(0, INVITE_ALPHABET.length)];
  }
  return output;
}

function formatInviteCode(prefix: string, tokenLength: number) {
  const token = generateToken(tokenLength);
  const groups = token.match(/.{1,4}/g)?.join("-") ?? token;
  return `${prefix}-${groups}`;
}

async function createUniqueInviteCode(prefix: string, tokenLength: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = formatInviteCode(prefix, tokenLength);

    try {
      const row = await db.inviteCode.create({
        data: { code },
        select: { code: true },
      });

      return row.code;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate a unique invite code.");
}

export async function createInviteCodes(input: CreateInviteCodesInput) {
  const count = Math.max(0, Math.floor(input.count));
  const prefix = normalizeInviteCodePrefix(input.prefix);
  const tokenLength = normalizeTokenLength(input.tokenLength);
  const created: string[] = [];

  for (let index = 0; index < count; index += 1) {
    created.push(await createUniqueInviteCode(prefix, tokenLength));
  }

  return created;
}

export async function ensureInviteCodePool(input: EnsureInvitePoolInput) {
  const target = Math.max(0, Math.floor(input.target));
  const prefix = normalizeInviteCodePrefix(input.prefix);
  const tokenLength = normalizeTokenLength(input.tokenLength);

  let removedUnused = 0;
  if (input.resetUnused) {
    const removed = await db.inviteCode.deleteMany({
      where: { usedAt: null },
    });
    removedUnused = removed.count;
  }

  const existingUnused = await db.inviteCode.count({
    where: { usedAt: null },
  });

  const needed = Math.max(0, target - existingUnused);
  const created = await createInviteCodes({
    count: needed,
    prefix,
    tokenLength,
  });

  const [unusedCodes, usedCount] = await Promise.all([
    db.inviteCode.findMany({
      where: { usedAt: null },
      orderBy: { createdAt: "asc" },
      select: { code: true },
    }),
    db.inviteCode.count({
      where: { usedAt: { not: null } },
    }),
  ]);

  return {
    removedUnused,
    created,
    target,
    unusedCodes: unusedCodes.map((row) => row.code),
    usedCount,
  };
}

