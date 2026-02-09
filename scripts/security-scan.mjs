import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const MAX_TEXT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".gz",
  ".br",
  ".mp4",
  ".mp3",
]);

const ALLOWLIST_CONTEXT = [
  "replace-with",
  "owner@example.com",
  "thp_...",
  "postgresql://user:password@host",
  "your-domain-or-localhost",
];

const SECRET_PATTERNS = [
  {
    label: "OpenAI API key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "GitHub token",
    regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  },
  {
    label: "AWS access key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    label: "Private key block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    label: "JWT-like token",
    regex: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
  },
];

function isBinaryFile(file) {
  return BINARY_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function isAllowlistedContext(content, start, matchLength) {
  const from = Math.max(0, start - 50);
  const to = Math.min(content.length, start + matchLength + 50);
  const context = content.slice(from, to).toLowerCase();
  return ALLOWLIST_CONTEXT.some((entry) => context.includes(entry));
}

function snippet(content, start, matchLength) {
  const from = Math.max(0, start - 20);
  const to = Math.min(content.length, start + matchLength + 20);
  return content.slice(from, to).replace(/\s+/g, " ").trim();
}

function getTrackedFiles() {
  const output = execSync("git ls-files -z", { encoding: "utf8" });
  return output.split("\0").filter(Boolean);
}

const trackedFiles = getTrackedFiles();
const findings = [];

for (const forbidden of [".env", ".env.local"]) {
  if (trackedFiles.includes(forbidden)) {
    findings.push({
      file: forbidden,
      label: "Sensitive env file is tracked by git",
      value: forbidden,
    });
  }
}

for (const file of trackedFiles) {
  if (isBinaryFile(file)) {
    continue;
  }

  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }

  if (!stats.isFile() || stats.size > MAX_TEXT_FILE_SIZE_BYTES) {
    continue;
  }

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const value = match[0] ?? "";
      const start = match.index ?? 0;
      if (!value || isAllowlistedContext(content, start, value.length)) {
        continue;
      }

      findings.push({
        file,
        label: pattern.label,
        value: snippet(content, start, value.length),
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Security scan found potential secrets in tracked files:");
  for (const finding of findings) {
    console.error(`- [${finding.label}] ${finding.file}: ${finding.value}`);
  }
  console.error("\nRotate exposed secrets and remove them from git history before publishing.");
  process.exit(1);
}

console.log("Security scan passed: no obvious secrets found in tracked files.");
