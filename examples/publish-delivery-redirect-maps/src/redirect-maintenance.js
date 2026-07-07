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
import { sha256 } from "@noble/hashes/sha2.js";
import { MAPS, PUBLISH_HOST } from "./config.js";
import { TOTAL_SHARDS, kvShardKey, kvHashKey } from "./lib/shard.js";
import { parseLine } from "./lib/parse.js";

// KV key holding the maintenance cursor. The cursor advances by one on every
// call, cycling through all (map, shard) combinations. See README "Maintenance".
const CURSOR_KEY = "maintenance:cursor";

// Same anti-loop sentinel as the lookup path: set on the source fetch so the
// CDN routes it to AEMaaCS publish rather than back into this function.
const LOOPBACK_HEADER = "x-edgefunction-request";

/**
 * Hex SHA-256 of a string, using the pure-JS @noble/hashes implementation.
 *
 * Deliberately not crypto.subtle.digest: in the Compute WASM runtime the
 * synchronous @noble implementation is measurably faster on the shard JSON
 * hashed here, and every millisecond counts against the per-call CPU budget
 * (see README "Performance and platform limits"). It also keeps hashing
 * synchronous, matching the profiled sha256Ms figures.
 */
function sha256Hex(str) {
  const digest = sha256(new TextEncoder().encode(str));
  let hex = "";
  for (let i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, "0");
  return hex;
}

/**
 * Fetch the full TXT source and build exactly one shard from it.
 *
 * The whole file is fetched at once (`response.text()`) and parsed line by
 * line. Every line is hashed for shard assignment even though only ~1/256th
 * match the target shard — this O(N) parse is the dominant CPU cost of a
 * maintenance call. See README "Performance and platform limits".
 */
async function buildShard(sourceUrl, targetShard) {
  const timings = { fetchMs: 0, parseMs: 0, totalLines: 0 };
  const targetShardNum = parseInt(targetShard, 16);

  const t0 = Date.now();
  const res = await fetch(sourceUrl, {
    headers: { [LOOPBACK_HEADER]: "true" },
    // Always read the latest source, never a cached copy — otherwise change
    // detection could miss a source update and report the sweep as stable.
    cacheOverride: new CacheOverride("pass"),
  });
  if (!res.ok) {
    throw new Error(`source fetch ${res.status}`);
  }
  const text = await res.text();
  timings.fetchMs = Date.now() - t0;

  const t1 = Date.now();
  const lines = text.split("\n");
  timings.totalLines = lines.length;
  const shardEntries = Object.create(null);
  for (let i = 0; i < lines.length; i++) {
    parseLine(lines[i], targetShardNum, shardEntries);
  }
  timings.parseMs = Date.now() - t1;

  return { shardEntries, timings };
}

/**
 * Maintenance handler — rebuilds one (map, shard) per call and advances the
 * cursor. Returns progress and per-phase timings so callers can watch the
 * cycle and profile the CPU cost. See README "Maintenance".
 *
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function maintenanceHandler(request) {
  const startTime = Date.now();

  // KVStore must be instantiated during request handling, not at module top level.
  let kv;
  try {
    kv = new KVStore("kv_default");
  } catch {
    return Response.json(
      { success: false, error: "KV store not available (not provisioned, or local dev without KV)" },
      { status: 503 }
    );
  }

  const cursorEntry = await kv.get(CURSOR_KEY);
  const cursor = cursorEntry ? parseInt(await cursorEntry.text(), 10) : 0;

  // Map the cursor to a (map, shard) pair. The cursor cycles through every
  // combination: map 0 shards 0x00..0xff, then map 1 shards 0x00..0xff, etc.
  const totalCombinations = MAPS.length * TOTAL_SHARDS;
  const current = cursor % totalCombinations;
  const mapIndex = Math.floor(current / TOTAL_SHARDS);
  const shardIndex = current % TOTAL_SHARDS;
  const shardId = shardIndex.toString(16).padStart(2, "0");

  const map = MAPS[mapIndex];
  const sourceUrl = `https://${PUBLISH_HOST}${map.sourcePath}`;

  let shardEntries, buildTimings;
  try {
    ({ shardEntries, timings: buildTimings } = await buildShard(sourceUrl, shardId));
  } catch (e) {
    return Response.json(
      { success: false, error: `source fetch failed: ${e.message}`, map: map.id, shard: shardId },
      { status: 502 }
    );
  }

  const t2 = Date.now();
  const shardJson = JSON.stringify(shardEntries);
  const jsonStringifyMs = Date.now() - t2;

  const t3 = Date.now();
  const shardHash = sha256Hex(shardJson);
  const sha256Ms = Date.now() - t3;

  // Only write when the shard content changed — respects the KV rate limit of
  // 1 write/sec/item and avoids churning unchanged shards each cycle.
  const existingHashEntry = await kv.get(kvHashKey(map.id, shardId));
  const existingHash = existingHashEntry ? await existingHashEntry.text() : null;
  const changed = existingHash !== shardHash;
  if (changed) {
    await kv.put(kvShardKey(map.id, shardId), shardJson);
    await kv.put(kvHashKey(map.id, shardId), shardHash);
  }

  const nextCursor = cursor + 1;
  await kv.put(CURSOR_KEY, String(nextCursor));
  const completedCycles = Math.floor(nextCursor / totalCombinations);

  return Response.json({
    success: true,
    map: map.id,
    shard: shardId,
    changed,
    entries: Object.keys(shardEntries).length,
    durationMs: Date.now() - startTime,
    timings: {
      fetchMs: buildTimings.fetchMs,
      parseMs: buildTimings.parseMs,
      jsonStringifyMs,
      sha256Ms,
      totalLines: buildTimings.totalLines,
    },
    progress: {
      step: current + 1,
      totalSteps: totalCombinations,
      completedCycles,
      firstCycleComplete: completedCycles >= 1,
    },
  });
}
