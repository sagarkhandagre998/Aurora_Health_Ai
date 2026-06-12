-- ─────────────────────────────────────────────────────────────────────────────
-- 0004_healthkit.sql
-- Apple Health (HealthKit) integration support.
--
-- Adds provenance + dedupe columns to water_logs and sleep_logs so that:
--   • imported samples can be traced back to Apple Health
--   • app-written water entries carry their HealthKit UUID, preventing the
--     importer from re-inserting our own writes as duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

-- Water logs ------------------------------------------------------------------
alter table water_logs
  add column if not exists source  text default 'manual',
  add column if not exists hk_uuid text;

-- One row per distinct HealthKit sample (per user); NULLs are unconstrained so
-- manual entries are unaffected.
create unique index if not exists water_logs_user_hk_uuid_idx
  on water_logs (user_id, hk_uuid)
  where hk_uuid is not null;

-- Sleep logs ------------------------------------------------------------------
alter table sleep_logs
  add column if not exists source  text default 'manual',
  add column if not exists hk_uuid text;
