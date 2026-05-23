---
description: 슬랙 raw 메시지를 읽고 client_history에 분류/저장
---

## 입력

사용자가 날짜를 지정한다. 예: "4월 1일 분류해줘", "3/15~3/20 분류"

## 사전 조회

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

## 분류 절차

채널별로 묶어서 메시지를 읽고 맥락을 파악한 뒤, 메시지별로 판단한다.

### 제외 (저장하지 않음)
- 봇/자동화 알림 (ETL, 배포, 모니터링)
- 채널 입퇴장, 캘린더 알림
- "넵", "확인", "ㅇㅋ" 단독 답변 (스레드 없을 때)
- 이모지만 있는 메시지

### 포함 → 아래 필드로 저장

| 필드 | 규칙 |
|------|------|
| brand_name | 채널 매핑 기준. 매핑 없는 채널이라도 본문에 브랜드명이 명시되어 있으면 해당 브랜드로 분류 (예: "더리터 김해큐시티점 매출 오류" → 더리터). 둘 다 없으면 "미분류" |
| title | 30자 이내. "어디서 무슨 일" 형태 |
| body | 개조식 블릿으로 기승전결 요약 (아래 형식 참조) |

body 형식:
```
• 배경: 어떤 상황에서 발생했는지
• 경과: 어떻게 진행되었는지 (스레드 내용 반영)
• 조치/결과: 어떤 액션이 필요하거나 결론이 났는지
```
- 해당 단계가 없으면 생략 (배경만 있을 수도 있음)
- 라벨(배경, 경과, 조치 등)에는 볼드 쓰지 않음. 중요 키워드만 **볼드**로 표기
- 예시: `• 배경: 영동계산점 1/4 키오스크 **매출 누락** 발생\n• 경과: KIS VAN 에이전트 버그로 응답 미수신 확인\n• 조치: 안드로이드 설정 제거 후 자동업데이트 진행`
| author | 작성자 이름 (raw_json의 user_name) |
| tags | 아래 태그 정의 참조 |
| priority | high / medium(기본) / low |

### 태그 정의

| 태그 | 조건 |
|------|------|
| issue | 버그, 오류, CS, 장애, 문의 |
| decision | 정책/계약/방향이 "확정"된 경우만 |
| mention | raw_json의 text 또는 replies[].text에 `<@U09H44MEK5Z>` 문자열 포함 (AI 판단이 아닌 문자열 검색) |
| schedule | 미팅/배포/오픈 일정이 구체적 날짜와 함께 언급 |

### 우선순위

| 레벨 | 조건 |
|------|------|
| high | 운영장애, CS 다발, 계약, 긴급 요청 |
| medium | 일반 이슈, 프로젝트 진행, 정책 논의 (기본값) |
| low | 단순 공유, 완료 보고, 일정 조율 |

## 저장

분류 결과를 client_history에 upsert한다.

1. 기존 분류가 있으면 → client_history_summaries에 이전 버전 아카이브:
```sql
INSERT INTO client_history_summaries (workspace_id, client_history_id, thread_count, title, body)
VALUES (workspace_id, 기존id, 기존thread_count, 기존title, 기존body)
```

2. client_history에 upsert:
```sql
INSERT INTO client_history (
  workspace_id, brand_name, raw_message_id, thread_count,
  type, tags, channel, source_id, source_ref,
  title, body, priority, author, occurred_at, reclassified_at
) VALUES (...)
ON CONFLICT (workspace_id, source_id) DO UPDATE SET
  brand_name = EXCLUDED.brand_name,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  tags = EXCLUDED.tags,
  priority = EXCLUDED.priority,
  author = EXCLUDED.author,
  thread_count = EXCLUDED.thread_count,
  reclassified_at = EXCLUDED.reclassified_at
```

필드 값:
- workspace_id: 위에서 조회한 값
- type: 'slack'
- channel: raw_json->>'channel'
- source_id: raw_json->>'ts'
- source_ref: `https://waldlust-product.slack.com/archives/{channel_id}/p{ts에서 . 제거}`
- occurred_at: `to_timestamp(ts::float)`
- reclassified_at: 기존 분류가 있었을 때만 now()

## 완료 보고

처리 결과를 요약해서 보고한다:
- 총 raw N건, 분류 N건, 제외 N건
- 브랜드별 건수
