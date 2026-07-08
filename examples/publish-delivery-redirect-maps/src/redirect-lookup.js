/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/// <reference types="@fastly/js-compute" />

import { KVStore } from "fastly:kv-store";
import { CacheOverride } from "fastly:cache-override";
import { SimpleCache } from "fastly:cache";
import { MAPS, PUBLISH_HOST } from "./config.js";
import { shardHex, kvShardKey } from "./lib/shard.js";
import { resolveLocation } from "./lib/location.js";

/**
 * Anti-loop sentinel. On a redirect miss the function fetches back through the
 * CDN with this header set; the CDN origin-selector rule matches only when the
 * header is absent, so the loopback request falls through to AEMaaCS publish
 * instead of routing back into this function. Same convention as the
 * publish-delivery-transformer example.
 */
const LOOPBACK_HEADER = "x-edgefunction-request";

/** Edge-cache TTL (seconds) for a shard loaded from KV, per POP. */
const SHARD_CACHE_TTL = 300;

/**
 * Load a shard's redirect map, preferring the per-POP edge cache and falling
 * back to the KV store. The parsed object maps source path -> target.
 */
async function getShardData(kv, mapId, shard) {
  const cacheKey = `redirect-shard:${mapId}:${shard}`;

  // Edge cache first (local to this POP, sub-millisecond).
  try {
    const cached = SimpleCache.get(cacheKey);
    if (cached) return JSON.parse(await cached.text());
  } catch {
    // SimpleCache may be unavailable in local dev — fall through to KV.
  }

  const entry = await kv.get(kvShardKey(mapId, shard));
  if (!entry) return null;
  const text = await entry.text();

  // Populate the edge cache for subsequent requests at this POP.
  try {
    SimpleCache.set(cacheKey, text, SHARD_CACHE_TTL);
  } catch {
    // SimpleCache may be unavailable in local dev.
  }

  return JSON.parse(text);
}

/**
 * Redirect lookup for AEMaaCS publish delivery.
 *
 * Flow:
 *   Browser → CDN (www.example.com, no x-edgefunction-request)
 *     → this function
 *         → KV shard lookup (cached per POP)
 *         → 301/302 if the path is in a map
 *       else loopback:
 *         → CDN (www.example.com, WITH x-edgefunction-request) → AEMaaCS publish
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function redirectLookupHandler(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // KVStore must be instantiated during request handling, not at module top
  // level. If it is unavailable (local dev without KV, or not yet provisioned),
  // skip the lookup and fall through to the loopback.
  let kv = null;
  try {
    kv = new KVStore("kv_default");
  } catch {
    kv = null;
  }

  if (kv) {
    const shard = shardHex(pathname);
    // Check each configured map in order; first match wins.
    for (const map of MAPS) {
      const shardData = await getShardData(kv, map.id, shard);
      if (shardData) {
        const target = shardData[pathname];
        if (target) {
          const location = resolveLocation(target, map.locationMode, PUBLISH_HOST);
          return Response.redirect(location, map.redirectCode);
        }
      }
    }
  }

  // No redirect matched. Re-issue the request through the CDN with the loopback
  // marker so the origin-selector routes it to AEMaaCS publish (not back here).
  // CacheOverride("pass") keeps the Compute service from caching this
  // sub-request; the outer CDN still caches the final response as normal.
  const headers = new Headers(request.headers);
  headers.set(LOOPBACK_HEADER, "true");

  const loopbackUrl = `https://${PUBLISH_HOST}${url.pathname}${url.search}`;
  return fetch(loopbackUrl, {
    method: request.method,
    headers,
    cacheOverride: new CacheOverride("pass"),
  });
}
