---
name: weekly-summarize
description: 주간보고 원문(raw_content)을 읽어 구조화된 summary JSON을 생성해 DB에 저장하는 스킬. "주간보고 요약해줘", "1월 4주 요약", "5/19주차 요약 생성", "/weekly-summarize 2026-01-26" 등의 요청에 사용. Supabase MCP 필요.
---

# 주간보고 요약 스킬

주간보고 원문(`weekly_reports.raw_content`)을 팀별로 읽고, 전주 summary와 비교해 구조화된 `summary` JSON을 생성한다.

## 핵심 원칙

- **`type` (이슈/결정/계획)**: AI가 원문을 읽고 판정
- **`change` (신규/진행중/완료/블로킹/미언급)**: 전주 items와 토큰 유사도 매칭으로 **코드 기준 판정** (AI 자의적 판단 아님)
- **팀 단위** 순서대로 처리 (한 번에 1팀씩)
- 이미 summary가 있는 팀은 덮어쓰지 않음 (사용자가 "재생성" 명시 시 예외)
- Supabase MCP (`project_id: eytonzxeogdfeuvxtuwh`) 사용

---

## Step 1. 대상 주차 확인

week_start(`YYYY-MM-DD` 월요일)로 변환한다.

```sql
SELECT
  id, team, author, week_start,
  length(raw_content) AS raw_len,
  CASE WHEN summary IS NULL THEN '미완료'
       WHEN jsonb_typeof(summary) = 'array' THEN '구형(배열)'
       ELSE '완료' END AS status
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'
  AND week_start <= '{{week_start}}'::date + 4
ORDER BY team;
```

> **구형(배열)** 상태인 경우: summary가 `[...]` 배열로 저장된 것. 재요약 필요.

---

## Step 2. 전주 summary 조회

```sql
SELECT team, summary
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'::date - 7
  AND week_start <= '{{week_start}}'::date - 3
  AND summary IS NOT NULL
  AND jsonb_typeof(summary) = 'object'
ORDER BY team;
```

전주 데이터가 없으면 모든 항목을 `change: "new"`로 처리한다.

---

## Step 3. 팀별 분석

### 3-1. raw_content 읽기

```sql
SELECT id, team, author, week_start, raw_content
FROM weekly_reports
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND week_start >= '{{week_start}}'
  AND week_start <= '{{week_start}}'::date + 4
  AND team = '{{팀명}}'
  AND raw_content IS NOT NULL;
```

### 3-2. AI 추출 (type·title·detail 등)

아래 프롬프트로 raw_content를 분석해 항목을 추출한다.  
**이 단계에서는 `change` 필드를 넣지 않는다. Step 3-3에서 코드 기준으로 채운다.**

```
다음 주간 보고서에서 이슈, 결정사항, 계획 아이템을 추출하세요.

목표는 "주간 보고를 읽고 실제 실행 태스크 후보를 안정적으로 뽑는 것"입니다.
단순 공유·완료 보고·이미 확정된 결정은 action_required=false로 두고,
담당자가 실제로 확인/작성/협의/개발/회신/모니터링해야 하는 항목만 action_required=true로 판단하세요.

action_required=true 기준:
- 아직 완료되지 않은 이슈, 검토, 외부협의, 회신 대기, 개발/기획 예정
- 일정이 임박했거나 담당자가 명시된 follow-up
- 장애/CS/브랜드 요청처럼 후속 조치가 필요한 항목

action_required=false 기준:
- 완료 보고, 단순 현황 공유, 참고용 시장조사
- 이미 결정만 기록하면 되는 사항
- 태스크가 아니라 일정 캘린더 항목으로만 관리할 내용

=== 보고서 ({{week_start}}) ===
[팀: {{team}}, 작성자: {{author}}]
{{raw_content}}

JSON 형식만 반환:
{
  "items": [
    {
      "type": "issue|decision|plan",
      "title": "30자 이내 제목",
      "detail": "상세 내용 1~2문장",
      "date": "YYYY-MM-DD 또는 null",
      "brand": "관련 브랜드명 또는 null",
      "assignee": "담당자/팀원명 또는 null",
      "task_type": "기획|개발|디자인|마케팅|운영|검토|외부협의|이슈|기타 중 하나 또는 null",
      "status": "in_progress|completed|blocked|pending 중 하나",
      "action_required": true|false,
      "task_title": "action_required=true일 때 태스크 제목(40자 이내), 아니면 null",
      "task_memo": "action_required=true일 때 배경/근거/필요 조치, 아니면 null",
      "due_date": "명시된 마감/미팅/배포일 YYYY-MM-DD, 아니면 null",
      "estimated_minutes": 15|30|60|90|120|null
    }
  ],
  "summary": "핵심 내용 2~3문장 요약"
}
```

#### type 판정 기준

| type | 조건 |
|------|------|
| `issue` | 버그·오류·CS·장애·문의 |
| `decision` | "확정됐다" 명시. 회의 자체가 아닌 결과 (계약 완료, 방향 확정, 합의 완료) |
| `plan` | 나머지 (진행 중 작업, 기획, 개발, 디자인 등) |

### 3-3. change 판정 (코드 기준)

**전주 items와 현재 items를 아래 알고리즘으로 매칭한다.**

#### 동일 항목 판정 (`sameWeeklyItem`)

두 항목이 같은 항목인지 판단하는 기준:
1. `type`이 같아야 한다
2. `brand`가 같고 (`matchKey`: 소문자 공백 제거 후 포함 관계), `title`이 같거나 `텍스트 유사도 ≥ 35%`
3. `brand`가 둘 다 null이면 `title`이 같거나 `텍스트 유사도 ≥ 35%`

#### 텍스트 유사도 (`tokenOverlap`)

```
tokenSet(s) = s를 소문자로, 2글자 이상 토큰으로 분리
overlap = 공통 토큰 수 / min(두 집합 크기)
```

#### change 값 결정

```
전주에 매칭되는 항목이 없음          → change: "new"
매칭됨 + status = "completed"        → change: "completed"
매칭됨 + status = "blocked"          → change: "blocked"
매칭됨 + 그 외                       → change: "continued"
```

#### dropped 항목

전주 items 중 현재 items에 매칭되지 않는 것 → `diff_summary.dropped_items`에만 추가 (items 배열에는 넣지 않음)

```json
{
  ...전주 항목 그대로,
  "change": "dropped",
  "detail": "전주 {{prev.status}} 상태였으나 이번 주 언급 없음"
}
```

#### prev_status · prev_title 채우기

매칭된 경우:
- `prev_status` = 전주 항목의 `status`
- `prev_title` = 전주 제목과 다를 때만 전주 제목, 같으면 `null`

---

## Step 4. DB 저장

```sql
UPDATE weekly_reports
SET
  summary = '{{생성된 JSON}}'::jsonb,
  updated_at = now()
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND id = '{{report_id}}';
```

저장 후 확인:
```sql
SELECT team,
       jsonb_array_length(summary->'items') AS items,
       summary->'diff_summary' AS diff
FROM weekly_reports
WHERE id = '{{report_id}}';
```

---

## Step 5. 완료 보고

| 팀 | 항목 수 | 신규 | 진행중 | 완료 | 블로킹 | 미언급 |
|----|---------|------|--------|------|--------|--------|
| ... | ... | ... | ... | ... | ... | ... |
