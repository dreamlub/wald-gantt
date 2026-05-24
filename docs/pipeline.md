# Slack → 타임라인 파이프라인

## 전체 흐름

```
Slack 메시지
    ↓ (수동 트리거: "N월 N일 분류해줘")
1단계: 분류 → client_history
    ↓ (수동 트리거: "N/N 데일리 리포트 만들어줘")
2단계: 데일리 리포트 → daily_reports
    ↓ (수동 트리거: "N월 N주차 타임라인 업데이트해줘")
3단계: 타임라인 → weekly_brand_summaries
```

모든 단계는 Claude가 수동으로 실행한다. 자동화 파이프라인 없음.

---

## 1단계: 분류 (client_history)

**입력**: `slack_raw_messages` — Slack 원본 메시지 (채널별 JSON)

**참조**:
- `slack_channel_mappings` — 채널 ID → 브랜드명 매핑
- 기존 `client_history` — 중복 분류 방지

**출력**: `client_history` — 브랜드별 이슈 단건

| 필드 | 내용 |
|------|------|
| brand_name | 채널 매핑 또는 본문 추론 |
| title | 30자 이내, "어디서 무슨 일" |
| body | 배경·경과·조치 개조식 |
| tags | issue / decision / mention / schedule |
| priority | high / medium / low |

**제외 기준**: 봇 알림, "넵"·이모지 단독 답변, 채널 입퇴장

---

## 2단계: 데일리 리포트 (daily_reports)

**입력**: 당일 `client_history` 전체

**참조**:
- 과거 7일 `daily_reports` — 이슈 연속성·해결 여부 추적
- 현재 주 + 직전 주 `weekly_brand_summaries` — 주간 흐름 맥락

**출력**: `daily_reports.content` (JSONB)

```
headline        — 오늘 전체 1~2줄 요약
action_items[]  — urgent / watch / info 이슈 목록
upcoming[]      — 예정 일정
pending[]       — 답변 대기 중인 항목
decisions[]     — 확정된 결정 사항
```

**작성 원칙**: 단순 나열 금지, 연속성 추적, 시사점 포함

---

## 3단계: 타임라인 (weekly_brand_summaries)

**입력**: 해당 주 `daily_reports` (월~금)

**참조**:
- 이전 2주 `weekly_brand_summaries` — 기본 범위
- 인과·재발 판단 시 해당 브랜드 전체 `weekly_brand_summaries` — 확장 범위

> 데일리 리포트는 이번 주 카드 내용 생성에만 사용한다.  
> `parent_thread_ids` 추론은 위클리 데이터만으로 수행한다.

**출력**: `weekly_brand_summaries` — 브랜드×주차 카드

| 필드 | 내용 |
|------|------|
| thread_id | 이슈 연속성 키. 이월 시 동일 uuid 유지 |
| parent_thread_ids | 부모 이슈 uuid 배열. 인과·분기·재발 시 기록 |
| topic | 이슈 주제 키워드 |
| summary | 추론 포함 서술형, 중요 키워드 **볼드** |

### thread_id 판단 규칙

| 케이스 | 기준 | thread_id | parent_thread_ids |
|--------|------|-----------|-------------------|
| 이월 | 같은 브랜드+주제가 이번 주도 계속 | 직전 주와 동일 | 변경 없음 |
| 신규 | 처음 등장, 인과·재발 관계 없음 | DB 자동 부여 | null |
| 분기 | 하나의 이슈에서 여러 이슈로 병렬 파생 | DB 자동 부여 | [부모 id] |
| 인과 | 이전 이슈가 직접 원인 (topic은 달라짐) | DB 자동 부여 | [원인 id] |
| 재발 | 해소 판정 후 공백이 있다가 동일 주제 재등장 | DB 자동 부여 | [이전 해소 id] |

**인과 판단 신호**: summary에 "~버그로 인해", "~전환 이후", "~에서 비롯된" 등 원인 서술 명시  
**재발 판단 신호**: 이전 카드에 "해소", "완료", "배포 후 종결" 명시 + 1주 이상 공백  
**복합 인과**: 원인이 여러 개면 `parent_thread_ids`에 모두 기록  
**체인 처리**: 직접 원인(immediate parent)만 기록, 그 위는 parent 체인으로 추적

---

## DB 테이블 요약

| 테이블 | 역할 | 생성 단계 |
|--------|------|-----------|
| `slack_raw_messages` | Slack 원본 메시지 | 수집 (자동) |
| `slack_channel_mappings` | 채널 → 브랜드 매핑 | 사전 설정 |
| `client_history` | 브랜드별 이슈 단건 | 1단계 |
| `daily_reports` | 일간 요약 리포트 | 2단계 |
| `weekly_brand_summaries` | 주간 브랜드별 타임라인 카드 | 3단계 |
