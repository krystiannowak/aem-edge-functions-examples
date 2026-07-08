/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
*/

import assert from "assert";
import { resolveLocation } from "../src/lib/location.js";

describe("resolveLocation", () => {
  const ORIGIN = "www.example.com";

  describe("absolute mode (default)", () => {
    it("should prepend origin host to relative path", () => {
      assert.strictEqual(
        resolveLocation("/new-page", "absolute", ORIGIN),
        "https://www.example.com/new-page"
      );
    });

    it("should prepend origin host to root path", () => {
      assert.strictEqual(
        resolveLocation("/", "absolute", ORIGIN),
        "https://www.example.com/"
      );
    });

    it("should pass through absolute https URL", () => {
      assert.strictEqual(
        resolveLocation("https://other.example.com/page", "absolute", ORIGIN),
        "https://other.example.com/page"
      );
    });

    it("should pass through absolute http URL", () => {
      assert.strictEqual(
        resolveLocation("http://legacy.example.com/old", "absolute", ORIGIN),
        "http://legacy.example.com/old"
      );
    });

    it("should fall back to relative path when origin host is null", () => {
      assert.strictEqual(
        resolveLocation("/new-page", "absolute", null),
        "/new-page"
      );
    });

    it("should treat undefined locationMode as absolute", () => {
      assert.strictEqual(
        resolveLocation("/new-page", undefined, ORIGIN),
        "https://www.example.com/new-page"
      );
    });
  });

  describe("passthrough mode", () => {
    it("should return relative path as-is", () => {
      assert.strictEqual(
        resolveLocation("/new-page", "passthrough", ORIGIN),
        "/new-page"
      );
    });

    it("should return root path as-is", () => {
      assert.strictEqual(
        resolveLocation("/", "passthrough", ORIGIN),
        "/"
      );
    });

    it("should pass through absolute https URL", () => {
      assert.strictEqual(
        resolveLocation("https://other.example.com/page", "passthrough", ORIGIN),
        "https://other.example.com/page"
      );
    });

    it("should pass through absolute http URL", () => {
      assert.strictEqual(
        resolveLocation("http://legacy.example.com/old", "passthrough", ORIGIN),
        "http://legacy.example.com/old"
      );
    });

    it("should return relative path even when origin host is null", () => {
      assert.strictEqual(
        resolveLocation("/new-page", "passthrough", null),
        "/new-page"
      );
    });
  });
});
