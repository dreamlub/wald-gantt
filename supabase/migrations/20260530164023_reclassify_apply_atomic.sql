-- 재분류 적용을 단일 트랜잭션(RPC)으로 원자 처리.
-- 기존: 이전 분류 아카이브 insert → client_history upsert 가 별도 호출이라
-- 아카이브는 됐는데 upsert 실패 시 중간상태가 남을 수 있었음.
-- reclassify_apply 함수로 묶어 둘 다 성공하거나 둘 다 롤백되게 함.
--
-- 주: 원래 운영 DB에서 MCP로 직접 적용(version 20260530164023). 사후 git 정합 역기록.

CREATE OR REPLACE FUNCTION public.reclassify_apply(p_summaries jsonb, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- 1) 이전 분류 아카이브
  IF p_summaries IS NOT NULL AND jsonb_array_length(p_summaries) > 0 THEN
    INSERT INTO client_history_summaries (workspace_id, client_history_id, thread_count, title, body)
    SELECT (s->>'workspace_id')::uuid, (s->>'client_history_id')::uuid,
           (s->>'thread_count')::int, s->>'title', s->>'body'
    FROM jsonb_array_elements(p_summaries) s;
  END IF;

  -- 2) 재분류 결과 upsert
  INSERT INTO client_history (
    workspace_id, brand_name, raw_message_id, thread_count, type, tags, channel,
    source_id, source_ref, title, body, priority, author, occurred_at, reclassified_at
  )
  SELECT
    (r->>'workspace_id')::uuid, r->>'brand_name', (r->>'raw_message_id')::uuid,
    (r->>'thread_count')::smallint, r->>'type',
    ARRAY(SELECT jsonb_array_elements_text(r->'tags')),
    r->>'channel', r->>'source_id', r->>'source_ref', r->>'title', r->>'body',
    r->>'priority', r->>'author',
    (r->>'occurred_at')::timestamptz, (r->>'reclassified_at')::timestamptz
  FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (workspace_id, source_id) DO UPDATE SET
    brand_name      = EXCLUDED.brand_name,
    raw_message_id  = EXCLUDED.raw_message_id,
    thread_count    = EXCLUDED.thread_count,
    type            = EXCLUDED.type,
    tags            = EXCLUDED.tags,
    channel         = EXCLUDED.channel,
    source_ref      = EXCLUDED.source_ref,
    title           = EXCLUDED.title,
    body            = EXCLUDED.body,
    priority        = EXCLUDED.priority,
    author          = EXCLUDED.author,
    occurred_at     = EXCLUDED.occurred_at,
    reclassified_at = EXCLUDED.reclassified_at,
    updated_at      = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reclassify_apply(jsonb, jsonb) TO authenticated;
