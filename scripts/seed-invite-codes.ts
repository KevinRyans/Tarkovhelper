import { db } from "../lib/db";
import { ensureInviteCodePool, normalizeInviteCodePrefix } from "../lib/invites/service";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

async function main() {
  const target = parsePositiveInt(getArgValue("--target"), 25);
  const prefix = normalizeInviteCodePrefix(getArgValue("--prefix"));
  const tokenLength = parsePositiveInt(getArgValue("--length"), 8);
  const resetUnused = hasFlag("--reset-unused");

  const result = await ensureInviteCodePool({
    target,
    prefix,
    tokenLength,
    resetUnused,
  });

  if (resetUnused) {
    console.log(`Removed ${result.removedUnused} unused invite codes.`);
  }

  console.log("");
  console.log(`Invite code pool ready. Unused: ${result.unusedCodes.length}, Used: ${result.usedCount}`);
  console.log(`Target requested: ${result.target} (created ${result.created.length} this run)`);
  console.log("");
  console.log("Unused invite codes:");
  for (const code of result.unusedCodes) {
    console.log(code);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

