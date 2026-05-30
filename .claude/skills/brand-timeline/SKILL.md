---
name: brand-timeline
description: 특정 브랜드의 client_history(데일리), daily_reports, weekly_brand_summaries를 함께 분석해 이슈/프로젝트/결정 노드를 Supabase issues 테이블에 부모-자식 계층(parent_issue_id)과 비계층 인과관계(issue_relations)까지 포함해 생성·증분 업데이트하는 타임라인 스킬. "텐퍼센트 타임라인 만들어", "매머드 이슈 분석해서 타임라인 넣어", "브랜드 타임라인 생성", "타임라인 업데이트", "이슈 트래킹 만들어", "/brand-timeline 브랜드명" 등의 요청에 반드시 사용. Supabase MCP 필요.
---

# Brand Timeline 생성 스킬

특정 브랜드의 데일리·위클리 데이터를 함께 읽고, 메시지 간 전후·인과·상관관계를 분석해 이슈/프로젝트/결정 노드를 `issues` 테이블에 생성 또는 증분 업데이트한다.

## 실행 모드

| 모드 | 용도 | 기존 이슈 처리 |
|------|------|---------------|
| **incremental** (기본값) | 주기 실행 | 삭제 금지. 신규 메시지만 보고 기존 이슈 매칭 또는 신규 생성 |
| **initial** | 브랜드 최초 타임라인 생성 | 이슈 없음을 확인 후 전체 이력 분석 |
| **rebuild** | 품질 문제 시 재구성 | 사용자 명시적 확인 후에만 기존 이슈 삭제 허용 |

**삭제는 rebuild 모드에서만 허용한다. 기본값은 incremental.**

---

## 데이터 파이프라인

```
client_history       → 데일리 원문 (날짜·매장·CX번호)
daily_reports        → 일별 브랜드 액션 요약
weekly_brand_summaries → 주제별 흐름 + 인과체인(thread_id)
                              ↓
                        issues 테이블 (생성 / 증분 업데이트)
```

---

## Step 1. 사전 확인 + 모드 결정

Supabase MCP (project_id: eytonzxeogdfeuvxtuwh) 사용.

```sql
-- 기존 이슈 현황
SELECT type, status, COUNT(*) FROM issues
WHERE brand_name = '{{브랜드명}}'
  AND workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
GROUP BY type, status;
```

- 이슈 0건 → **initial** 모드로 진행
- 이슈 있음 + 사용자가 "업데이트" 요청 → **incremental** 모드
- 이슈 있음 + 사용자가 "다시 만들어" / "rebuild" 명시 → **rebuild** 모드 (삭제 확인 후)

### incremental 전용: last_processed_at 조회

```sql
SELECT COALESCE(MAX(ch.occurred_at), MAX(i.last_seen)) AS last_processed_at
FROM issues i
LEFT JOIN client_history ch ON ch.issue_id = i.id
WHERE i.brand_name = '{{브랜드명}}'
  AND i.workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab';
```

이 값이 이후 신규 메시지 조회의 기준점이 된다.

### initial/rebuild 전용: 데이터 범위 확인

```sql
SELECT COUNT(*) as 데일리건수,
       MIN(occurred_at)::date, MAX(occurred_at)::date
FROM client_history
WHERE deleted_at IS NULL AND brand_name = '{{브랜드명}}';

SELECT COUNT(DISTINCT week_start) as 위클리주수
FROM weekly_brand_summaries WHERE brand_name = '{{브랜드명}}';
```

---

## Step 2. 데이터 수집

### incremental 모드

#### ① 신규 client_history (last_processed_at 이후만)

```sql
SELECT id, title, LEFT(body, 220) AS body, priority, tags,
       occurred_at, issue_id
FROM client_history
WHERE workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND brand_name = '{{브랜드명}}'
  AND deleted_at IS NULL
  AND occurred_at > '{{last_processed_at}}'
ORDER BY occurred_at ASC;
```

신규 메시지가 0건이면 "신규 메시지 없음"으로 종료.

#### ② 기존 열린 이슈 목록 (매칭 판단용)

```sql
SELECT id, title, type, status, body, first_seen, last_seen, parent_issue_id
FROM issues
WHERE brand_name = '{{브랜드명}}'
  AND workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab'
  AND status = 'open'
ORDER BY last_seen DESC;
```

---

### initial / rebuild 모드

#### ① weekly_brand_summaries — 먼저 읽는다 (인과체인 핵심)

```sql
SELECT brand_name, topic, summary, week_start::date,
       thread_id, parent_thread_ids, max_priority
FROM weekly_brand_summaries
WHERE brand_name = '{{브랜드명}}'
ORDER BY week_start ASC;
```

#### ② client_history — 구체적 사건 상세 (전체)

```sql
SELECT id, title, LEFT(body, 220) as body, priority, tags,
       occurred_at::date::text as date
FROM client_history
WHERE brand_name = '{{브랜드명}}' AND deleted_at IS NULL
ORDER BY occurred_at ASC
LIMIT 600;
```

데이터가 크면 서브에이전트로 카테고리별 추출.

#### ③ daily_reports — 반복성·중요도 확인 (보조)

```sql
SELECT report_date, content
FROM daily_reports
WHERE report_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY report_date;
```

content JSONB의 action_items에서 해당 브랜드(brand 필드)만 필터.

---

## Step 3. 추론 방식 (핵심)

### incremental 모드: 신규 메시지별 판단 (3가지)

각 신규 메시지에 대해 기존 열린 이슈 목록과 대조:

| 판단 | 조건 | 처리 |
|------|------|------|
| **후속 증거** | 기존 이슈와 같은 시스템·매장·현상 | `client_history.issue_id` 연결 + `issues.last_seen` 갱신 |
| **파생 이슈** | 기존 이슈에서 비롯된 새 국면 | 새 issues row 생성 + `parent_issue_id` 연결 |
| **신규 이슈** | 기존 이슈와 무관한 새 패턴 | 새 root issue 생성 |

**기존 이슈 판단 기준:**
- 같은 시스템/기능 오류가 반복 → 후속 증거 (신규 row 생성 금지)
- 원인은 같지만 영향 범위·심각도가 새로운 국면으로 전환 → 파생 이슈
- 브랜드·도메인이 전혀 다른 사안 → 신규 이슈

**잠잠해진 이슈 감지**: open 이슈 중 `last_seen`이 30일 이상 전이면 status 후보로 표시 (자동 변경은 하지 않음, 사용자 확인 권장)

---

### initial / rebuild 모드: thread_id 체인 분석

#### 3-1. weekly thread_id 체인을 연대기로 읽는다

- **같은 thread_id가 여러 주 반복** → 장기화된 이슈. first/last week로 기간 파악
- **parent_thread_ids 있음** → 인과/재발/분기 관계. 체인 따라 근본 원인 추적
- **예시 (더리터):**
  ```
  b3ad64d2 (v1→v3 전환, 12/29) ← root cause
      e66a8c1f (결제 누락·경영진 미팅, 1/5)  [parent: b3ad64d2]
          3f0a3d88 (POS 안정성 위기, 1/12~5/25)  [parent: e66a8c1f]
  ```
  이 체인을 읽지 않으면 4개월 위기의 시작점을 놓친다.

#### 3-2. thread 국면별 이슈 도출

- 단기 종료 thread → closed 이슈
- 여러 주 지속 thread → open 이슈
- parent_thread_ids → parent_issue_id 연결 후보

#### 3-3. client_history로 자식 이슈 추출

**자식 이슈 body 기준:**
- 날짜 + 매장명(코드) + CX 티켓번호 + 금액/주문번호 원문 인용 필수
- 추상 표현("여러 매장에서") 금지
- 좋은 예: "5/19 장한평점 POS 결제 중 멈춤, 카드 승인 2건 중 1건 보류(금액 0원·현금 표시), 취소 불가 (CX-260519-010)"

#### 3-4. 부모-자식 구조

| 부모 (umbrella) | 자식 (specific) |
|----------------|----------------|
| 같은 시스템·영역 반복 문제 | 특정 날짜 구체 사건 |
| "~오류 (반복)", "~불일치 (구조적)" | CX번호·매장·날짜·금액 포함 |

3단계 체인은 UI가 2단계만 지원하므로 가장 의미 있는 2단계로 압축.

#### 3-5. 프로젝트·결정

- **project**: 시작+완료/목표일 있는 것. closed = 배포·오픈 완료 명시
- **decision**: "확정됐다" 명시. 회의 자체가 아닌 결과

---

### 3-6. 비계층 관계 추출 (issue_relations) — 모든 모드 공통

`parent_issue_id`(계층)로 표현 못하는 **이슈 간 관계**를 `issue_relations`에 기록한다.

**parent_issue_id vs issue_relations 구분:**

| | parent_issue_id (계층·실선) | issue_relations (비계층·점선) |
|--|--|--|
| 의미 | "이 이슈는 저 umbrella에 **속한다**" | "이 이슈가 저 이슈에 **영향을 준다**" |
| 예 | "죽전역점 결제오류" → 부모 "POS 결제오류(반복)" | "v1→v3 전환 버그" → "POS 안정성 위기"를 유발 |
| 카디널리티 | 자식당 부모 1개 | 다대다 (서로 독립인 이슈/umbrella 간) |

**방향 규칙: `from_issue_id → to_issue_id`는 항상 "from이 to에 영향을 준다".**

| relation_type | 의미 (from → to) | 판단 단서 |
|--|--|--|
| `causes` | from이 to를 **유발**함 | "~때문에", root cause → 후속 위기 |
| `blocks` | from이 to를 **막고 있음** | "~가 해결돼야 ~가능", 선행조건 미충족 |
| `recurs_as` | from이 to로 **재발**함 | 닫혔던 이슈가 다른 형태로 다시 |
| `continues` | from이 to로 **이어짐** | 같은 사안의 다음 국면 (분기 아님) |
| `related` | 단순 **연관** (방향성 약함) | 같은 시스템·팀이나 인과 불명확. from 기준 1행만 |

**원칙:**
- 같은 umbrella 안 자식들끼리는 보통 relations 불필요(이미 parent로 묶임). umbrella 간 또는 독립 이슈 간 관계에 집중.
- weekly `parent_thread_ids` 체인에서 **계층이 아닌 인과**로 판단되면 `causes`/`continues`로 기록.
- 추측 금지. "이게 없었으면 저게 없었다"가 본문에서 확인될 때만 `causes`.
- 자기 자신 금지, 같은 (from,to,type) 중복 금지 (DB 제약 있음).

---

## Step 4. 쓰기 작업

### incremental 모드

```sql
-- 후속 증거: 메시지 연결 + last_seen 갱신
UPDATE client_history SET issue_id = '{{issue_id}}' WHERE id = '{{message_id}}';
UPDATE issues SET last_seen = '{{occurred_at}}' WHERE id = '{{issue_id}}';

-- 필요 시 body/action 보강 (기존 내용 유지하면서 추가)
UPDATE issues SET
  body   = body || E'\n\n' || '{{새 내용}}',
  action = '{{업데이트된 액션}}'
WHERE id = '{{issue_id}}';

-- 파생 또는 신규 이슈 생성
INSERT INTO issues (
  workspace_id, brand_name, title, type, priority, status,
  body, action, first_seen, last_seen, parent_issue_id
) VALUES (...);

-- 생성된 이슈 ID 조회 후 메시지 연결
UPDATE client_history SET issue_id = '{{new_issue_id}}' WHERE id IN (...);
```

### initial / rebuild 모드

1. 부모 이슈 / 프로젝트 / 결정 INSERT (parent_issue_id = NULL)
2. 부모 ID 조회
3. 자식 이슈 INSERT (parent_issue_id 연결)
4. **client_history.issue_id 일괄 연결 (필수)**
5. **issue_relations INSERT (필수)** — 3-6에서 도출한 비계층 관계

> ⚠️ **노드(issues) 생성만으로 끝이 아니다.** 4·5단계를 생략하면 UI에서 "Slack 연결 0건 / 관계 0건"인 깡통 타임라인이 된다. evidence 연결(4)과 관계(5)는 타임라인 완료의 필수 조건이며, 생성 직후 반드시 채운다.

```sql
INSERT INTO issues (
  workspace_id, brand_name, title, type, priority, status,
  body, action, first_seen, last_seen, parent_issue_id
) VALUES (...);
```

**title에 브랜드명 포함 금지**

#### 4단계 — client_history.issue_id 연결 패턴

자식 이슈는 특정 날짜 사건이므로 `occurred_at` 날짜 + 키워드로 일괄 매칭한다.

```sql
-- (a) 자식 이슈: 날짜 + 키워드로 정확 매칭
WITH map(issue_title, d, kw) AS (VALUES
  ('FeliCa 간편결제 오류', '2026-03-23', '%FeliCa%'),
  ('키오스크 바코드 스캔 불가', '2026-03-25', '%바코드%')
  -- ... 자식별 (제목, 날짜, 키워드)
)
UPDATE client_history ch SET issue_id = i.id
FROM map m
JOIN issues i ON i.brand_name = '{{브랜드}}' AND i.title = m.issue_title
WHERE ch.brand_name = '{{브랜드}}' AND ch.occurred_at::date = m.d::date
  AND ch.title LIKE m.kw AND ch.issue_id IS NULL;

-- (b) umbrella / 프로젝트: 자식에 안 잡힌 같은 주제 메시지를 키워드로 흡수
UPDATE client_history ch SET issue_id = i.id
FROM issues i
WHERE i.brand_name = '{{브랜드}}' AND i.title = '{{umbrella 제목}}' AND i.parent_issue_id IS NULL
  AND ch.brand_name = '{{브랜드}}' AND ch.issue_id IS NULL
  AND (ch.title LIKE '%키워드1%' OR ch.title LIKE '%키워드2%');
```

연결 후 반드시 검증: `SELECT COUNT(*) FROM client_history WHERE brand_name='{{브랜드}}' AND issue_id IS NULL` — 미연결 잔여가 과도하면 키워드를 보강한다.

### issue_relations 쓰기 (모든 모드 공통, 관계가 있을 때만)

from/to 이슈 ID를 먼저 확보한 뒤 INSERT. 방향은 항상 "from이 to에 영향".

```sql
-- 예: "v1→v3 전환 버그"(from)가 "POS 안정성 위기"(to)를 유발
INSERT INTO issue_relations (workspace_id, from_issue_id, to_issue_id, relation_type, note)
VALUES ('07428e7d-3251-41d7-a83a-96deeab483ab',
        '{{from_issue_id}}', '{{to_issue_id}}', 'causes', '{{근거 한 줄}}')
ON CONFLICT (from_issue_id, to_issue_id, relation_type) DO NOTHING;
```

- incremental에서 신규 파생 이슈를 만들 때, 원인 이슈와의 관계가 명확하면 `causes`/`continues` 추가.
- `ON CONFLICT ... DO NOTHING`으로 재실행 안전성 확보.

workspace_id: `07428e7d-3251-41d7-a83a-96deeab483ab`

---

## Step 5. 검증

```sql
SELECT p.title, p.type, p.status, p.last_seen::date,
       COUNT(c.id) as 자식수,
       COUNT(ch.id) as 연결메시지수
FROM issues p
LEFT JOIN issues c ON c.parent_issue_id = p.id
LEFT JOIN client_history ch ON ch.issue_id = p.id
WHERE p.brand_name = '{{브랜드명}}' AND p.parent_issue_id IS NULL
GROUP BY p.id, p.title, p.type, p.status, p.last_seen
ORDER BY p.type, 자식수 DESC;
```

```sql
-- 비계층 관계 검증
SELECT r.relation_type,
       f.title AS from_title, t.title AS to_title, r.note
FROM issue_relations r
JOIN issues f ON f.id = r.from_issue_id
JOIN issues t ON t.id = r.to_issue_id
WHERE f.brand_name = '{{브랜드명}}'
  AND r.workspace_id = '07428e7d-3251-41d7-a83a-96deeab483ab';
```

**체크리스트:**
- [ ] 삭제 없이 기존 이슈 ID가 유지됐는가? (incremental)
- [ ] 신규 메시지가 기존 이슈 또는 신규 이슈에 연결됐는가?
- [ ] 가장 이른 thread의 root cause가 반영됐는가? (initial/rebuild)
- [ ] 자식 이슈에 날짜·매장명·CX 번호가 포함됐는가?
- [ ] 장기 이슈의 first_seen/last_seen이 정확한가?
- [ ] 30일+ 조용한 open 이슈를 사용자에게 알렸는가?
- [ ] 인과/재발/차단 관계가 issue_relations에 from→to 방향으로 기록됐는가?
- [ ] relations 방향이 "from이 to에 영향"으로 일관되는가? (역방향 주의)

---

## 참고

- Supabase project_id: `eytonzxeogdfeuvxtuwh`
- 추론 방법론: `memory/project_timeline_reasoning.md`
- classify 스킬의 3단계가 선행되어야 위클리 데이터가 쌓인다
- `/api/issues/seed` API는 initial 전용 배치 도구 — 주기 실행에 사용 금지
