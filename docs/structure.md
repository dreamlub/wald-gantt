# 프로젝트 구조

## 폴더 트리

```text
wald-gantt/
|
├── src/                          <- 실제 애플리케이션 코드
│   ├── app/                      <- Next.js App Router 화면 + API
│   │   ├── (app)/                <- 로그인 후 사용하는 업무 화면
│   │   │   ├── page.tsx          <- / 홈 대시보드
│   │   │   ├── projects/         <- /projects 갠트 프로젝트
│   │   │   ├── tasks/            <- /tasks 태스크
│   │   │   ├── calendar/         <- /calendar 주간 캘린더
│   │   │   ├── weekly/           <- /weekly 주간 인사이트
│   │   │   ├── notes/            <- /notes 노트
│   │   │   ├── slack/            <- /slack Slack 수집/분류/리포트
│   │   │   ├── review/           <- /review 검토 후보
│   │   │   └── settings/         <- /settings 설정
│   │   ├── api/                  <- 백엔드 API 라우트
│   │   │   ├── brands/           <- 브랜드 타임라인 통계
│   │   │   ├── calendar/         <- Google Calendar 인증/이벤트 연동
│   │   │   ├── history/          <- 고객 히스토리 조회
│   │   │   ├── issues/           <- 이슈 CRUD/시드 ([id] 상태 토글 포함)
│   │   │   ├── reminders/        <- Slack 리마인더 cron
│   │   │   ├── review/           <- 검토 후보 API
│   │   │   ├── settings/         <- API 키 설정
│   │   │   ├── slack/            <- Slack 수집/재분류/매핑/스레드
│   │   │   ├── stats/            <- 통계 대시보드 (이슈/프로젝트)
│   │   │   ├── summary/          <- 데일리 리포트 공유
│   │   │   ├── timeline/         <- 타임라인 조회
│   │   │   └── weekly/           <- 주간 데이터 import/analyze
│   │   ├── login/                <- /login 로그인 화면
│   │   ├── share/[token]/        <- /share/:token 프로젝트 공유
│   │   └── share/daily/[token]/  <- /share/daily/:token 데일리 리포트 공유
│   │
│   ├── components/               <- 여러 화면에서 쓰는 공통 컴포넌트
│   │   ├── gantt/                <- 갠트 차트와 프로젝트 관련 UI
│   │   ├── tasks/                <- 태스크 폼/휴지통/보관 UI
│   │   └── ui/                   <- shadcn 기반 기본 UI
│   │
│   ├── hooks/                    <- 공통 React 훅
│   │   ├── use-click-away.ts
│   │   ├── use-confirm.tsx
│   │   └── use-undo-redo.ts
│   │
│   ├── lib/                      <- DB, 외부 서비스, 도메인 로직
│   │   ├── supabase/             <- Supabase browser/server client
│   │   ├── calendar-event-service.ts
│   │   ├── date-utils.ts
│   │   ├── dnd-utils.ts
│   │   ├── gantt-service.ts
│   │   ├── gantt-utils.ts
│   │   ├── google-calendar.ts
│   │   ├── history-service.ts
│   │   ├── history-query-utils.ts
│   │   ├── kst.ts
│   │   ├── note-service.ts
│   │   ├── slack-service.ts
│   │   ├── task-service.ts
│   │   ├── weekly-service.ts
│   │   └── workspace-api-keys.ts
│   │
│   ├── types/                    <- 공통 TypeScript 타입
│   └── proxy.ts                  <- Supabase 세션 확인 및 /login 리다이렉트
│
├── supabase/
│   └── migrations/               <- DB 스키마/RPC/인덱스 마이그레이션
│
├── public/                       <- 정적 파일
│   └── fonts/PretendardVariable.woff2
│
├── docs/                         <- 프로젝트 문서
│   ├── pipeline.md               <- Slack 수집/분류 파이프라인
│   └── structure.md              <- 이 파일
│
├── .agents/skills/               <- Codex 작업 스킬
│   ├── classify/                 <- Slack 메시지 분류/리포트/타임라인
│   ├── run/                      <- 개발 서버 실행
│   └── verify/                   <- Playwright UI 검증
│
├── .claude/                      <- Claude 로컬 설정/스킬/워크트리
├── AGENTS.md                     <- Next.js 버전 주의사항
├── CLAUDE.md                     <- Claude 작업 규칙
├── DEVLOG.md                     <- 개발 일지
├── components.json               <- shadcn/ui 설정
├── eslint.config.mjs             <- ESLint 설정
├── next.config.ts                <- Next.js 설정
├── package.json                  <- 스크립트와 의존성
├── postcss.config.mjs            <- Tailwind CSS v4 PostCSS 설정
├── tsconfig.json                 <- TypeScript 설정
├── vercel.json                   <- Vercel cron 설정
└── vitest.config.ts              <- Vitest 설정
```

## 주요 구성

| 영역 | 내용 |
|---|---|
| 프레임워크 | Next.js 16.2.6 App Router, React 19.2.4 |
| 언어/스타일 | TypeScript strict mode, Tailwind CSS v4 |
| UI | shadcn/ui(base-nova), lucide-react, Base UI 일부 |
| 인증/DB | Supabase SSR client, `src/proxy.ts` 세션 가드 |
| 외부 연동 | Slack, Google Calendar, Anthropic, Outline |
| 테스트 | Vitest + jsdom + Testing Library |
| 배포 | Vercel, `/api/reminders/slack` daily cron |

## 앱 라우트

| 경로 | 파일 | 역할 |
|---|---|---|
| `/` | `src/app/(app)/page.tsx` | 홈 대시보드 |
| `/projects` | `src/app/(app)/projects/page.tsx` | 갠트 프로젝트 |
| `/tasks` | `src/app/(app)/tasks/page.tsx` | 태스크 관리 |
| `/calendar` | `src/app/(app)/calendar/page.tsx` | 캘린더/일정 |
| `/weekly` | `src/app/(app)/weekly/page.tsx` | 주간 인사이트 |
| `/notes` | `src/app/(app)/notes/page.tsx` | 노트 |
| `/slack` | `src/app/(app)/slack/page.tsx` | Slack 수집/분류/리포트/타임라인 트래커 |
| `/stats` | `src/app/(app)/stats/page.tsx` | 통계 대시보드 (메시지/프로젝트/이슈) |
| `/review` | `src/app/(app)/review/page.tsx` | 검토 후보 |
| `/settings` | `src/app/(app)/settings/page.tsx` | 설정 |
| `/login` | `src/app/login/page.tsx` | 로그인 |
| `/share/:token` | `src/app/share/[token]/page.tsx` | 프로젝트 공유 |
| `/share/daily/:token` | `src/app/share/daily/[token]/page.tsx` | 데일리 리포트 공유 |

## 파일 규모 (2026-05-31 기준)

| 항목 | 수량 |
|---|---:|
| 전체 TS/TSX 파일 | 244개 |
| 전체 코드 줄 수 | 35,258줄 |
| App Router page 파일 | 13개 |
| API route 파일 | 32개 |
| 테스트 파일 | 11개 |
| Supabase migration 파일 | 23개 |

## 파일 크기 상위 (줄 수)

| 파일 | 줄 수 |
|---|---:|
| `src/components/gantt/ProjectFormDialog.tsx` | 539 |
| `src/app/(app)/settings/_components/settings-shell.tsx` | 503 |
| `src/app/(app)/page.tsx` | 474 |
| `src/components/gantt/GanttChart.tsx` | 460 |
| `src/lib/task-service.ts` | 455 |
| `src/app/(app)/slack/_components/daily-report-view-v2.tsx` | 453 |
| `src/app/(app)/slack/_components/slack-sidebar.tsx` | 452 |
| `src/app/(app)/slack/_components/schedule-calendar-view.tsx` | 440 |
| `src/app/(app)/calendar/_components/calendar-shell.tsx` | 426 |
| `src/app/(app)/slack/_components/slack-shell.tsx` | 418 |
| `src/lib/slack-service.ts` | 415 |
| `src/components/tasks/TaskFormDialog.tsx` | 412 |

> 현재 1,000줄을 넘는 TS/TSX 파일은 없습니다.
