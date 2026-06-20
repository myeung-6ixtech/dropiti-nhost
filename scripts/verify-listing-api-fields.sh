#!/usr/bin/env bash
# Verify get-listings and get-property-by-uuid return latitude, longitude, and display_image.
set -euo pipefail

BASE="${FUNCTIONS_URL:-${NEXT_PUBLIC_FUNCTIONS_URL:-}}"
if [[ -z "$BASE" ]]; then
  echo "Set FUNCTIONS_URL or NEXT_PUBLIC_FUNCTIONS_URL (e.g. https://<subdomain>.functions.<region>.nhost.run)" >&2
  exit 1
fi
BASE="${BASE%/}"

LISTINGS_JSON="$(curl -sf "${BASE}/v1/client/properties/get-listings?limit=1")"
UUID="$(python3 -c "
import json, sys
body = json.loads(sys.argv[1])
assert body.get('ok') is True, body
items = body.get('data', {}).get('items') or []
assert items, 'no listing items returned'
item = items[0]
for field in ('latitude', 'longitude', 'display_image', 'property_uuid'):
    assert field in item, f'missing field: {field}'
    val = item[field]
    print(f'  {field}: {val!r}')
uuid = item['property_uuid']
print(f'OK get-listings — sample uuid {uuid}')
" "$LISTINGS_JSON")"

UUID="$(echo "$UUID" | tail -1 | awk '{print $NF}')"

DETAIL_JSON="$(curl -sf "${BASE}/v1/client/properties/get-property-by-uuid?uuid=${UUID}")"
python3 -c "
import json, sys
body = json.loads(sys.argv[1])
assert body.get('ok') is True, body
prop = body.get('data', {}).get('property') or {}
for field in ('latitude', 'longitude', 'display_image', 'image_url'):
    assert field in prop, f'missing field: {field}'
    val = prop[field]
    print(f'  {field}: {val!r}')
print('OK get-property-by-uuid')
" "$DETAIL_JSON"
