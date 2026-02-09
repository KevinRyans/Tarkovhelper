import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
};

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());
const optionalBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value;
}, z.boolean().optional());
const inviteCodePrefix = z.preprocess((value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "THB";
  }

  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}, z.string().min(2).max(12));

const envSchema = z.object({
  DATABASE_URL: optionalString,
  NEXTAUTH_SECRET: optionalString,
  NEXTAUTH_URL: optionalUrl,
  INVITE_ONLY_MODE: optionalBoolean.default(true),
  ADMIN_EMAIL: optionalEmail,
  ADMIN_PANEL_KEY: optionalString,
  INVITE_CODE_PREFIX: inviteCodePrefix.default("THB"),
  INVITE_CODE_LENGTH: z.coerce.number().min(4).max(20).default(8),
  OPENAI_API_KEY: optionalString,
  TARKOV_DEV_ENDPOINT: z.string().url().default("https://api.tarkov.dev/graphql"),
  TARKOV_DEV_REQUESTS_PER_SECOND: z.coerce.number().min(1).max(20).default(4),
  TARKOV_CACHE_REVALIDATE_SECONDS: z.coerce.number().min(60).default(900),
  EFT_ICONS_BASE_URL: optionalUrl,
  EFT_ICONS_LICENSE: optionalString,
  EFT_WIKI_ICON_BASE_URL: optionalUrl,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

export function assertRequiredEnv(...keys: Array<keyof typeof env>) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
