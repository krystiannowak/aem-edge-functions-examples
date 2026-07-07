/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import assert from "assert";
import { parseLine } from "../src/lib/parse.js";
import { fnv1a32, TOTAL_SHARDS } from "../src/lib/shard.js";

// Compute the shard number for a known path so parseLine accepts it.
const TARGET_PATH = "/old-page";
const TARGET_SHARD_NUM = fnv1a32(TARGET_PATH) % TOTAL_SHARDS;

function parse(line) {
  const entries = Object.create(null);
  parseLine(line, TARGET_SHARD_NUM, entries);
  return entries;
}

describe("parseLine", () => {
  it("should parse a space-separated line", () => {
    const entries = parse("/old-page /new-page");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should parse a tab-separated line", () => {
    const entries = parse("/old-page\t/new-page");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should handle multiple spaces between source and target", () => {
    const entries = parse("/old-page   /new-page");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should handle mixed tabs and spaces between source and target", () => {
    const entries = parse("/old-page \t /new-page");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should strip trailing \\r (CRLF line endings)", () => {
    const entries = parse("/old-page /new-page\r");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should skip empty lines", () => {
    const entries = parse("");
    assert.deepStrictEqual(entries, Object.create(null));
  });

  it("should skip comment lines starting with #", () => {
    const entries = parse("# this is a comment");
    assert.deepStrictEqual(entries, Object.create(null));
  });

  it("should skip lines with only a source path and no target", () => {
    const entries = parse("/old-page");
    assert.deepStrictEqual(entries, Object.create(null));
  });

  it("should skip lines with source and trailing whitespace but no target", () => {
    const entries = parse("/old-page   ");
    assert.deepStrictEqual(entries, Object.create(null));
  });

  it("should extract only the first target token (ignore trailing content)", () => {
    const entries = parse("/old-page /new-page extra-stuff");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should handle absolute URL targets", () => {
    const entries = parse("/old-page https://example.com/new");
    assert.strictEqual(entries["/old-page"], "https://example.com/new");
  });

  it("should skip lines whose source path hashes to a different shard", () => {
    const otherShard = (TARGET_SHARD_NUM + 1) % TOTAL_SHARDS;
    const entries = Object.create(null);
    parseLine("/old-page /new-page", otherShard, entries);
    assert.deepStrictEqual(entries, Object.create(null));
  });

  it("should handle tab-separated with trailing tab content", () => {
    const entries = parse("/old-page\t/new-page\textra");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });

  it("should use earliest whitespace to end target (tab before space)", () => {
    const entries = parse("/old-page /new-page\tfoo bar");
    assert.strictEqual(entries["/old-page"], "/new-page");
  });
});
