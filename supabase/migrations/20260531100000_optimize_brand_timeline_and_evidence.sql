-- 1) get_brand_timeline_stats 재작성
--    기존: client_history × weekly_brand_summaries × issues 를 브랜드로 조인 후 COUNT(DISTINCT)
--          → 중간 결과 ~100만 행 폭증 + 디스크 정렬로 ~1,480ms.
--    변경: 세 카운트를 각각 브랜드별로 독립 집계한 뒤 84행끼리 LEFT JOIN → ~27ms (결과 동일).
CREATE OR REPLACE FUNCTION public.get_brand_timeline_stats(p_workspace_id uuid)
RETURNS TABLE(brand_name text, daily_count bigint, weekly_count bigint, issue_count bigint)
LANGUAGE sql
STABLE
AS $function$
  WITH d AS (
    SELECT ch.brand_name, COUNT(*)::bigint AS daily_count
    FROM client_history ch
    WHERE ch.workspace_id = p_workspace_id
      AND ch.deleted_at IS NULL
      AND ch.brand_name IS NOT NULL
    GROUP BY ch.brand_name
  ),
  w AS (
    SELECT wbs.brand_name, COUNT(DISTINCT wbs.week_start)::bigint AS weekly_count
    FROM weekly_brand_summaries wbs
    WHERE wbs.workspace_id = p_workspace_id
    GROUP BY wbs.brand_name
  ),
  i AS (
    SELECT iss.brand_name, COUNT(*)::bigint AS issue_count
    FROM issues iss
    WHERE iss.workspace_id = p_workspace_id
    GROUP BY iss.brand_name
  )
  SELECT
    d.brand_name,
    d.daily_count,
    COALESCE(w.weekly_count, 0) AS weekly_count,
    COALESCE(i.issue_count, 0)  AS issue_count
  FROM d
  LEFT JOIN w ON w.brand_name = d.brand_name
  LEFT JOIN i ON i.brand_name = d.brand_name
  ORDER BY d.daily_count DESC;
$function$;

-- 2) get_issue_evidence_counts 신설
--    이슈별 연결된 client_history 메시지 수를 DB에서 group-by.
--    기존 API는 issue_id 컬럼 전체를 끌어와 JS로 셌으나, PostgREST db-max-rows(1000) 캡 때문에
--    연결 행(1,067건)이 잘려 evidence count가 과소 집계되는 정확도 버그가 있었음.
--    이 RPC는 그룹 결과(~230행)만 반환하므로 캡과 무관하고 빠름. idx_client_history_issue 사용.
CREATE OR REPLACE FUNCTION public.get_issue_evidence_counts(p_workspace_id uuid)
RETURNS TABLE(issue_id uuid, cnt bigint)
LANGUAGE sql
STABLE
AS $function$
  SELECT ch.issue_id, COUNT(*)::bigint AS cnt
  FROM client_history ch
  WHERE ch.workspace_id = p_workspace_id
    AND ch.issue_id IS NOT NULL
    AND ch.deleted_at IS NULL
  GROUP BY ch.issue_id;
$function$;
