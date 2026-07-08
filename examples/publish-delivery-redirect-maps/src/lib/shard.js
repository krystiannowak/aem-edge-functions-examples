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

const TOTAL_SHARDS = 256;

// FNV-1a 32-bit — fast, deterministic, sufficient uniformity for 256 buckets.
// Cheaper than SHA-256 for shard assignment where cryptographic properties
// are unnecessary.
function fnv1a32(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

function shardHex(key) {
  const bucket = fnv1a32(key) % TOTAL_SHARDS;
  return bucket.toString(16).padStart(2, "0");
}

function kvShardKey(mapId, shard) {
  return `map:${mapId}:shard:${shard}`;
}

function kvHashKey(mapId, shard) {
  return `map:${mapId}:hash:${shard}`;
}

export { TOTAL_SHARDS, fnv1a32, shardHex, kvShardKey, kvHashKey };
