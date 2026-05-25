# 프로젝트 구조

## 폴더 트리

```
wald-gantt/
│
├── src/                          ← 실제 코드 전부 여기
│   ├── app/                      ← 화면 + API
│   │   ├── (app)/                ← 로그인 후 보이는 화면들
│   │   │   ├── page.tsx          ← / 홈(커맨드센터)
│   │   │   ├── projects/         ← /projects 갠트 프로젝트
│   │   │   ├── tasks/            ← /tasks 태스크
│   │   │   ├── calendar/         ← /calendar 주간 달력
│   │   │   ├── weekly/           ← /weekly 주간 인사이트
│   │   │   ├── notes/            ← /notes 데일리 노트
│   │   │   ├── summary/          ← /summary 고객 히스토리
│   │   │   └── settings/         ← /settings 설정
│   │   ├── api/                  ← 백엔드 API (Slack, 캘린더 등)
│   │   ├── login/                ← /login 로그인 화면
│   │   └── share/[token]/        ← /share/xxx 외부 공유 링크
│   │
│   ├── components/               ← 여러 화면에서 쓰는 공통 부품
│   │   ├── gantt/                ← 갠트 차트 부품들
│   │   ├── tasks/                ← 태스크 폼·휴지통 등
│   │   └── ui/                   ← 버튼·인풋 등 기본 UI (shadcn)
│   │
│   ├── hooks/                    ← 공통 로직 묶음
│   │   ├── use-undo-redo.ts      ← 실행취소/다시실행
│   │   ├── use-vault-handle.ts   ← 로컬 폴더 접근(Notes용)
│   │   └── use-confirm.tsx       ← 확인 다이얼로그
│   │
│   ├── lib/                      ← DB·외부서비스 통신 코드
│   │   ├── gantt-service.ts      ← 프로젝트·태스크 DB CRUD
│   │   ├── slack-service.ts      ← Slack 메시지 수집·분류
│   │   ├── history-service.ts    ← 고객 히스토리 조회
│   │   ├── weekly-service.ts     ← 주간보고 데이터
│   │   ├── insight-service.ts    ← AI 인사이트
│   │   ├── daily-note.ts         ← 노트 파일 읽기·쓰기
│   │   ├── gantt-utils.ts        ← 날짜 계산 유틸
│   │   ├── dnd-utils.ts          ← 드래그드롭 유틸
│   │   └── supabase/             ← DB 연결 설정
│   │
│   ├── types/                    ← TypeScript 타입 정의
│   └── proxy.ts                  ← 미로그인 시 /login 리다이렉트
│
├── public/                       ← 정적 파일
│   └── fonts/PretendardVariable.woff2   ← 폰트
│
├── docs/                         ← 프로젝트 문서
│   ├── structure.md              ← 이 파일 (폴더 구조)
│   └── pipeline.md               ← Slack 수집·분류 파이프라인
│
├── .claude/skills/               ← Claude 스킬
│   ├── classify/                 ← 슬랙 분류 → 리포트 → 타임라인
│   ├── run/                      ← 개발 서버 실행
│   └── verify/                   ← Playwright UI 검증
│
├── CLAUDE.md                     ← Claude 작업 규칙
├── AGENTS.md                     ← Next.js 버전 주의사항
├── DEVLOG.md                     ← 개발 일지
├── .env.local                    ← 환경변수 (Supabase·Slack 키 등)
├── package.json                  ← 의존성 목록
├── next.config.ts                ← Next.js 설정
├── vercel.json                   ← 배포 설정
└── tsconfig.json                 ← TypeScript 설정
```

## 파일 규모 (2026-05-25 기준)

| 항목 | 수량 |
|---|---|
| 전체 TS/TSX 파일 | 137개 |
| 전체 코드 줄 수 | 약 26,000줄 |
| API 라우트 | 23개 |
| Summary 컴포넌트 | 12개 |

## 파일 크기 상위 (줄 수)

| 파일 | 줄 수 |
|---|---|
| `components/gantt/GanttChart.tsx` | 972 |
| `summary/_components/history-sidebar.tsx` | 703 |
| `lib/gantt-service.ts` | 684 |
| `tasks/_components/TaskDetailDrawer.tsx` | 682 |
| `summary/_components/daily-report-view.tsx` | 663 |
| `api/weekly/import-dx1/route.ts` | 626 |
| `summary/_components/history-shell.tsx` | 595 |
| `tasks/TaskFormDialog.tsx` | 592 |
| `weekly/_components/weekly-dashboard.tsx` | 583 |

> 파일당 1,000줄 이하 규칙 준수 중.
