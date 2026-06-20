-- Map coordinates on published listings (idempotent).
-- Run in Nhost Hasura SQL console, then track columns in Hasura metadata.

ALTER TABLE real_estate.property_listing
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

COMMENT ON COLUMN real_estate.property_listing.latitude IS
  'Resolved map latitude (geocode or district/region/country centroid).';
COMMENT ON COLUMN real_estate.property_listing.longitude IS
  'Resolved map longitude (geocode or district/region/country centroid).';
