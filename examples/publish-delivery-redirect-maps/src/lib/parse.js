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

import { fnv1a32, TOTAL_SHARDS } from "./shard.js";

// Parse one line of an Apache RewriteMap-style TXT source: `<source> <target>`,
// whitespace-separated. Lines starting with # and blank lines are skipped.
// Only entries whose source path hashes to `targetShardNum` are collected into
// `shardEntries`, so a single pass over the file builds exactly one shard.
//
// The hot loop is deliberately allocation-light — it runs once per source line
// on every maintenance call (100K+ lines for large maps), so it dominates CPU
// time. See README "Performance and platform limits" for the measured cost.
export function parseLine(line, targetShardNum, shardEntries) {
  if (line.length === 0 || line.charCodeAt(0) === 35) return; // skip empty and # comments

  // indexOf instead of split(/\s+/) — avoids regex + array allocation per line
  // (non-optimized: const parts = line.trim().split(/\s+/); source = parts[0])
  const spaceIdx = line.indexOf(" ");
  const tabIdx = line.indexOf("\t");
  const sep = spaceIdx === -1 ? tabIdx : tabIdx === -1 ? spaceIdx : Math.min(spaceIdx, tabIdx);
  if (sep <= 0) return;

  const source = line.substring(0, sep);
  // Integer shard comparison — no hex string allocation per line
  // (non-optimized: if (shardHex(source) === targetShard))
  if ((fnv1a32(source) % TOTAL_SHARDS) !== targetShardNum) return;

  // Extract target only for matching lines (~1/256th of the file).
  let tStart = sep + 1;
  while (tStart < line.length && (line.charCodeAt(tStart) === 32 || line.charCodeAt(tStart) === 9)) tStart++;
  if (tStart >= line.length) return;
  const spaceEnd = line.indexOf(" ", tStart);
  const tabEnd = line.indexOf("\t", tStart);
  let tEnd = spaceEnd === -1 ? tabEnd : tabEnd === -1 ? spaceEnd : Math.min(spaceEnd, tabEnd);
  if (tEnd === -1) tEnd = line.length;
  while (tEnd > tStart && line.charCodeAt(tEnd - 1) === 13) tEnd--; // strip \r

  shardEntries[source] = line.substring(tStart, tEnd);
}
