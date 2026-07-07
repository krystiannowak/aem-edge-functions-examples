/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import assert from "assert";
import { fnv1a32, shardHex, kvShardKey, kvHashKey, TOTAL_SHARDS } from "../src/lib/shard.js";

describe("shard utilities", () => {
  describe("fnv1a32", () => {
    it("should return a 32-bit unsigned integer", () => {
      const hash = fnv1a32("/test");
      assert.strictEqual(typeof hash, "number");
      assert.ok(hash >= 0 && hash <= 0xffffffff);
    });

    it("should be deterministic", () => {
      assert.strictEqual(fnv1a32("/foo"), fnv1a32("/foo"));
    });

    it("should produce different hashes for different inputs", () => {
      assert.notStrictEqual(fnv1a32("/foo"), fnv1a32("/bar"));
    });
  });

  describe("shardHex", () => {
    it("should return a 2-character hex string", () => {
      const shard = shardHex("/test");
      assert.strictEqual(shard.length, 2);
      assert.ok(/^[0-9a-f]{2}$/.test(shard));
    });

    it("should be deterministic", () => {
      assert.strictEqual(shardHex("/foo"), shardHex("/foo"));
    });

    it("should match the sample shards used in fastly.toml local_server", () => {
      assert.strictEqual(shardHex("/old-home"), "1d");
      assert.strictEqual(shardHex("/about-us"), "b6");
    });

    it("should spread paths across multiple shards", () => {
      const seen = new Set();
      for (let i = 0; i < 1000; i++) {
        seen.add(shardHex(`/path-${i}`));
      }
      assert.ok(seen.size > 1, "should produce multiple distinct shards");
    });
  });

  describe("KV key helpers", () => {
    it("kvShardKey should format correctly", () => {
      assert.strictEqual(kvShardKey("legacy", "ab"), "map:legacy:shard:ab");
    });

    it("kvHashKey should format correctly", () => {
      assert.strictEqual(kvHashKey("legacy", "ab"), "map:legacy:hash:ab");
    });
  });

  describe("TOTAL_SHARDS", () => {
    it("should be 256", () => {
      assert.strictEqual(TOTAL_SHARDS, 256);
    });
  });
});
