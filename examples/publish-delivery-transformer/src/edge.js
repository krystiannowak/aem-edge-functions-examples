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

import { CacheOverride } from "fastly:cache-override";

/**
 * The publish hostname as it appears in the CDN — this is the loopback host.
 * Replace with your actual publish domain (e.g. "www.mysite.com").
 * The CDN origin-selector rule for that domain must route back to AEMaaCS publish
 * whenever the x-edgefunction-request header is present.
 */
const PUBLISH_HOST = "www.example.com";

/**
 * Header injected on every loopback fetch so the CDN origin-selector skips the
 * edge function and routes the request directly to the AEMaaCS publish tier.
 * Without this header the CDN would route the request back into this function,
 * creating an infinite loop.
 */
const LOOPBACK_HEADER = "x-edgefunction-request";

/** Incoming request header names forwarded on the loopback fetch. */
const FORWARDED_INCOMING_HEADER_NAMES = [
  "X-Forwarded-Host",
  "User-Agent",
  "Accept-Language",
  "X-AEM-Request-ID",
];

/**
 * @param {Request} req
 * @returns {Headers}
 */
function forwardedLoopbackHeaders(req) {
  const out = new Headers();
  for (const name of FORWARDED_INCOMING_HEADER_NAMES) {
    const value = req.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  return out;
}

/**
 * Fetches the loopback URL and returns the response and parsed HTML text.
 * CacheOverride("pass") prevents the Fastly Compute service from caching the
 * loopback sub-request; the outer CDN still caches the final transformed response.
 *
 * @param {string} url
 * @param {Headers} headers
 * @returns {Promise<{ res: Response | null, html: string | null }>}
 */
async function safeFetchHtml(url, headers) {
  try {
    const res = await fetch(url, { headers, cacheOverride: new CacheOverride("pass") });

    // Uncomment for debugging: logs request/response headers for each loopback fetch.
    // console.log("safeFetchHtml", url, "request headers:", Object.fromEntries(headers), "response headers:", Object.fromEntries(res.headers));

    if (!res.ok) return { res, html: null };

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return { res, html: null };

    const html = await res.text();
    return { res, html };
  } catch {
    return { res: null, html: null };
  }
}

/**
 * Apply the desired transformation to the AEMaaCS HTML.
 *
 * This sample injects a custom script before </head> as a stand-in for any
 * server-side enrichment (personalization, A/B tests, analytics snippets, etc.).
 * Replace or extend this function to implement your actual transformation.
 *
 * @param {string} html
 * @returns {string}
 */
function transformHtml(html) {
  const customScript = `<script src="/custom-experience.js" defer></script>`;
  return html.replace(/<\/head>/i, `${customScript}\n</head>`);
}

/**
 * Loopback transformer for AEMaaCS publish delivery.
 *
 * Flow:
 *   Browser → CDN (www.example.com, no x-edgefunction-request)
 *     → this function
 *       → CDN (www.example.com, WITH x-edgefunction-request)  ← loopback
 *         → AEMaaCS publish tier
 *     ← transformed response (CDN may cache it)
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function publishDeliveryHandler(req) {
  try {
    const url = new URL(req.url);

    const headers = forwardedLoopbackHeaders(req);
    // Signal to the CDN that this is a loopback re-entry so the origin-selector
    // bypasses this edge function and routes directly to AEMaaCS publish.
    headers.set(LOOPBACK_HEADER, "true");
    headers.set("Accept", "text/html");
    headers.set("Accept-Encoding", "identity");

    const loopbackUrl = `https://${PUBLISH_HOST}${url.pathname}${url.search}`;
    const { res, html } = await safeFetchHtml(loopbackUrl, headers);

    if (!res) return new Response("Internal Edge Error", { status: 500 });

    // Non-HTML response (assets, redirects, errors): pass through unchanged.
    if (!html) return res;

    const transformed = transformHtml(html);

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete("content-length");
    responseHeaders.delete("content-encoding");

    // Forward surrogate keys from AEMaaCS publish so the CDN can purge this
    // transformed response when the underlying content changes.
    const surrogateKey = res.headers.get("surrogate-key");
    if (surrogateKey) {
      responseHeaders.set("Surrogate-Key", surrogateKey);
    }

    return new Response(transformed, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("publishDeliveryHandler error:", err);
    return new Response("Internal Edge Error", { status: 500 });
  }
}

export { publishDeliveryHandler };
