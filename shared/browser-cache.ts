/**
 * shared/browser-cache.ts
 *
 * Caches app observations to pipeline-state/app-observations.json.
 * Within a pipeline run, inspection happens once. Cache is invalidated
 * by TTL (30 min) or the --force-inspect flag.
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { EnhancedAppStructure } from "./types";
import { inspectAppComprehensive } from "./browser-inspector";

const CACHE_FILE = path.resolve("pipeline-state", "app-observations.json");
const CACHE_TTL_MS = 30 * 60 * 1_000; // 30 minutes

interface CacheEntry {
  timestamp: number;
  baseUrl: string;
  data: EnhancedAppStructure;
}

/**
 * Returns cached observations if valid, otherwise runs a fresh inspection.
 *
 * @param baseUrl   The live app URL to inspect
 * @param forceInspect  If true, bypass cache and always run fresh inspection
 */
export async function getCachedOrInspect(
  baseUrl: string,
  forceInspect = false
): Promise<EnhancedAppStructure | null> {
  if (!forceInspect) {
    const cached = await loadCache(baseUrl);
    if (cached) {
      console.log(
        `  [CACHE] Using cached app observations (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`
      );
      return cached.data;
    }
  }

  console.log(`  [CACHE] Running fresh app inspection at ${baseUrl}...`);
  const result = await inspectAppComprehensive(baseUrl);

  if (result) {
    await saveCache(baseUrl, result);
  }

  return result;
}

async function loadCache(baseUrl: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const entry = JSON.parse(raw) as CacheEntry;

    // Validate same base URL
    if (entry.baseUrl !== baseUrl) {
      console.log(`  [CACHE] Cache URL mismatch (${entry.baseUrl} vs ${baseUrl}) — re-inspecting`);
      return null;
    }

    // Validate TTL
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      console.log(`  [CACHE] Cache expired (${Math.round((Date.now() - entry.timestamp) / 60_000)} min old) — re-inspecting`);
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

async function saveCache(
  baseUrl: string,
  data: EnhancedAppStructure
): Promise<void> {
  const entry: CacheEntry = {
    timestamp: Date.now(),
    baseUrl,
    data,
  };

  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry, null, 2), "utf-8");
    console.log(`  [CACHE] App observations saved to ${CACHE_FILE}`);
  } catch (err) {
    console.warn(`  [CACHE] Failed to save cache: ${(err as Error).message}`);
  }
}
