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
3. **현재 주 타임라인** — 이번 주 브랜드별 큰 그림에서 오늘의 위치

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

-- 현재 주 타임라인
SELECT brand_name, topic, summary
FROM weekly_brand_summaries
WHERE week_start = (해당 날짜의 월요일)
```

### 작성 원칙
- **단순 나열 금지** — "이런 일이 있었다"가 아니라 "그래서 어떤 상황이다"를 추론
- **연속성 추적** — "12/31부터 이어진 CS 이슈가 갈수록 심화", "전일 조치에도 불구하고 새 매장에서 발생"
- **시사점 포함** — "근본적 점검이 시급하다", "출시 일정이 가시화되고 있다"

### 데이터 구조 (daily_reports.content JSONB)

```json
{
  "headline": "오늘 전체 요약 1-2문장. 핵심 키워드 **볼드**",
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
2. **이전 주 타임라인** — 브랜드별 흐름의 연속성

```sql
-- 해당 주 데일리 리포트
SELECT report_date, content
FROM daily_reports
WHERE report_date BETWEEN '월요일' AND '일요일'
ORDER BY report_date

-- 이전 주 타임라인
SELECT brand_name, topic, summary
FROM weekly_brand_summaries
WHERE week_start = '전주 월요일'
```

### 작성 원칙
- **주제별 카드 분리** — 같은 브랜드라도 주제가 다르면 별도 카드 (예: "더리터 — POS 안정성", "더리터 — 브랜드 요청")
- **추론·분석 중심** — 단순 나열이 아니라 "이번 주 이 브랜드는 어떤 국면에 있는가" 판단
- **주제 전환 시 개행** — 맥락이 달라지면 문단 분리

### 데이터 구조

```sql
INSERT INTO weekly_brand_summaries (
  workspace_id, week_start, brand_name, topic,
  summary, item_count, key_tags, max_priority
)
```

- topic: 주제 키워드 (예: "키오스크 안정성", "AppFit 전환", "신규 매장 오픈")
- summary: 추론 포함 서술형 텍스트. 중요 키워드 **볼드**
- key_tags: 해당 주제의 대표 태그 배열
- max_priority: 해당 주제의 최고 우선순위

---

## 완료 보고

각 단계 완료 시 요약 보고:
- **분류**: 총 raw N건, 분류 N건, 제외 N건, 브랜드별 건수
- **데일리 리포트**: 날짜, 항목 수, 브랜드 수, 주요 이슈 요약
- **타임라인**: 주차, 브랜드 수, 카드 수
