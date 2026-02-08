import { createHash, randomBytes } from "crypto";

const TOKEN_PREFIX = "thp_";
const TOKEN_BYTES = 24;

export function hashCompanionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function makeTokenPreview(token: string) {
  const head = token.slice(0, 10);
  const tail = token.slice(-6);
  return `${head}...${tail}`;
}

export function generateCompanionToken() {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("hex")}`;
  return {
    token,
    tokenHash: hashCompanionToken(token),
    tokenPreview: makeTokenPreview(token),
  };
}

export function extractCompanionToken(request: Request, bodyToken?: string | null) {
  const headerToken = request.headers.get("x-companion-token")?.trim();
  if (headerToken) {
    return headerToken;
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      return token;
    }
  }

  const parsedBodyToken = bodyToken?.trim();
  if (parsedBodyToken) {
    return parsedBodyToken;
  }

  return null;
}
