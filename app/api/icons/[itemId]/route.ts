import { NextResponse } from "next/server";

import { resolveItemIcon } from "@/lib/assets/icon-map";
import { env } from "@/lib/config/env";
import { db } from "@/lib/db";

function fallbackIconUrl(itemId: string) {
  return `https://assets.tarkov.dev/${itemId}-icon.webp`;
}

function placeholderUrl(requestUrl: string) {
  return new URL("/placeholder-item.svg", requestUrl);
}

const ICON_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const MISSING_ICON_URL = "/placeholder-item.svg";

function isImageLikeResponse(contentType: string | null) {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();
  return normalized.startsWith("image/") || normalized.includes("application/octet-stream");
}

function placeholderRedirect(requestUrl: string) {
  const response = NextResponse.redirect(placeholderUrl(requestUrl));
  response.headers.set("cache-control", ICON_CACHE_CONTROL);
  return response;
}

function externalRedirect(requestUrl: string, externalUrl: string) {
  const response = NextResponse.redirect(externalUrl);
  response.headers.set("cache-control", ICON_CACHE_CONTROL);
  response.headers.set("x-icon-source", new URL(externalUrl, requestUrl).hostname);
  return response;
}

async function persistIconMapping(itemId: string, source: string, url: string) {
  try {
    await db.itemAsset.upsert({
      where: { itemId },
      create: {
        itemId,
        source,
        url,
      },
      update: {
        source,
        url,
      },
    });
  } catch {
    // Non-critical path.
  }
}

async function verifyImageUrl(url: string) {
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      next: {
        revalidate: env.TARKOV_CACHE_REVALIDATE_SECONDS,
      },
    });

    const headType = headResponse.headers.get("content-type");
    if (headResponse.ok && isImageLikeResponse(headType)) {
      return true;
    }

    // Some CDNs do not serve useful HEAD responses. Fallback to lightweight GET validation.
    const response = await fetch(url, {
      next: {
        revalidate: env.TARKOV_CACHE_REVALIDATE_SECONDS,
      },
    });

    const contentType = response.headers.get("content-type");
    if (!response.ok || !isImageLikeResponse(contentType)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await context.params;

    if (!itemId || itemId.length < 8) {
      return placeholderRedirect(request.url);
    }

    const existingAsset = await db.itemAsset.findUnique({ where: { itemId } });

    if (existingAsset?.url === MISSING_ICON_URL) {
      return placeholderRedirect(request.url);
    }

    // Fast path: once resolved, do not stream bytes through this route; let browser/CDN fetch directly.
    if (existingAsset?.url && /^https?:\/\//i.test(existingAsset.url)) {
      return externalRedirect(request.url, existingAsset.url);
    }

    let resolvedUrl = existingAsset?.url ?? null;

    if (!resolvedUrl) {
      const cachedItem = await db.itemCatalog.findUnique({ where: { id: itemId } });
      if (cachedItem) {
        resolvedUrl = await resolveItemIcon({
          id: itemId,
          name: cachedItem.name,
          normalizedName: cachedItem.normalizedName,
          iconLink: cachedItem.iconLink,
        });
      }
    }

    const fallbackUrl = fallbackIconUrl(itemId);
    const candidates = Array.from(new Set([resolvedUrl, fallbackUrl])).filter(
      (url): url is string => typeof url === "string" && url.length > 0 && !url.startsWith("/"),
    );

    for (const candidate of candidates) {
      const valid = await verifyImageUrl(candidate);
      if (!valid) {
        continue;
      }

      if (!existingAsset || existingAsset.url !== candidate) {
        await persistIconMapping(itemId, candidate === fallbackUrl ? "fallback" : existingAsset?.source ?? "resolved", candidate);
      }

      return externalRedirect(request.url, candidate);
    }

    await persistIconMapping(itemId, "missing", MISSING_ICON_URL);
    return placeholderRedirect(request.url);
  } catch (error) {
    console.error("Icon proxy unexpected error", error);
    return placeholderRedirect(request.url);
  }
}
