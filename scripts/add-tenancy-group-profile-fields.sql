-- Migration: group household metadata (no headline — name + description already exist)
-- Run in Nhost Hasura SQL console, then track the new columns in Hasura metadata.

ALTER TABLE real_estate.tenancy_groups
  ADD COLUMN IF NOT EXISTS intended_lease_duration TEXT
    CHECK (intended_lease_duration IS NULL OR intended_lease_duration IN ('6', '12', '18', '24', '24plus')),
  ADD COLUMN IF NOT EXISTS move_in_date DATE,
  ADD COLUMN IF NOT EXISTS property_use TEXT
    CHECK (property_use IS NULL OR property_use IN ('residential', 'residential_wfh', 'home_office')),
  ADD COLUMN IF NOT EXISTS lifestyle_tags JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN real_estate.tenancy_groups.intended_lease_duration IS
  'Shared lease intent: 6, 12, 18, 24, or 24plus months.';
COMMENT ON COLUMN real_estate.tenancy_groups.move_in_date IS
  'Earliest date the whole group can move in.';
COMMENT ON COLUMN real_estate.tenancy_groups.property_use IS
  'Intended use: residential, residential_wfh, or home_office.';
COMMENT ON COLUMN real_estate.tenancy_groups.lifestyle_tags IS
  'Opt-in household tags, max 4. JSON array of string keys.';

-- After SQL: Hasura Console → track columns on real_estate_tenancy_groups:
-- intended_lease_duration, move_in_date, property_use, lifestyle_tags
-- Then reload metadata and redeploy Nhost functions.
