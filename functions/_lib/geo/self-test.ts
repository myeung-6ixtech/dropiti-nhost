/**
 * Lightweight self-test for geo coordinate resolution.
 * Run: npx tsx functions/_lib/geo/self-test.ts
 */
import assert from "node:assert/strict";
import { resolveListingCoordinates, inferPinPrecision } from "./resolve-listing-coordinates";

async function run(): Promise<void> {
  const v3DistrictName = await resolveListingCoordinates({
    address: { district: "Wan Chai", country: "HK" },
    show_specific_location: false,
    property_uuid: "11111111-1111-1111-1111-111111111111",
  });
  assert.ok(v3DistrictName);
  assert.equal(v3DistrictName!.tier, "district");

  const adminDistrictCode = await resolveListingCoordinates({
    address: { district: "wan-chai", country: "HK", street: "123 Test Rd" },
    show_specific_location: false,
    property_uuid: "22222222-2222-2222-2222-222222222222",
  });
  assert.ok(adminDistrictCode);
  assert.equal(adminDistrictCode!.tier, "district");

  const privacy = await resolveListingCoordinates({
    address: { district: "Wan Chai", country: "HK", addressLine1: "123 Hennessy Road" },
    show_specific_location: false,
    enableGeocode: false,
  });
  assert.ok(privacy);
  assert.equal(privacy!.tier, "district");

  const countryOnly = await resolveListingCoordinates({
    address: { country: "Hong Kong" },
    show_specific_location: false,
  });
  assert.ok(countryOnly);
  assert.equal(countryOnly!.tier, "country");

  assert.equal(
    inferPinPrecision(true, { addressLine1: "123 Road", district: "Wan Chai" }),
    "exact",
  );
  assert.equal(
    inferPinPrecision(false, { addressLine1: "123 Road", district: "Wan Chai" }),
    "approximate",
  );

  console.log("geo self-test: OK");
}

run().catch((err) => {
  console.error("geo self-test: FAILED", err);
  process.exit(1);
});
