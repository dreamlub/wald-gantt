---
name: weekly-insight
description: 주간보고 summary를 집계해 WeeklyInsight(headline + stats + changes)를 생성하고 weekly_insights 테이블에 저장하는 스킬. "주간 인사이트 만들어", "5/19주차 인사이트 생성", "/weekly-insight 2026-05-19" 등의 요청에 사용. Supabase MCP 필요.
---

# 주간 인사이트 생성 스킬

`weekly_reports.summary`(팀별 AI 요약)를 읽어 주간 전체 인사이트(`weekly_insights.content`)를 생성하고 저장한다.

> **선행 조건**: `/weekly-summarize`로 해당 주차 팀별 summary가 먼저 생성되어 있어야 한다.

## 핵심 원칙

- `stats`(카운트·delta)는 **DB 데이터 기준 코드 계산** — AI 추정 아님
- `headline`·`changes`는 Claude가 summary 텍스트를 읽고 생성
- 이미 인사이트가 있는 주차도 덮어씀 (재생성 기본 허용)
- Supabase MCP (`project_id: eytonzxeogdfeuvxtuwh`) 사용

---

## Step 1. 대상 주차 확인

`week_start`(YYYY-MM-DD 월요일)를 인자에서 파싱하거나 없으면 가장 최근 주차로 사용한다.

```sql
SELECT
  id, team, author, week_start,
  CASE
    WHEN summary IS NULL THEN '미완료'
    WHEN jsonb_typeof(summary) = 'array' THEN '구형(재요약 필요)'
    ELSE '완료'
  END AS status,
  CASE WHEN summary IS NOT NULL AND jsonb_typeof(summary) = 'object'
    THEN jsonb_array_length(summary->'items') ELSE 0 END AS item_count
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'
  AND week_start <= '{{week_start}}'::date + 4
ORDER BY team;
```

summary 완료된 팀이 0개면 중단 — `/weekly-summarize`를 먼저 실행하도록 안내.

---

## Step 2. 현재 주차 통계 계산

```sql
SELECT
  COUNT(DISTINCT author)                                             AS author_count,
  SUM(jsonb_array_length(summary->'items'))                         AS total_items,
  SUM((SELECT COUNT(*) FROM jsonb_array_elements(summary->'items') x
       WHERE x->>'type' = 'issue'))                                 AS issue_count,
  SUM((SELECT COUNT(*) FROM jsonb_array_elements(summary->'items') x
       WHERE x->>'type' = 'decision'))                              AS decision_count,
  SUM((SELECT COUNT(*) FROM jsonb_array_elements(summary->'items') x
       WHERE x->>'type' = 'plan'))                                  AS plan_count
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'
  AND week_start <= '{{week_start}}'::date + 4
  AND summary IS NOT NULL
  AND jsonb_typeof(summary) = 'object';
```

---

## Step 3. 전주 통계 계산 (delta용)

```sql
SELECT
  COUNT(DISTINCT author)                                             AS author_count,
  SUM((SELECT COUNT(*) FROM jsonb_array_elements(summary->'items') x
       WHERE x->>'type' = 'issue'))                                 AS issue_count,
  SUM((SELECT COUNT(*) FROM jsonb_array_elements(summary->'items') x
       WHERE x->>'type' = 'decision'))                              AS decision_count,
  SUM((SELECT COUNT(*) FROM jsonb_array_elements(summary->'items') x
       WHERE x->>'type' = 'plan'))                                  AS plan_count
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'::date - 7
  AND week_start <= '{{week_start}}'::date - 3
  AND summary IS NOT NULL
  AND jsonb_typeof(summary) = 'object';
```

전주 데이터가 없으면 delta = 0으로 처리.

delta = 현재값 - 전주값 (양수면 증가, 음수면 감소)

---

## Step 4. headline + changes 생성

현재 주차 팀별 `summary->>'summary'` 텍스트를 모아 아래 프롬프트로 Claude에게 생성 요청.

```sql
SELECT team, author, summary->>'summary' AS team_summary
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'
  AND week_start <= '{{week_start}}'::date + 4
  AND summary IS NOT NULL
  AND jsonb_typeof(summary) = 'object'
ORDER BY team;
```

### 프롬프트

```
다음은 {{week_start}} 주간 팀별 보고 요약입니다.

{{팀1}}: {{team_summary}}
{{팀2}}: {{team_summary}}
...

아래 두 항목을 한국어로 생성하세요.

1. headline (2~3문장, 150자 이내)
   - 이번 주 전체를 관통하는 핵심 흐름 서술
   - 중요한 브랜드명·이슈를 **굵게** 표시 가능
   - "이번 주는 ~" 또는 브랜드명으로 시작

2. changes (1~2문장, 100자 이내)
   - 전주 대비 눈에 띄는 변화 서술
   - 전주 데이터 없으면 "전주 데이터 없음"

JSON만 반환:
{
  "headline": "...",
  "changes": "..."
}
```

---

## Step 5. weekly_insights upsert

Step 2·3 통계와 Step 4 텍스트를 조합해 저장.

```sql
INSERT INTO weekly_insights (workspace_id, week_start, content, analyzed_at)
VALUES (
  '07428e7d-3251-41d7-a83a-96deeab483ab',
  '{{week_start}}',
  '{
    "headline": "{{headline}}",
    "stats": {
      "authors":   { "count": {{author_count}},   "delta": {{author_delta}}   },
      "issues":    { "count": {{issue_count}},    "delta": {{issue_delta}}    },
      "decisions": { "count": {{decision_count}}, "delta": {{decision_delta}} },
      "plans":     { "count": {{plan_count}},     "delta": {{plan_delta}}     }
    },
    "changes": "{{changes}}"
  }'::jsonb,
  now()
)
ON CONFLICT (workspace_id, week_start)
DO UPDATE SET
  content     = excluded.content,
  analyzed_at = excluded.analyzed_at;
```

---

## Step 6. 완료 보고

```
✅ {{week_start}} 주간 인사이트 생성 완료

리포트 {{author_count}}명 ({{author_delta:+N}})
이슈    {{issue_count}}건 ({{issue_delta:+N}})
결정    {{decision_count}}건 ({{decision_delta:+N}})
계획    {{plan_count}}건 ({{plan_delta:+N}})

headline: "{{headline}}"
```

앱에서 주간보고 분석 > 인사이트 탭에서 확인 가능.
