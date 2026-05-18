# Slack Summary 수집 표준 프롬프트

발트루스트 DX담당 Slack Summary 기능의 데이터 수집·분류·저장을 위한 표준 프롬프트입니다.

---

## 목적

슬랙 채널에서 클라이언트·내부·외부 관련 메시지를 수집하여, 일관된 기준으로 분류·요약하고 Supabase `client_history` 테이블에 저장합니다.

---

## 수집 절차

### Step 1. 채널 탐색

1. Supabase `clients` 테이블에서 모든 클라이언트의 `keywords` 배열 조회
2. `slack_search_channels`로 키워드 매칭 채널 탐색
3. 키워드 변형 자동 대응 (예: `paiks`로 검색 실패 시 `paikdabang`도 시도)

### Step 2. 메시지 수집

1. `slack_search_public_and_private`로 지정 기간의 **전체 채널** 메시지 검색 (`on:YYYY-MM-DD` 또는 `after:` + `before:`)
2. 스레드가 있으면 `slack_read_thread`로 전체 스레드 수집
3. **`source_id`에 슬랙 ts(timestamp) 그대로 저장** (URL 복원용)
4. 봇 메시지 / 입퇴장 알림은 즉시 제외

### Step 3. 분류·요약

* **브랜드** (single): 매칭 우선순위로 결정
* **태그** (다중 적용)
* **중요도** (single)
* **작성자** (single)

### Step 4. Supabase 저장

* 중복 체크: `(workspace_id, source_id)` 유니크
* `source_ref`에 슬랙 메시지 단위 URL 생성
* `type` 컬럼: `'slack'` 고정

### Step 5. in_progress 건 스레드 재확인

* DB에서 `tags @> ARRAY['in_progress']` 이고 `done` 없는 건 조회
* 각 건의 `source_id`(ts)와 `channel`로 `slack_read_thread` 호출
* 수집 기간 이후 새 답글이 있으면 내용 반영:
  * 완료 표현 확인 시 → `tags`에 `done` 추가, `in_progress` 제거, body 업데이트
  * 새 진행 내용 있으면 → body 업데이트
* 변경 없으면 SKIP

---

## 브랜드 매칭 우선순위

```
1. clients.channels 배열에 현재 채널명 포함 → 해당 브랜드로 확정 (본문 매칭 생략)
   ↓ 매칭 실패
2. 메시지 본문에서 clients.keywords 배열 매칭
   ↓ 매칭 실패
3. 외부 키워드 매칭 (toss, kakaopay, aws, outline 등 파트너/인프라)
   ↓ 매칭 실패
4. 내부로 분류 (기본값)
```

* `clients.channels`: 채널과 브랜드가 1:1로 확정되는 경우 등록. `#` 없이 채널명만 저장
* `client_history.channel` 컬럼도 `#` 없이 채널명만 저장
* 혼재 채널은 channels에 등록하지 않고 keywords로 본문 매칭
* 수집 중 처음 보는 채널에서 keywords 매칭이 성공하면, 해당 채널을 `clients.channels`에 자동 추가
* 한 메시지가 여러 브랜드 키워드를 포함하면 채널명 기준 우선

---

## 태그 판정 기준 (다중 적용 가능)

| 태그 | 조건 |
|------|------|
| **issue** | 버그/오류/장애/CS접수/문제 발생. "안 됨", "오류", "확인 부탁" |
| **decision** | 정책/계약/방향이 확정·결정된 사항. 검토/협의 중은 제외 |
| **mention** | `@최정규` 멘션 포함 (Slack User ID: `U09H44MEK5Z`) |
| **in_progress** | 미해결 이슈/검토/협의/확인 중인 사안 |
| **done** | 명시적 완료 표현 ("완료", "끝났음", "처리됨") |
| **schedule** | 미팅/회의/배포 일정이 확정된 경우 |

---

## 중요도 판정 기준

* **high**: 운영 장애 / CS 다발 / 매출 영향 / 계약 / 긴급
* **medium** (기본값): 일반 이슈 / 정책 변경 / 프로젝트 진행 결정
* **low**: 단순 공유 / 완료 보고 / 일정 조율

---

## 작성자 표기 규칙

* 내부/외부 구분 없이 이름만 표기 (예: `최정규`, `강지훈`, `이소정`)

---

## 제외 기준

* 단순 인사 / 이모지 / 잡담
* 채널 입장 / 퇴장 알림
* 봇 메시지 (Slackbot, Canvas 등)
* 일정 단순 조율 (확정된 일정만 schedule)
* 의미 없는 짧은 답변 ("넵", "확인했습니다" 단독)
* 단순 근태 공유 (반차/연차 등)
* 운동/잡담 채널
* 개인 이메일 채널 (personal-email-tony 등)

---

## 요약 작성 규칙

### title (제목)

* 30자 이내
* 매장명 / 이슈 종류 / 대상 시스템을 우선 포함
* 예: `점주앱 매출 미집계 — 강릉아산병원점`

### body (요약)

* 3줄 개조식. 각 줄은 `•`로 시작, 개행으로 구분.
* 1줄: 맥락 (날짜·매장명·대상자 포함)
* 2줄: 구체적으로 어떤 일이 일어났는지
* 3줄: 누가 무엇을 해야 하는지 (완료된 경우 완료 표현 명시)

---

## source_ref URL 생성 규칙

```
https://waldlust-product.slack.com/archives/{channel_id}/p{ts_without_dot}
```

* `ts`의 점(`.`)을 제거하고 앞에 `p` 붙임
* 스레드 댓글이면 `?thread_ts={parent_ts}&cid={channel_id}` 쿼리 추가
* `source_id` 컬럼에도 ts 그대로 저장 (중복 방지 + 추적용)

---

## Supabase 저장 스키마

```sql
client_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  client_id    uuid REFERENCES clients(id),
  type         text NOT NULL,              -- 'slack' 고정
  tags         text[] DEFAULT '{}',
  channel      text NOT NULL,              -- '#' 없이 채널명
  source_id    text,                       -- 슬랙 ts
  source_ref   text,                       -- 메시지 단위 URL
  title        text NOT NULL,              -- 30자 이내
  body         text,                       -- 3줄 분량
  priority     text CHECK (priority IN ('high','medium','low')),
  author       text,                       -- 이름만
  occurred_at  timestamptz NOT NULL,       -- 슬랙 메시지 일시
  created_at   timestamptz DEFAULT now(),  -- DB 등록 일시
  updated_at   timestamptz DEFAULT now(),  -- DB 수정 일시
  deleted_at   timestamptz
)
```

### 중복 방지

유니크 인덱스: `(workspace_id, source_id) WHERE source_id IS NOT NULL`

---

## 실행용 프롬프트

```
[클라이언트명 또는 "전체"] 슬랙에서 [기간] 메시지 수집·분류·저장.

1. clients 테이블 전체 조회 (id, name, keywords, channels)
2. slack_search_public_and_private로 전체 채널 메시지 검색
3. 각 메시지/스레드 분류:
   브랜드 매칭 우선순위:
     ① clients.channels 배열에 현재 채널명 있으면 → 해당 브랜드 확정
     ② 없으면 메시지 본문에서 clients.keywords 매칭
     ③ 없으면 외부 키워드 매칭
     ④ 없으면 미분류(기본값)
   ① 매칭 성공 후 해당 채널이 clients.channels에 없으면 자동 추가
   태그(다중): issue / decision / mention / in_progress / done / schedule
   중요도: high / medium / low
   작성자: 이름만 표기
   occurred_at: 슬랙 메시지의 일시 그대로 저장 (YYYY-MM-DDTHH:MM:SS+09:00)
4. title 30자, body • 3줄 개조식
5. source_id = 슬랙 ts 그대로, source_ref = 메시지 단위 URL
6. type = 'slack'
7. client_history INSERT (source_id 중복 SKIP)
8. in_progress 건 스레드 재확인 및 태그/body 업데이트
9. 결과: 채널 수, 저장 건수, 태그 분포, 제외 사유
```

---

## 수집 결과 보고 포맷

```
[클라이언트] 슬랙 수집 결과 (기간: YYYY-MM-DD ~ YYYY-MM-DD)

채널: N개 (#channel1, #channel2, ...)
수집된 메시지: 총 N건
저장된 항목: N건 (제외 M건)

태그 분포:
- 이슈: N건
- 의사결정: N건
- 멘션: N건
- 진행중: N건
- 완료: N건
- 일정: N건

중요도 분포:
- high: N건 / medium: N건 / low: N건

주요 이슈 / 결정사항 (Top 3):
1. ...
2. ...
3. ...
```

---

## 수집 시 반드시 지킬 것

### 스레드 처리 (필수)

* `reply_count > 0` 또는 `thread_ts`가 있는 메시지는 **반드시** `slack_read_thread` 호출
* 스레드의 결정/답변/이슈 진행상황을 본문 요약에 반드시 반영
* 스레드 내용이 원 메시지와 별개의 사안이면 별도 건으로 저장
* 채널 메시지만 읽고 스레드 건너뛰지 말 것

### source_id 규칙

* 임의 ID 사용 금지 (`mcp_001` 같은 것)
* 슬랙 메시지의 `ts` 값을 그대로 사용 (예: `1747282569.123456`)
* 이래야 source_ref URL 복원 가능 + 중복 방지 동작

### 전체 채널 검색

* 확정 채널만 읽지 말고 `slack_search_public_and_private`로 **전체 채널** 검색
* 확정 채널 외에서도 의미 있는 메시지 수집
