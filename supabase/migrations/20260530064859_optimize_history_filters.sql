-- History/Slack summary performance indexes.
-- These target the high-volume paths used by /slack Daily List and history APIs.

create extension if not exists pg_trgm with schema extensions;

-- Keyset pagination: workspace + date range + occurred_at/id descending.
create index if not exists idx_ch_workspace_occurred_id
  on client_history (workspace_id, occurred_at desc, id desc)
  where deleted_at is null;

-- Tag filters use @> on the text[] tags column.
create index if not exists idx_ch_tags_gin
  on client_history using gin (tags)
  where deleted_at is null;

-- Author equality filter.
create index if not exists idx_ch_workspace_author
  on client_history (workspace_id, author)
  where deleted_at is null and author is not null;

-- Free-text search currently uses ilike '%query%' across these fields.
create index if not exists idx_ch_title_trgm
  on client_history using gin (title gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_ch_body_trgm
  on client_history using gin (body gin_trgm_ops)
  where deleted_at is null and body is not null;

create index if not exists idx_ch_channel_trgm
  on client_history using gin (channel gin_trgm_ops)
  where deleted_at is null;

create index if not exists idx_ch_author_trgm
  on client_history using gin (author gin_trgm_ops)
  where deleted_at is null and author is not null;

-- get_thread_reply_raw_ids() scans Slack raw messages by workspace and JSON ts fields.
create index if not exists idx_srm_workspace_thread_ts
  on slack_raw_messages (workspace_id, ((raw_json->>'thread_ts')), ((raw_json->>'ts')))
  where raw_json->>'thread_ts' is not null;
