---
name: brand-timeline
description: 특정 브랜드의 client_history(데일리), daily_reports, weekly_brand_summaries를 함께 분석해 이슈/프로젝트/결정 노드를 Supabase issues 테이블에 부모-자식 관계까지 포함해 생성하는 타임라인 스킬. "텐퍼센트 타임라인 만들어", "매머드 이슈 분석해서 타임라인 넣어", "브랜드 타임라인 생성", "타임라인 업데이트", "이슈 트래킹 만들어", "/brand-timeline 브랜드명" 등의 요청에 반드시 사용. Supabase MCP 필요.
---

# Brand Timeline 생성 스킬

특정 브랜드의 데일리·위클리 데이터를 함께 읽고, 메시지 간 전후·인과·상관관계를 분석해 이슈/프로젝트/결정 노드를 `issues` 테이블에 삽입한다.

## 데이터 파이프라인

```
client_history       → 데일리 원문 (날짜·매장·CX번호)
daily_reports        → 일별 브랜드 액션 요약
weekly_brand_summaries → 주제별 흐름 + 인과체인(thread_id)
                              ↓
                        issues 테이블
```

---

## Step 1. 사전 확인

Supabase MCP (project_id: eytonzxeogdfeuvxtuwh) 사용.

```sql
-- 데이터 범위 확인
SELECT COUNT(*) as 데일리건수,
       MIN(occurred_at)::date, MAX(occurred_at)::date
FROM client_history
WHERE deleted_at IS NULL AND brand_name = '{{브랜드명}}';

-- 위클리 주수 확인
SELECT COUNT(DISTINCT week_start) as 위클리주수
FROM weekly_brand_summaries WHERE brand_name = '{{브랜드명}}';

-- 기존 이슈 확인
SELECT type, status, COUNT(*) FROM issues
WHERE brand_name = '{{브랜드명}}' GROUP BY type, status;
```

기존 이슈가 있으면 삭제 여부 확인 후 진행.

---

## Step 2. 데이터 수집

### ① weekly_brand_summaries — 먼저 읽는다 (인과체인 핵심)

```sql
SELECT brand_name, topic, summary, week_start::date,
       thread_id, parent_thread_ids, max_priority
FROM weekly_brand_summaries
WHERE brand_name = '{{브랜드명}}'
ORDER BY week_start ASC;
```

### ② client_history — 구체적 사건 상세

```sql
SELECT id, title, LEFT(body, 220) as body, priority, tags,
       occurred_at::date::text as date
FROM client_history
WHERE brand_name = '{{브랜드명}}' AND deleted_at IS NULL
ORDER BY occurred_at ASC
LIMIT 600;
```

데이터가 크면 서브에이전트로 카테고리별 추출.

### ③ daily_reports — 반복성·중요도 확인 (보조)

```sql
SELECT report_date, content
FROM daily_reports
WHERE report_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY report_date;
```

content JSONB의 action_items에서 해당 브랜드(brand 필드)만 필터.

---

## Step 3. 추론 방식 (핵심)

### 3-1. weekly thread_id 체인을 연대기로 읽는다

- **같은 thread_id가 여러 주 반복** → 장기화된 이슈. first/last week로 기간 파악
- **parent_thread_ids 있음** → 인과/재발/분기 관계. 체인 따라 근본 원인 추적
- **예시 (더리터):**
  ```
  b3ad64d2 (v1→v3 전환, 12/29) ← root cause
      e66a8c1f (결제 누락·경영진 미팅, 1/5)  [parent: b3ad64d2]
          3f0a3d88 (POS 안정성 위기, 1/12~5/25)  [parent: e66a8c1f]
  ```
  이 체인을 읽지 않으면 4개월 위기의 시작점을 놓친다.

### 3-2. thread 국면별 이슈 도출

- 단기 종료 thread → closed 이슈
- 여러 주 지속 thread → open 이슈
- parent_thread_ids → parent_issue_id 연결 후보

### 3-3. client_history로 자식 이슈 추출

**자식 이슈 body 기준:**
- 날짜 + 매장명(코드) + CX 티켓번호 + 금액/주문번호 원문 인용 필수
- 추상 표현("여러 매장에서") 금지
- 좋은 예: "5/19 장한평점 POS 결제 중 멈춤, 카드 승인 2건 중 1건 보류(금액 0원·현금 표시), 취소 불가 (CX-260519-010)"

### 3-4. 부모-자식 구조

| 부모 (umbrella) | 자식 (specific) |
|----------------|----------------|
| 같은 시스템·영역 반복 문제 | 특정 날짜 구체 사건 |
| "~오류 (반복)", "~불일치 (구조적)" | CX번호·매장·날짜·금액 포함 |

3단계 체인은 UI가 2단계만 지원하므로 가장 의미 있는 2단계로 압축.

### 3-5. 프로젝트·결정

- **project**: 시작+완료/목표일 있는 것. closed = 배포·오픈 완료 명시
- **decision**: "확정됐다" 명시. 회의 자체가 아닌 결과

---

## Step 4. 삽입 순서

1. 부모 이슈 / 프로젝트 / 결정 INSERT (parent_issue_id = NULL)
2. 부모 ID 조회
3. 자식 이슈 INSERT (parent_issue_id 연결)

```sql
INSERT INTO issues (
  workspace_id, brand_name, title, type, priority, status,
  body, action, first_seen, last_seen, parent_issue_id
) VALUES (...);
```

**title에 브랜드명 포함 금지**

workspace_id: `07428e7d-3251-41d7-a83a-96deeab483ab`

---

## Step 5. 검증

```sql
SELECT p.title, p.type, p.status, COUNT(c.id) as 자식수
FROM issues p
LEFT JOIN issues c ON c.parent_issue_id = p.id
WHERE p.brand_name = '{{브랜드명}}' AND p.parent_issue_id IS NULL
GROUP BY p.id, p.title, p.type, p.status
ORDER BY p.type, 자식수 DESC;
```

**체크리스트:**
- [ ] 가장 이른 thread의 root cause가 반영됐는가?
- [ ] 자식 이슈에 날짜·매장명·CX 번호가 포함됐는가?
- [ ] 장기 이슈의 first_seen/last_seen이 정확한가?
- [ ] 프로젝트·결정이 누락되지 않았는가?

---

## 참고

- Supabase project_id: `eytonzxeogdfeuvxtuwh`
- 추론 방법론: `memory/project_timeline_reasoning.md`
- classify 스킬의 3단계가 선행되어야 위클리 데이터가 쌓인다
