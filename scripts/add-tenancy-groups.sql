-- Migration: tenancy groups (Phase 1 group tenancy)
-- Run in Nhost Hasura SQL console, then track tables + relationships in Hasura metadata.

CREATE TABLE IF NOT EXISTS real_estate.tenancy_groups (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  organiser_id  TEXT        NOT NULL,
  status        TEXT        NOT NULL
                CHECK (status IN ('pending', 'active', 'locked', 'disbanded'))
                DEFAULT 'pending',
  max_members   INTEGER     NOT NULL DEFAULT 3,
  budget_min    NUMERIC,
  budget_max    NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disbanded_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS real_estate.tenancy_group_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID        NOT NULL REFERENCES real_estate.tenancy_groups(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('organiser', 'member')) DEFAULT 'member',
  status       TEXT        NOT NULL CHECK (status IN ('invited', 'accepted', 'declined', 'removed')) DEFAULT 'invited',
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_tenancy_groups_organiser
  ON real_estate.tenancy_groups (organiser_id);

CREATE INDEX IF NOT EXISTS idx_tenancy_groups_status
  ON real_estate.tenancy_groups (status);

CREATE INDEX IF NOT EXISTS idx_tenancy_group_members_group
  ON real_estate.tenancy_group_members (group_id);

CREATE INDEX IF NOT EXISTS idx_tenancy_group_members_user
  ON real_estate.tenancy_group_members (user_id);

CREATE INDEX IF NOT EXISTS idx_tenancy_group_members_status
  ON real_estate.tenancy_group_members (status);

COMMENT ON TABLE real_estate.tenancy_groups IS
  'Named co-tenant groups (2–3 members) for joint rental offers.';

COMMENT ON TABLE real_estate.tenancy_group_members IS
  'Membership rows for tenancy groups; user_id is Nhost auth UUID.';

-- One accepted membership across non-disbanded groups per user.
CREATE OR REPLACE FUNCTION real_estate.check_one_active_group_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    IF EXISTS (
      SELECT 1
      FROM real_estate.tenancy_group_members m
      JOIN real_estate.tenancy_groups g ON g.id = m.group_id
      WHERE m.user_id = NEW.user_id
        AND m.status = 'accepted'
        AND m.id IS DISTINCT FROM NEW.id
        AND g.status IN ('pending', 'active', 'locked')
    ) THEN
      RAISE EXCEPTION 'User already has an active group membership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_one_active_group_membership
  ON real_estate.tenancy_group_members;

CREATE TRIGGER trg_check_one_active_group_membership
  BEFORE INSERT OR UPDATE OF status ON real_estate.tenancy_group_members
  FOR EACH ROW
  EXECUTE FUNCTION real_estate.check_one_active_group_membership();

-- Notification type for group invitations.
INSERT INTO real_estate.notification_type (type_key, name, description, category, template)
VALUES (
  'group_invitation',
  'Group Invitation',
  'You have been invited to join a tenancy group',
  'user',
  '{{sender_name}} invited you to join the group "{{group_name}}"'
)
ON CONFLICT (type_key) DO NOTHING;

-- ========================================
-- Hasura metadata (apply in Console after running SQL)
-- ========================================
-- 1. Track: real_estate.tenancy_groups → GraphQL: real_estate_tenancy_groups
-- 2. Track: real_estate.tenancy_group_members → GraphQL: real_estate_tenancy_group_members
-- 3. Relationships:
--    - tenancy_groups.members → tenancy_group_members (array, group_id)
--    - tenancy_group_members.group → tenancy_groups (object)
-- 4. Permissions (role: user):
--    - tenancy_groups: select where organiser_id = X-Hasura-User-Id OR member exists
--    - tenancy_group_members: select/update own row; insert via functions only
--    Functions use admin secret — no client GraphQL writes required for v1.
