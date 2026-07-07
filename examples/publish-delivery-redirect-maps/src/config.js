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

/**
 * The publish hostname as it appears in the CDN. Used both as the loopback
 * host (redirect miss → AEMaaCS publish) and as the host prepended to relative
 * redirect targets in `absolute` mode.
 *
 * Replace with your AEMaaCS publish domain (e.g. "www.mysite.com"). The CDN
 * origin-selector rule for that domain must route back to AEMaaCS publish
 * whenever the x-edgefunction-request header is present (see config/cdn.yaml).
 *
 * This example hardcodes the host to stay simple and aligned with the
 * publish-delivery-transformer example. A production deployment would instead
 * pass the customer-facing domain from the CDN (`reqProperty: domain`) and
 * validate a shared secret before performing the loopback.
 */
export const PUBLISH_HOST = "www.example.com";

/**
 * Redirect map definitions, baked into the WASM artifact at build time.
 *
 * Each map's TXT source is fetched from `https://<PUBLISH_HOST><sourcePath>`
 * by the maintenance endpoint. The source uses the Apache RewriteMap format —
 * one `<source-path> <target>` pair per line, whitespace-separated, with `#`
 * comments and blank lines ignored:
 *
 *     /old-page            /new-page
 *     /legacy/about        /about-us
 *     /promo               https://campaign.example.com/promo
 *
 * Fields:
 *   - id            KV key prefix and identifier for the map.
 *   - sourcePath    Path to the TXT source on the publish origin.
 *   - redirectCode  301 (permanent) or 302 (temporary).
 *   - locationMode  "absolute" (prepend https://<PUBLISH_HOST>) or "passthrough"
 *                   (use the target verbatim). Targets that are already absolute
 *                   URLs are passed through regardless of this setting.
 *
 * Lookups check each map in order; the first match wins.
 */
export const MAPS = [
  {
    id: "legacy",
    sourcePath: "/content/dam/redirects/sample-redirects.txt",
    redirectCode: 301,
    locationMode: "absolute",
  },
  {
    id: "migration",
    sourcePath: "/content/dam/redirects/large-redirects.txt",
    redirectCode: 301,
    locationMode: "absolute",
  },
];
