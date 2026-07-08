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

import * as response from "./lib/response.js";
import { log } from "./lib/log.js";
import { redirectLookupHandler } from "./redirect-lookup.js";
import { maintenanceHandler } from "./redirect-maintenance.js";

// Maintenance endpoint. An external scheduler calls this periodically to
// (re)build KV shards from the TXT sources. Every other request is a redirect
// lookup. See README "Maintenance" for how to drive it.
const MAINTENANCE_PATH = "/__redirectmaps-maintenance";

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

async function handleRequest(event) {
  const req = event.request;
  const url = new URL(req.url);

  let finalResponse;
  try {
    if (url.pathname === MAINTENANCE_PATH && req.method === "GET") {
      finalResponse = await maintenanceHandler(req);
    } else {
      finalResponse = await redirectLookupHandler(req);
    }
  } catch (err) {
    console.log(err);
    finalResponse = response.error();
  }

  log(req, finalResponse);

  return finalResponse;
}
