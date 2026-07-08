#!/bin/sh
# Drive the redirect-maps maintenance endpoint through one or more full cycles.
#
# Each call rebuilds one (map, shard) pair and advances the cursor, so a full
# refresh of N maps takes N * 256 calls. Use this to populate KV after deploy
# and to profile per-call CPU/wall time (pass --verbose to print the full JSON,
# including the per-phase `timings`, for every step).
#
# Usage: ./test/run-maintenance-cycle.sh [--verbose] <base-url> [steps] [delay]
#   --verbose  print the full JSON response for every step (default: one-liner)
#   base-url   e.g. https://www.example.com  (the CDN publish hostname)
#   steps      number of maintenance calls (default: 256 = one map)
#   delay      seconds between calls (default: 1)

VERBOSE=false
if [ "$1" = "--verbose" ]; then
  VERBOSE=true
  shift
fi

URL="${1:?Usage: $0 [--verbose] <base-url> [steps] [delay]}"
STEPS="${2:-256}"
DELAY="${3:-1}"

# Strip trailing slashes so the request path is exactly /__redirectmaps-maintenance.
# A trailing slash would produce //__redirectmaps-maintenance, which does not match
# the maintenance route and falls through to the redirect lookup instead.
while [ "${URL%/}" != "$URL" ]; do URL="${URL%/}"; done

MAINTENANCE_PATH="/__redirectmaps-maintenance"

echo "Running ${STEPS} maintenance steps against ${URL}${MAINTENANCE_PATH} (delay: ${DELAY}s)"
echo ""

for i in $(seq 1 "$STEPS"); do
  RESPONSE=$(curl -s "${URL}${MAINTENANCE_PATH}")
  MAP=$(echo "$RESPONSE" | grep -o '"map":"[^"]*"' | head -1 | cut -d'"' -f4)
  SHARD=$(echo "$RESPONSE" | grep -o '"shard":"[^"]*"' | cut -d'"' -f4)
  CHANGED=$(echo "$RESPONSE" | grep -o '"changed":[a-z]*' | cut -d: -f2)
  ENTRIES=$(echo "$RESPONSE" | grep -o '"entries":[0-9]*' | cut -d: -f2)
  STEP=$(echo "$RESPONSE" | grep -o '"step":[0-9]*' | cut -d: -f2)
  TOTAL=$(echo "$RESPONSE" | grep -o '"totalSteps":[0-9]*' | cut -d: -f2)
  DURATION=$(echo "$RESPONSE" | grep -o '"durationMs":[0-9]*' | cut -d: -f2)

  printf "[%3s/%s] map=%s shard=%s entries=%s changed=%s" "$STEP" "$TOTAL" "$MAP" "$SHARD" "$ENTRIES" "$CHANGED"
  if [ -n "$DURATION" ]; then
    printf " %sms" "$DURATION"
  fi
  if [ "$VERBOSE" = true ]; then
    echo ""
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
  fi
  echo ""

  if [ "$i" -lt "$STEPS" ]; then
    sleep "$DELAY"
  fi
done

echo ""
echo "Done. Last response:"
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
