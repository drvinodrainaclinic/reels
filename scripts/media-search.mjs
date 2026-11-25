// Safe, content-relevant image search & local caching for Reel Studio.
// Supports:
//  1. Google Custom Search JSON API (GOOGLE_CSE_KEY + GOOGLE_CSE_CX in .env, SafeSearch active)
//  2. Pexels API (PEXELS_API_KEY in .env)
//  3. Wikimedia Commons API (no key required, educational/safe media fallback)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import "./env.mjs";

const MEDIA_DIR = path.resolve("public/media");

function ensureMediaDir() {
  fs.mkdirSync(MEDIA_DIR, {recursive: true});
}

export async function searchImages(query, limit = 6) {
  const q = String(query || "").trim();
  if (!q) return [];

  const results = [];

  // 1. Google Custom Search (if configured)
  const gKey = process.env.GOOGLE_CSE_KEY;
  const gCx = process.env.GOOGLE_CSE_CX;
  if (gKey && gCx) {
    try {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", gKey);
      url.searchParams.set("cx", gCx);
      url.searchParams.set("q", q);
      url.searchParams.set("searchType", "image");
      url.searchParams.set("safe", "active");
      url.searchParams.set("num", String(Math.min(10, limit)));
      const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
      if (res.ok) {
        const data = await res.json();
        for (const item of data.items || []) {
          if (item.link) {
            results.push({
              url: item.link,
              thumb: item.image?.thumbnailLink || item.link,
              title: item.title || q,
              source: "Google Images",
            });
          }
        }
      }
    } catch {
      // fall through to next provider
    }
  }

  // 2. Pexels API (if configured and need more results)
  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey && results.length < limit) {
    try {
      const url = new URL("https://api.pexels.com/v1/search");
      url.searchParams.set("query", q);
      url.searchParams.set("per_page", String(limit));
      url.searchParams.set("orientation", "portrait");
      const res = await fetch(url, {
        headers: {Authorization: pexelsKey},
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        for (const p of data.photos || []) {
          results.push({
            url: p.src?.large2x || p.src?.large || p.src?.original,
            thumb: p.src?.medium || p.src?.small,
            title: p.alt || q,
            source: `Pexels (${p.photographer || "Pexels"})`,
          });
        }
      }
    } catch {
      // fall through
    }
  }

  // 3. Wikimedia Commons API (no key needed, safe educational photos/illustrations)
  if (results.length < limit) {
    try {
      const url = new URL("https://commons.wikimedia.org/w/api.php");
      url.searchParams.set("action", "query");
      url.searchParams.set("generator", "search");
      url.searchParams.set("gsrnamespace", "6");
      url.searchParams.set("gsrsearch", `${q} filetype:bitmap`);
      url.searchParams.set("gsrlimit", String(Math.min(12, limit * 2)));
      url.searchParams.set("prop", "imageinfo");
      url.searchParams.set("iiprop", "url|mime|size");
      url.searchParams.set("iiurlwidth", "900");
      url.searchParams.set("format", "json");
      url.searchParams.set("origin", "*");
      const res = await fetch(url, {
        headers: {"User-Agent": "ReelStudio/1.0 (educational video tool)"},
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const pages = Object.values(data.query?.pages || {});
        for (const p of pages) {
          const info = p.imageinfo?.[0];
          if (!info) continue;
          if (!/^image\/(jpeg|png|webp)$/i.test(info.mime || "")) continue;
          if ((info.width || 0) < 300) continue;
          results.push({
            url: info.thumburl || info.url,
            thumb: info.thumburl || info.url,
            title: String(p.title || q).replace(/^File:/, "").replace(/\.[^.]+$/, ""),
            source: "Wikimedia Commons",
          });
          if (results.length >= limit) break;
        }
      }
    } catch {
      // return whatever we have
    }
  }

  return results.slice(0, limit);
}

export async function downloadImageToPublic(imageUrl, prefix = "scene") {
  ensureMediaDir();
  const raw = String(imageUrl || "").trim();
  if (!raw) throw new Error("Empty image URL");

  // If it's already a local public/ path, return normalized public-relative path
  if (!/^https?:\/\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, "");
    if (fs.existsSync(path.resolve("public", clean))) return clean;
    throw new Error(`Local image not found in public/: ${clean}`);
  }

  const res = await fetch(raw, {
    headers: {"User-Agent": "ReelStudio/1.0"},
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error(`URL is not an image (${ct || "unknown"})`);

  let ext = ".jpg";
  if (ct.includes("png")) ext = ".png";
  else if (ct.includes("webp")) ext = ".webp";

  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 10);
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) || "scene";
  const filename = `${safePrefix}-${hash}${ext}`;
  fs.writeFileSync(path.join(MEDIA_DIR, filename), buf);
  return `media/${filename}`;
}
