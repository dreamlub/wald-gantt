---
description: 슬랙 메시지 분류 → 데일리 리포트 → 타임라인 생성
---

## 전체 흐름

```
수집(raw JSON) → 분류(테이블) → 데일리 리포트 → 타임라인(주간)
```

각 단계를 사용자가 "분류해줘", "데일리 리포트 만들어줘", "타임라인 업데이트해줘"로 요청한다.

---

## 1단계: 분류 (client_history)

### 입력
사용자가 날짜를 지정한다. 예: "4월 1일 분류해줘", "3/15~3/20 분류"

### 사전 조회
Supabase MCP (project_id: eytonzxeogdfeuvxtuwh) 사용.

1. 채널 매핑 조회:
```sql
SELECT channel_id, brand_name, excluded
FROM slack_channel_mappings
WHERE workspace_id = (SELECT workspace_id FROM workspace_members LIMIT 1)
```

2. 해당 날짜 raw 메시지 조회 (채널별 묶어서):
```sql
SELECT id, channel, channel_id, parent_ts, raw_json
FROM slack_raw_messages
WHERE workspace_id = (SELECT workspace_id FROM workspace_members LIMIT 1)
  AND (to_timestamp(parent_ts::float) AT TIME ZONE 'Asia/Seoul')::date = '날짜'
ORDER BY channel, parent_ts
```

3. 이미 분류된 항목 조회 (아카이브용):
```sql
SELECT id, raw_message_id, thread_count, title, body
FROM client_history
WHERE workspace_id = (SELECT workspace_id FROM workspace_members LIMIT 1)
  AND raw_message_id IN (위에서 조회한 id 목록)
  AND deleted_at IS NULL
```

### 분류 기준

채널별로 묶어서 메시지를 읽고 맥락을 파악한 뒤, 메시지별로 판단한다.

**제외:**
- 봇/자동화 알림, 채널 입퇴장, 캘린더 알림
- "넵", "확인", "ㅇㅋ" 단독 답변 (스레드 없을 때)
- 이모지만 있는 메시지

**포함 → client_history에 저장:**

| 필드 | 규칙 |
|------|------|
| brand_name | 채널 매핑 기준. 매핑 없는 채널이라도 본문에 브랜드명이 명시되어 있으면 해당 브랜드로 분류. 둘 다 없으면 "미분류" |
| title | 30자 이내. "어디서 무슨 일" 형태 |
| body | 개조식 블릿으로 기승전결 요약 (아래 형식 참조) |
| author | 작성자 이름 (raw_json의 user_name) |
| tags | 아래 태그 정의 참조 |
| priority | high / medium(기본) / low |

body 형식:
```
• 배경: 어떤 상황에서 발생했는지
• 경과: 어떻게 진행되었는지 (스레드 내용 반영)
• 조치/결과: 어떤 액션이 필요하거나 결론이 났는지
```
- 해당 단계가 없으면 생략
- 라벨(배경, 경과, 조치 등)에는 볼드 쓰지 않음. 중요 키워드만 **볼드**로 표기

### 태그

| 태그 | 조건 |
|------|------|
| issue | 버그, 오류, CS, 장애, 문의 |
| decision | 정책/계약/방향이 "확정"된 경우만 |
| mention | `<@U09H44MEK5Z>` 문자열 포함 (코드 판정) |
| schedule | 미팅/배포/오픈 일정 + 구체적 날짜 |

### 우선순위

| 레벨 | 조건 |
|------|------|
| high | 운영장애, CS 다발, 계약, 긴급 요청 |
| medium | 일반 이슈, 프로젝트 진행, 정책 논의 (기본값) |
| low | 단순 공유, 완료 보고, 일정 조율 |

### 저장

기존 분류가 있으면 client_history_summaries에 아카이브 후 upsert.

---

## 2단계: 데일리 리포트 (daily_reports)

### 입력
"1/7 데일리 리포트 만들어줘", "이번 주 데일리 리포트 생성"

### 참조 데이터 (필수)
1. **당일 client_history** — 해당 날짜의 분류된 항목 전체
2. **과거 1주일 데일리 리포트** — 이슈 연속성, 해결 여부 추적
3. **현재 주 + 직전 주 타임라인** — 이번 주 흐름과 지난 주 맥락을 함께 파악

```sql
-- 당일 데이터
SELECT brand_name, title, body, priority, tags, author, channel
FROM client_history
WHERE occurred_at::date = '날짜' AND deleted_at IS NULL

-- 과거 1주 데일리 리포트
SELECT report_date, content
FROM daily_reports
WHERE report_date BETWEEN '날짜'::date - 7 AND '날짜'::date - 1
ORDER BY report_date

-- 현재 주 + 직전 주 타임라인
SELECT brand_name, topic, summary, week_start
FROM weekly_brand_summaries
WHERE week_start IN (해당 날짜의 월요일, 그 전주 월요일)
ORDER BY week_start
```

### 작성 원칙
- **단순 나열 금지** — "이런 일이 있었다"가 아니라 "그래서 어떤 상황이다"를 추론
- **연속성 추적** — "12/31부터 이어진 CS 이슈가 갈수록 심화", "전일 조치에도 불구하고 새 매장에서 발생"
- **시사점 포함** — "근본적 점검이 시급하다", "출시 일정이 가시화되고 있다"
- **브랜드 누락 금지** — 당일 `client_history`에 1건이라도 있는 브랜드는 반드시 `action_items` 또는 `decisions`에 포함. 건수가 적거나 중요도가 낮아도 생략하지 않는다. 이를 지키지 않으면 타임라인에서도 해당 브랜드가 영구 누락된다.

### 데이터 구조 (daily_reports.content JSONB)

headline 작성 규칙:
- 반드시 **자연스러운 서술 문장** 1~3문장으로 작성. "A · B · C" 구분자 나열 형식 금지
- 핵심 이벤트/이슈명에 `**볼드**` 마킹
- **볼드 마킹 규칙 (엄격)**: 반드시 여는 `**`와 닫는 `**`를 쌍으로 사용. 홀수 `*` 또는 `*text**`, `**text*` 같은 비대칭 형태 절대 금지. 볼드가 아닌 곳에 `*`를 단독 사용하지 않음
- 예시: "**드롭탑 브랜드사에서 서비스 종료를 공식 요청**했고, 흡스(HPS)는 **PHP B4 시안·모리커피 seed 기준** 두 가지 방향이 같은 날 모두 확정됐다."

```json
{
  "headline": "오늘 전체 요약 1-3문장. 핵심 키워드 **볼드**. 나열 구분자(·) 금지, 서술 문장으로 작성",
  "action_items": [
    {
      "id": "a1",
      "severity": "urgent|watch|info",
      "title": "제목",
      "brand": "브랜드명",
      "related_count": 3,
      "summary": "상황 설명",
      "action": "필요한 액션"
    }
  ],
  "upcoming": [
    {"date": "1/20", "title": "일정명", "brand": "브랜드", "priority": "medium"}
  ],
  "pending": [
    {"brand": "브랜드", "count": 2, "items": "대기 중인 사항 설명"}
  ],
  "decisions": [
    {"id": "d1", "title": "결정 제목", "desc": "상세", "brand": "브랜드"}
  ]
}
```

severity → 우선순위 매핑: urgent=high, watch=medium, info=low

---

## 3단계: 타임라인 (weekly_brand_summaries)

### 입력
"1월 2주차 타임라인 업데이트해줘", "이번 주 타임라인"

### 참조 데이터 (필수)
1. **해당 주 데일리 리포트 전체** — 월~금 데일리 리포트를 종합
2. **이전 2주 타임라인** — 브랜드별 흐름의 연속성 (2주 전 → 1주 전 순으로 제공), thread_id 포함

```sql
-- 해당 주 데일리 리포트
SELECT report_date, content
FROM daily_reports
WHERE report_date BETWEEN '월요일' AND '일요일'
ORDER BY report_date

-- 이전 2주 타임라인 (thread_id 포함) — 기본 범위
SELECT brand_name, topic, summary, week_start, thread_id, parent_thread_ids
FROM weekly_brand_summaries
WHERE week_start IN ('2주 전 월요일', '전주 월요일')
ORDER BY week_start

-- 인과·재발 판단 시 추가 조회 — 해당 브랜드 전체 히스토리
-- (2주 이전에 원인 이슈가 있을 가능성이 있으면 아래 쿼리로 확장)
SELECT brand_name, topic, summary, week_start, thread_id, parent_thread_ids
FROM weekly_brand_summaries
WHERE brand_name = '브랜드명'
ORDER BY week_start
```

### 작성 원칙
- **주제별 카드 분리** — 같은 브랜드라도 주제가 다르면 별도 카드 (예: "더리터 — POS 안정성", "더리터 — 브랜드 요청")
- **추론·분석 중심** — 단순 나열이 아니라 "이번 주 이 브랜드는 어떤 국면에 있는가" 판단
- **주제 전환 시 개행** — 맥락이 달라지면 문단 분리
- **2주 흐름 반영** — 2주 전 → 1주 전 → 이번 주 순으로 흐름을 읽어 지속·악화·해소·신규 여부를 판단. 2주 연속 등장한 이슈는 "장기화" 또는 "반복" 표현 사용

### 관계 유형 판단

타임라인 카드는 단순 주간 요약이 아니라 **브랜드별 사건의 인과·연속관계**를 추적하기 위한 데이터다. 카드를 만들 때는 아래 관계 유형을 우선순위대로 판단하고, 해당 관계가 있으면 `summary` 첫 문장 또는 첫 bullet에 관계를 명시한다.

| 관계 유형 | 판단 기준 | summary 표기 예시 |
|-----------|-----------|-------------------|
| **원인 → 결과** | 이전 사건 A가 직접 원인이 되어 이번 주 사건 B가 발생. "~로 인해", "~전환 이후", "~에서 비롯된" 등 원인 표현이 있거나 맥락상 직접 결과가 명확함 | "**원인→결과:** AppFit 전환 이후 인증 오류가 발생하며 고객 문의가 증가." |
| **반복 발생** | 같은 주제/증상이 해소 언급 없이 여러 주에 걸쳐 계속 등장하거나 동일 문의가 반복됨 | "**반복 발생:** 주문 취소 환원 누락 문의가 2주 연속 재언급." |
| **정책 변경 → 문의 증가** | 정책·등급·쿠폰·약관·운영 기준 변경 후 고객/매장 문의, CS, 확인 요청이 늘어남 | "**정책 변경→문의 증가:** 멤버십 산정 기준 변경 후 쿠폰 한도 문의가 증가." |
| **장애 → 보완 조치** | 장애/오류/누락/미노출 발생 후 패치, 운영 안내, 모니터링, 재발 방지 조치가 이어짐 | "**장애→보완 조치:** 결제 오류 확인 후 로그 모니터링과 화면 문구 보완이 진행." |
| **미해결 → 재언급** | 이전 카드에서 해결/완료가 명시되지 않은 사안이 이번 주 다시 언급됨 | "**미해결→재언급:** 관리자 화면 미노출 이슈가 조치 완료 없이 재확인 요청됨." |

관계 유형을 억지로 붙이지 않는다. 직접 연결 근거가 약하면 `신규` 또는 `관련 가능` 수준으로 남기고, `parent_thread_ids`는 확실한 원인·분기·재발 관계일 때만 기록한다.


### thread_id 이월 규칙

카드를 생성할 때 아래 케이스를 순서대로 판단한다. **참조 범위: 기본 이전 2주이나, 인과·재발 판단 시 관련 이슈가 2주보다 오래됐으면 해당 thread_id를 직접 조회해서 확인한다.**

| 케이스 | 판단 기준 | thread_id 처리 |
|--------|-----------|----------------|
| **이월** | 이전 주 카드와 같은 브랜드 + 같은 주제/이슈가 이번 주에도 계속됨 | 직전 주 카드의 `thread_id`를 그대로 사용 |
| **신규** | 이번 주에 처음 등장하는 이슈이며, 이전 이슈와 인과·재발 관계 없음 | `thread_id` 생략 (DB 기본값 `gen_random_uuid()` 자동 부여) |
| **분기** | 하나의 이슈에서 여러 세부 이슈로 갈라짐 | 새 카드마다 `thread_id` 생략, `parent_thread_ids`에 부모 카드의 `thread_id` 배열로 기록 |
| **인과** | 이전 이슈가 직접 원인이 되어 새로운 주제의 이슈가 발생함 (topic은 달라지지만 "~로 인해", "~에서 비롯된" 관계가 명확) | `thread_id` 생략, `parent_thread_ids`에 원인 카드의 `thread_id` 배열로 기록 |
| **재발** | 이전에 해소된 이슈와 동일한 주제가 일정 기간 공백 후 다시 등장함 | `thread_id` 생략, `parent_thread_ids`에 이전 해소 카드의 `thread_id` 기록 |

**이월 판단 기준 (엄격하게 적용):**
- 브랜드명이 같고, topic이 실질적으로 동일한 주제를 가리킬 때만 이월
- 이슈가 "해소"된 것으로 보이더라도 summary에 명시된 경우가 아니면 이월 유지
- 토픽이 다르거나 전혀 새로운 맥락이면 신규·인과·재발 중 하나로 판단

**인과 판단 기준:**
- summary에 "~버그로 인해", "~전환 이후", "~에서 비롯된" 등 명시적 원인 서술이 있을 때
- 같은 브랜드 내에서 이전 이슈의 직접적 결과로 새 이슈가 발생했음이 추론될 때
- 인과와 분기의 차이: 인과는 A→B 직렬 연쇄, 분기는 A에서 B·C·D가 병렬로 파생
- 원인이 여러 개면 `parent_thread_ids`에 복수 thread_id를 모두 기록 (예: `ARRAY['id_A', 'id_B']`)
- 특히 **정책 변경→문의 증가**, **장애→보완 조치**, **미해결→재언급**은 타임라인에서 중요한 연속관계이므로 이전 카드와의 연결 가능성을 반드시 검토한다

**재발 판단 기준:**
- 이전 카드에서 "해소", "완료", "배포 후 종결" 등이 명시된 이후 1주 이상 공백이 있다가 같은 주제가 재등장할 때
- 이월과의 차이: 이월은 중단 없이 이어지는 것, 재발은 해소 판정 이후 새로 터진 것
- 재발임을 summary에 명시 (예: "이전에 해결된 것으로 판단했으나 재발")

**참조 범위 확장 규칙:**
- 기본은 이전 2주 타임라인을 참조
- 인과·재발 판단 시 원인 이슈가 2주 이전에 있으면 해당 브랜드의 타임라인을 추가 조회해서 thread_id를 확인한다
- 인과 체인이 길어질수록 직접 원인(immediate parent)만 `parent_thread_ids`에 기록하고, 더 위의 원인은 그 카드의 parent를 통해 추적 가능하므로 중복 기록하지 않는다

### 데이터 구조

```sql
-- 이월 카드 (직전 주 thread_id 명시)
INSERT INTO weekly_brand_summaries (
  workspace_id, week_start, brand_name, topic,
  summary, item_count, key_tags, max_priority,
  thread_id
) VALUES (
  ..., '직전 주 카드의 thread_id'
)

-- 신규 카드 (thread_id 생략 → DB 자동 부여)
INSERT INTO weekly_brand_summaries (
  workspace_id, week_start, brand_name, topic,
  summary, item_count, key_tags, max_priority
)

-- 분기 카드 (parent_thread_ids 포함) — 하나의 이슈에서 여러 이슈로 병렬 파생
INSERT INTO weekly_brand_summaries (
  workspace_id, week_start, brand_name, topic,
  summary, item_count, key_tags, max_priority,
  parent_thread_ids
) VALUES (
  ..., ARRAY['부모_thread_id']
)

-- 인과 카드 (parent_thread_ids 포함) — 이전 이슈가 직접 원인이 된 새 이슈
-- 예: v1→v3 전환 버그(A)가 결제 누락(B)을 일으키고, B가 POS 안정성 위기(C)로 이어진 경우
-- 원인이 복수일 때: ARRAY['원인_id_A', '원인_id_B']
INSERT INTO weekly_brand_summaries (
  workspace_id, week_start, brand_name, topic,
  summary, item_count, key_tags, max_priority,
  parent_thread_ids
) VALUES (
  ..., ARRAY['원인_thread_id']
)

-- 재발 카드 (parent_thread_ids 포함) — 이전에 해소된 이슈가 공백 후 재등장
INSERT INTO weekly_brand_summaries (
  workspace_id, week_start, brand_name, topic,
  summary, item_count, key_tags, max_priority,
  parent_thread_ids
) VALUES (
  ..., ARRAY['이전_해소_thread_id']
)
```

- topic: 주제 키워드 (예: "키오스크 안정성", "AppFit 전환", "신규 매장 오픈")
- summary: 추론 포함 서술형 텍스트. 중요 키워드 **볼드** (반드시 `**키워드**` 쌍으로, 홀수 `*` 금지)
- key_tags: 해당 주제의 대표 태그 배열
- max_priority: 해당 주제의 최고 우선순위

---

## 완료 보고

각 단계 완료 시 요약 보고:
- **분류**: 총 raw N건, 분류 N건, 제외 N건, 브랜드별 건수
- **데일리 리포트**: 날짜, 항목 수, 브랜드 수, 주요 이슈 요약
- **타임라인**: 주차, 브랜드 수, 카드 수
