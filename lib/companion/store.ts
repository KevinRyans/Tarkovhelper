import { randomUUID } from "crypto";

import { db } from "@/lib/db";

type CompanionStatusRow = {
  tokenPreview: string;
  createdAt: Date;
  rotatedAt: Date;
  lastUsedAt: Date | null;
  lastSource: string | null;
};

type CompanionLookupRow = {
  userId: string;
};

type CompanionUpsertResult = {
  tokenPreview: string;
  createdAt: Date;
  rotatedAt: Date;
};

type DbWithCompanionDelegate = typeof db & {
  companionToken: {
    findUnique: (...args: unknown[]) => Promise<unknown>;
    upsert: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
    deleteMany: (...args: unknown[]) => Promise<unknown>;
  };
};

function hasCompanionDelegate(client: typeof db): client is DbWithCompanionDelegate {
  const candidate = client as unknown as { companionToken?: { findUnique?: unknown } };
  return Boolean(candidate.companionToken && typeof candidate.companionToken.findUnique === "function");
}

export async function getCompanionStatusByUserId(userId: string): Promise<CompanionStatusRow | null> {
  if (hasCompanionDelegate(db)) {
    const row = await db.companionToken.findUnique({
      where: { userId },
      select: {
        tokenPreview: true,
        createdAt: true,
        rotatedAt: true,
        lastUsedAt: true,
        lastSource: true,
      },
    });

    return (row as CompanionStatusRow | null) ?? null;
  }

  const rows = await db.$queryRaw<CompanionStatusRow[]>`
    SELECT
      "tokenPreview" as "tokenPreview",
      "createdAt" as "createdAt",
      "rotatedAt" as "rotatedAt",
      "lastUsedAt" as "lastUsedAt",
      "lastSource" as "lastSource"
    FROM "CompanionToken"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function upsertCompanionToken(params: {
  userId: string;
  tokenHash: string;
  tokenPreview: string;
}): Promise<CompanionUpsertResult> {
  if (hasCompanionDelegate(db)) {
    const row = await db.companionToken.upsert({
      where: { userId: params.userId },
      create: {
        userId: params.userId,
        tokenHash: params.tokenHash,
        tokenPreview: params.tokenPreview,
        rotatedAt: new Date(),
      },
      update: {
        tokenHash: params.tokenHash,
        tokenPreview: params.tokenPreview,
        rotatedAt: new Date(),
      },
      select: {
        tokenPreview: true,
        createdAt: true,
        rotatedAt: true,
      },
    });

    return row as CompanionUpsertResult;
  }

  const rows = await db.$queryRaw<CompanionUpsertResult[]>`
    INSERT INTO "CompanionToken" (
      "id",
      "userId",
      "tokenHash",
      "tokenPreview",
      "rotatedAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${params.userId},
      ${params.tokenHash},
      ${params.tokenPreview},
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT ("userId")
    DO UPDATE SET
      "tokenHash" = EXCLUDED."tokenHash",
      "tokenPreview" = EXCLUDED."tokenPreview",
      "rotatedAt" = NOW(),
      "updatedAt" = NOW()
    RETURNING
      "tokenPreview" as "tokenPreview",
      "createdAt" as "createdAt",
      "rotatedAt" as "rotatedAt"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to upsert companion token");
  }
  return row;
}

export async function deleteCompanionTokenByUserId(userId: string) {
  if (hasCompanionDelegate(db)) {
    await db.companionToken.deleteMany({
      where: { userId },
    });
    return;
  }

  await db.$executeRaw`DELETE FROM "CompanionToken" WHERE "userId" = ${userId}`;
}

export async function getCompanionUserByTokenHash(tokenHash: string): Promise<CompanionLookupRow | null> {
  if (hasCompanionDelegate(db)) {
    const row = await db.companionToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    return (row as CompanionLookupRow | null) ?? null;
  }

  const rows = await db.$queryRaw<CompanionLookupRow[]>`
    SELECT "userId" as "userId"
    FROM "CompanionToken"
    WHERE "tokenHash" = ${tokenHash}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function touchCompanionTokenUsage(tokenHash: string, source: string) {
  if (hasCompanionDelegate(db)) {
    await db.companionToken.update({
      where: { tokenHash },
      data: {
        lastUsedAt: new Date(),
        lastSource: source,
      },
    });
    return;
  }

  await db.$executeRaw`
    UPDATE "CompanionToken"
    SET
      "lastUsedAt" = NOW(),
      "lastSource" = ${source},
      "updatedAt" = NOW()
    WHERE "tokenHash" = ${tokenHash}
  `;
}
