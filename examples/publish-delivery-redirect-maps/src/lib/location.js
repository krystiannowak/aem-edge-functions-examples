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

/**
 * Resolve a redirect target to a Location header value.
 *
 * @param {string} target - The target path or URL from the redirect map.
 * @param {string} locationMode - "absolute" (default) or "passthrough".
 * @param {string|null} originHost - The customer-facing host used to build absolute URLs.
 * @returns {string} The resolved Location header value.
 */
function resolveLocation(target, locationMode, originHost) {
  // Targets that are already absolute URLs are always passed through as-is,
  // so a single map can mix relative redirects and cross-host redirects.
  if (target.startsWith("https://") || target.startsWith("http://")) {
    return target;
  }
  if (locationMode === "passthrough") {
    return target;
  }
  // absolute (default): prepend https:// and the customer-facing host.
  // AEM as a Cloud Service serves exclusively over HTTPS at the CDN layer.
  return originHost ? `https://${originHost}${target}` : target;
}

export { resolveLocation };
