-- ── client_history_summaries ─────────────────────────────────────────────────
-- 재분류(reclassify) 시 이전 분류 결과를 아카이브하는 테이블
-- thread-replies.ts fetchSummaryVersions()에서 조회
CREATE TABLE IF NOT EXISTS client_history_summaries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     text        NOT NULL,
  client_history_id uuid       NOT NULL REFERENCES client_history(id) ON DELETE CASCADE,
  thread_count     integer     NOT NULL DEFAULT 0,
  title            text        NOT NULL,
  body             text        NOT NULL DEFAULT '',
  archived_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_history_summaries_hist_id_idx
  ON client_history_summaries (client_history_id);


-- ── get_raw_messages_by_date ──────────────────────────────────────────────────
-- reclassify/route.ts에서 KST 날짜 기준 raw 메시지 조회에 사용
-- 파라미터: p_workspace_id (workspace id), p_date (KST 날짜 'YYYY-MM-DD')
-- 반환: id, channel, raw_json
CREATE OR REPLACE FUNCTION get_raw_messages_by_date(
  p_workspace_id text,
  p_date         date
)
RETURNS TABLE(id uuid, channel text, raw_json jsonb)
LANGUAGE sql STABLE
AS $$
  SELECT
    srm.id,
    srm.channel,
    srm.raw_json
  FROM slack_raw_messages srm
  WHERE srm.workspace_id = p_workspace_id
    AND (
      to_timestamp((srm.raw_json->>'ts')::float)
      AT TIME ZONE 'Asia/Seoul'
    )::date = p_date;
$$;


-- ── get_thread_reply_raw_ids ──────────────────────────────────────────────────
-- history-service.ts listHistory()에서 스레드 답글 raw ID 목록 조회에 사용
-- 답글은 raw_json->>'thread_ts' != raw_json->>'ts' 인 메시지
-- 반환: id (답글인 slack_raw_messages 행의 ID)
CREATE OR REPLACE FUNCTION get_thread_reply_raw_ids(
  p_workspace_id text
)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE
AS $$
  SELECT srm.id
  FROM slack_raw_messages srm
  WHERE srm.workspace_id = p_workspace_id
    AND srm.raw_json->>'thread_ts' IS NOT NULL
    AND srm.raw_json->>'thread_ts' != srm.raw_json->>'ts';
$$;
