# Wald Gantt — 개발 로그

## 프로젝트 개요

Next.js 16 + Supabase 기반 1인용 간트 차트·태스크 관리 웹앱.
워크스페이스 1개에 여러 보드(파일)를 만들고, 카테고리/프로젝트/태스크를 관리한다.
보드는 토큰 URL로 외부에 읽기 전용 공개 가능.

> Next.js 16에서 `middleware.ts` → `src/proxy.ts`로 이름 변경됨 — 인증 가드는 `proxy.ts`에 있음.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | Next.js 16.2.6 (App Router, Turbopack) |
| UI | React 19.2.4 + Tailwind CSS v4 + shadcn/ui + @base-ui/react |
| 백엔드 | Supabase (Auth + PostgreSQL + RLS) |
| 언어 | TypeScript |
| 드래그앤드롭 | @dnd-kit (core/sortable/utilities) |
| 날짜 | date-fns, react-day-picker |
| 토스트 | sonner |
| 모션 | framer-motion |
| 아이콘 | lucide-react |
| AI | @anthropic-ai/sdk (Claude Haiku — Summary 인사이트 + Weekly AI 요약) |
| 브라우저 탭 | "Wald Task Manager" |

---

## DB 스키마

```
workspaces
  id, name, created_at

workspace_members
  workspace_id, user_id, role

gantt_boards
  id, workspace_id, name, sort_order, created_at, updated_at

board_share_tokens
  board_id, token, created_at

gantt_categories
  id, workspace_id, board_id, name, color, sort_order, created_at, updated_at

gantt_projects
  id, workspace_id, board_id, category_id, parent_id
  name, status, start_date(YYYY-MM-DD), end_date(YYYY-MM-DD)
  sort_order, team, pm, memo, priority, created_at, updated_at
  deleted_at TIMESTAMPTZ

gantt_project_history                    ← DB 트리거 자동 기록 (SECURITY DEFINER)
  id, project_id, field_name, old_value, new_value, changed_at

gantt_tasks
  id, workspace_id, title
  status: 'backlog' | 'to-do' | 'in-progress' | 'done' | 'pending'
  assignee TEXT, start_date DATE, due_date DATE, memo TEXT
  labels TEXT[], parent_id, priority SMALLINT DEFAULT 0
  sort_order, created_at, updated_at, deleted_at

gantt_task_history                       ← DB 트리거 자동 기록 (SECURITY DEFINER)
  id, task_id, field_name, old_value, new_value, changed_at

gantt_task_projects                      ← M:N 연결
  task_id, project_id

clients
  id, workspace_id, name, name_en, color, keywords TEXT[], sort_order, created_at, updated_at

client_history                           ← Slack 수집 이력 (Claude Code MCP 수동 INSERT)
  id, workspace_id, client_id
  tags TEXT[]                            ← 6종: issue/decision/mention/in_progress/done/schedule
  channel, source_ref, source_id, title, body
  occurred_at, priority, author, created_at, deleted_at
  ⚠️ source_id unique 인덱스: 초기 추가 → Make.com 호환성으로 제거. 중복 방지는 INSERT 측에서 처리

insights                                 ← AI 주간 분석 캐시
  id, workspace_id, week_start DATE
  content JSONB, analyzed_at, source_count INT
  created_at, updated_at
  UNIQUE (workspace_id, week_start)
```

**insights.content JSONB 구조**
```ts
{
  headline: string
  action_items: [{ id, severity: 'urgent'|'watch'|'info', title, brand, related_count, summary, action }]
  upcoming:     [{ date, title, brand, priority: 'high'|'medium'|'low' }]
  pending:      [{ brand, count, items }]
  decisions:    [{ id, title, desc, brand }]
}
// brand 필드는 client_id(UUID) 저장 — 이름 변경에 강건
```

### Supabase RPC / 트리거
- `create_workspace_for_user(workspace_name)` — RLS 우회용 SECURITY DEFINER
- `get_shared_board(p_token)` — 비인증 접근용, board + categories + projects 한 번에 반환
- `log_gantt_project_changes()` — AFTER UPDATE 트리거 (SECURITY DEFINER)
- `log_gantt_task_changes()` — AFTER UPDATE 트리거 ⚠️ 반드시 SECURITY DEFINER여야 RLS 통과

---

## 페이지 구조

좌측 56px 고정 다크 아이콘 레일(`AppNav`, `bg-ink-900`)에서 전환. 라벨은 영문:

| 경로 | 라벨 | 설명 |
|------|------|------|
| `/` | Projects | 간트 차트 메인 |
| `/tasks` | Tasks | 태스크 관리 (5뷰) |
| `/calendar` | Calendar | 주간 타임그리드 캘린더 |
| `/weekly` | Weekly | 주간보고 (Outline 연동) |
| `/notes` | Notes | Obsidian Daily Note — File System Access API (Chrome/Edge) |
| `/summary` | Summary | Slack 수집 이력 + AI 인사이트 |
| `/settings` | Settings | 설정 (계정/연동/화면/키워드/데이터) |
| `/settings/keywords` | — | 클라이언트별 슬랙 탐색 키워드 관리 |
| `/share/[token]` | — | 외부 공개 읽기 전용 보드 (인증 우회) |
| `/login` | — | 로그인 |

---

## 주요 기능

### Projects 페이지 (`/`)

**보드 사이드바 (BoardSidebar)**
- 워크스페이스 내 여러 보드 생성·전환, @dnd-kit 순서 드래그
- 더블클릭 인라인 이름 편집, 사이드바 토글, 하단 휴지통 배지

**GanttChart**
- 월/주/일 3뷰 (72px / 36px / 28px), 바 이동+리사이즈, 뷰 전환 시 today 스크롤
- 카테고리·프로젝트 드래그 재정렬 (`liveItems` 실시간 미리보기)
- 좌측 컬러 막대 = 상태 (4px, hover 6px), 클릭으로 상태 사이클
- 우측 호버 액션 + 그라데이션 페이드, 메모 풍선말 (`clampTooltipPos`)
- Undo/Redo (Ctrl+Z/Y, 20단계), TrashPanel, ShareDialog

**GanttToolbar**
- 검색 펼침, 필터(팀/PM), 정렬(4종), 지연 배지 토글
- 버튼 순서: undo/redo → 지연 배지 (undo/redo가 고정 기준점)

### 태스크 페이지 (`/tasks`)

**5개 뷰**
| 뷰 | 특이사항 |
|----|---------|
| 일반 | 지연 묶음 + 상태 그룹 + 인라인 퀵 등록 |
| 목록 | 부모-자식 들여쓰기 + 헤더 정렬 + 인라인 퀵 등록 |
| 칸반 | 컬럼 간 이동(상태변경) + 컬럼 내 순서 드래그 (`useSortable`) |
| 간트 | 바 드래그로 날짜 변경 (좌우 핸들 리사이즈 + 중앙 이동) |
| 캘린더 | 마감일 기준, `+N개 더` viewport-flip popover |

**사이드바 (240px)**
- 퀵필터 6종 (활성 reclick → 해제), 프로젝트·담당자·라벨 클릭 필터
- 담당자: 상위 7명 + "+N명 더보기", 이름 검색 시 전체 노출

**TaskRow**
- 우선순위 폰트 강조, Done `line-through opacity-55`
- 배지: 지연 / 시작 지연 / 무응답(7일+) / 연결 프로젝트 / 라벨 / 하위 진행
- 호버 `sub +` 버튼 → 인라인 하위 태스크 등록

**벌크 액션** — `selectionMode` → 체크박스 + floating 액션 바 (상태변경/삭제/취소)

**TaskDetailDrawer** — 정보/메모/이력 3탭, Copy+Trash 헤더 버튼

**TaskFormDialog** — `initialTitle`/`initialMemo` prop (Summary 연동 pre-fill 지원)

**인라인 퀵 등록** — Enter 연속 등록, Esc/빈값 blur 취소, sub는 부모 프로젝트 자동 상속

**필터링** — 하위 태스크 부모 조건 미충족 시 `baseFiltered`에서 복원 → 트리 렌더링 유지

### Summary 페이지 (`/summary`)

**3개 뷰**: 테이블 / 타임라인 / 인사이트

**사이드바**
- 테이블·타임라인: 기간 프리셋 4종 + DatePicker / 브랜드 콤보박스 / 태그 다중(AND) / 중요도
- 인사이트: 최근 4주 목록 + 상단 `< W주 NOW >` 네비게이터 / 브랜드 콤보박스 (태그·중요도 숨김)

**테이블 뷰**
- 행 클릭 → 우측 drawer (480px): 제목·메타·태그·본문 전체, Slack 원본 링크·클립보드
- 본문 `\n` 분리 → 배경/현상/액션 별도 줄 표시
- 컬럼 정렬 asc↔desc (브랜드/중요도/작성자/등록일)
- 브랜드·작성자·태그·중요도 클릭 필터, reclick → 'all' 해제
- URL 쿼리스트링 필터 persist (view/from/to/brand/tags/priority/author/q)
- 행 hover 시 태스크(`ListTodo`) / 프로젝트(`CalendarRange`) 연동 생성 버튼
- 제목: 우선순위별 색상 강조(`PRIORITY_TITLE_CLASS`) + 검색어 amber `<mark>` (`Highlight`)
- 본문: 검색어 amber `<mark>` 하이라이팅 (`Highlight`)

**인사이트 탭 (AI)**
- `POST /api/insights/generate` SSE → Claude Haiku (`claude-haiku-4-5-20251001`) → `insights` upsert
- 증분 분석: `created_at > analyzed_at` 신규 항목만 전달 (비용 절감)
- brand 필드 = client_id(UUID) 저장 (이름 변경에 강건)
- 헤드라인 / 액션아이템(urgent·watch·info) / 일정 / 미결 / 결정 카드
- 프로그레스 바: SSE 이벤트 직접 구동, AI 단계 CSS transition 18s

**수집** — Make.com 취소 확정. Claude Code MCP로 수동 수집·INSERT (waldlust-product.slack.com)

### Calendar 페이지 (`/calendar`)

**주간 타임그리드 + Google Calendar 연동**
- 레이아웃: 좌측 배치 대기열 사이드바(w-64) + 우측 7일 주간 그리드
- 주간 이동: 이전/다음 주 이동, 주 범위 헤더 (`5월 11일 - 17일 2026 · W20`), 오늘 날짜 강조
- ALL-DAY 행: 종일 이벤트 있을 때만 표시
- 타임그리드: 07~23시 30분 점선, 현재 시각 표시선, 15분 스냅 드래그앤드롭

**시간 블로킹 (Time Blocking)**
- `gantt_tasks.scheduled_at` + `duration_minutes` 컬럼으로 DB 저장
- `TaskPanel` (좌측 사이드바): 미배치 태스크 목록 + 검색 + 마감일/우선순위/생성일 정렬
- `TaskBlock`: 그리드 내 이동(중앙 드래그) + 리사이즈(하단 핸들) + 스케줄 해제(×)
- `EventBlock`: Google Calendar 이벤트 읽기 전용 표시 (colorId → hex)
- `source: 'panel' | 'grid'` dataTransfer 구분으로 이동 시 duration 보존

**Google Calendar 연동**
- OAuth 콜백: `/api/calendar/auth` → `/api/calendar/callback`
- 이벤트 조회: `/api/calendar/events` (주간 범위, maxResults 200)
- 에러 코드: `NO_PROVIDER_TOKEN` / `TOKEN_EXPIRED` / `API_DISABLED` 구분 안내

### Weekly 페이지 (`/weekly`)

**Outline 문서 연동 주간보고 (MVP)**
- Outline REST API (`POST /api/documents.info`)로 Biz Lead 분기 문서 조회
- `## YYYY.MM.DD` 형식 섹션 파싱 → 최신순 정렬, 5분 캐시 (`next: { revalidate: 300 }`)
- 사이드바(240px): 주 목록 최신순, "NEW" 배지, 주 레이블 (`M월 N주 (M/D~)`)
- 본문: `react-markdown` + `remark-gfm` + `rehype-raw` 렌더
  - `fixMultilineTableCells`: Outline 멀티라인 셀 GFM 파싱 보정 (continuation → `<br>` 병합)
  - `==text==` → `**text**` 변환

**AI 요약**
- `POST /api/weekly/ai-summary` SSE → Claude Haiku (`claude-haiku-4-5-20251001`)
- 팀별 한국어 요약, 스트리밍 출력
- 접을 수 있는 패널, "요약하기" 버튼 클릭 시 생성, Refresh 재생성

### Notes 페이지 (`/notes`)

- File System Access API로 로컬 Obsidian vault 연결 (Chrome/Edge 전용)
- `use-vault-handle.ts`: IndexedDB에 `FileSystemDirectoryHandle` 영속 저장
- 경로 패턴 localStorage 저장 (기본값 `Daily Notes/YYYY-MM-DD`)
- 뷰(ReactMarkdown) ↔ 편집(textarea) 전환, Ctrl+S 저장

### 보드 공유 (`/share/[token]`)
- `ShareDialog`에서 토큰 생성 → 비인증 접근 (`proxy.ts`에서 `/share/*` 가드 제외)
- 서버 컴포넌트 → `get_shared_board` RPC → `ShareView` 읽기 전용 간트

---

## 디자인 시스템

### 팔레트 토큰 (`globals.css @theme`)
| 그룹 | 토큰 |
|------|------|
| Neutral | `ink-50` ~ `ink-900` |
| Primary accent | `lilac-100` ~ `lilac-600` |
| Status | `status-late`(#E5484D) / `status-warn`(#F2A33C) / `status-soon` / `status-future` / `status-ok` |
| Coral | `coral-100` ~ `coral-500` |
| Mint | `mint-100` / `mint-300` / `mint-500` |
| Identifier | `id-{indigo,amber,orange,violet,green,blue,pink,teal,purple}` |
| Cat picker | `cat-{8종}` (vivid) / `cat-{8종}-light` (pastel) |
| Summary 태그 | `tag-{issue,decision,mention,in_progress,done,schedule}-{text,dot,bg}` |

### 태스크 상태 CSS 변수 (`:root`)
| 변수 | 값 |
|------|----|
| `--task-status-backlog` | `var(--color-ink-300)` |
| `--task-status-todo` | `var(--color-lilac-500)` |
| `--task-status-in-progress` | `var(--color-status-warn)` |
| `--task-status-done` | `var(--color-mint-500)` |
| `--task-status-pending` | `var(--color-lilac-300)` |
| `--task-status-*-bg` | `color-mix(in srgb, ... 12%, transparent)` |

### 시맨틱 토큰 (shadcn 브릿지)
- `bg-background` / `bg-card` — 흰 배경
- `bg-muted` — 헤더·사이드바 약한 회색
- `text-foreground` / `text-muted-foreground` / `border-border`
- `bg-accent` / `text-accent-foreground` — lilac 틴트 hover/selected

### 폰트 (Noto Sans KR)
- 앱 전체: Noto Sans KR (400/500/700), `lang="ko"`
- `font-mono`: Notes 편집기·코드블록에만 유지

### 폰트 크기 4단계
| 용도 | 크기 |
|------|------|
| 본문·행 제목 | `text-xs` (12px) |
| 보조·날짜·상태 | `text-[11px]` |
| 메타·헤더·배지 | `text-[10px]` |
| 라벨 칩·+N | `text-[9px] leading-none px-1 py-[3px] rounded font-medium` |

### 우선순위 폰트 강조 (전 뷰)
| 레벨 | 클래스 |
|------|--------|
| 0 (없음) | `font-normal text-ink-400` |
| 1 (낮음) | `font-normal text-muted-foreground` |
| 2 (보통) | `font-medium text-foreground` |
| 3 (높음) | `font-semibold text-rose-500` |

### 사이드바 필터 버튼
- `.sidebar-btn`: `border-l-2 transparent` 기본
- `.sidebar-btn-active`: `border-left-color: var(--color-ink-700)` + `bg-card font-medium`
- 적용: Tasks / Weekly / BoardSidebar

### 지연 배지 (전 뷰)
- 마감 지연: `bg-status-late/10 text-status-late border border-status-late/15`
- 시작 지연: `bg-status-warn/10 text-status-warn border border-status-warn/15`
- 무응답(7일+): `bg-coral-100 text-coral-500 border border-coral-100`

### 버튼 톤
- 주요: `bg-foreground text-background hover:bg-ink-800`
- 인라인 "+ 추가": `text-ink-400 hover:text-foreground`
- sub+ 버튼: `border-dashed border-ink-300 hover:border-ink-400 hover:bg-muted`

### Helper 유틸 (`tasks/_utils.ts`)
- 날짜: `fmtDate`, `fmtRange`, `daysDiff`, `overdueDays`, `isOverdue`, `isDueThisWeek`, `isDueNextWeek`
- 시작 지연: `isStartDelayed`, `startDelayedDays`
- 톤: `isLightColor` (sRGB 휘도 > 170 → light)
- 툴팁: `clampTooltipPos` (화면 하단 > 50% → bottom 앵커)

---

## 파일 구조

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx              # AppNav + ScrollToTopButton 공유 레이아웃
│   │   ├── page.tsx                # Projects (간트 메인)
│   │   ├── tasks/
│   │   │   ├── page.tsx
│   │   │   ├── _constants.tsx      # STATUS_GROUPS, ASSIGNEE_COLORS, PRIORITY_META, PriorityBars
│   │   │   ├── _utils.ts
│   │   │   └── _components/
│   │   │       ├── TaskRow.tsx
│   │   │       ├── TaskDetailDrawer.tsx
│   │   │       ├── TaskHistorySection.tsx  # TaskDetailDrawer + TaskFormDialog 공용
│   │   │       ├── ListView.tsx
│   │   │       ├── KanbanView.tsx
│   │   │       ├── GanttView.tsx
│   │   │       └── CalendarView.tsx
│   │   ├── calendar/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── calendar-shell.tsx      # 주간 캘린더 오케스트레이터
│   │   │       ├── time-grid.tsx           # 07~23시 7일 그리드
│   │   │       ├── task-panel.tsx          # 배치 대기열 사이드바
│   │   │       ├── task-block.tsx          # 블로킹된 태스크 블록
│   │   │       └── event-block.tsx         # Google Calendar 이벤트 블록
│   │   ├── weekly/
│   │   │   ├── page.tsx
│   │   │   ├── _lib/
│   │   │   │   └── types.ts               # WeekSection, WeeklyDoc
│   │   │   └── _components/
│   │   │       ├── weekly-shell.tsx        # 오케스트레이터 (fetch + 사이드바/콘텐츠 조합)
│   │   │       ├── weekly-sidebar.tsx      # 주 목록 (NEW 배지, 주 레이블)
│   │   │       ├── weekly-content.tsx      # 마크다운 렌더 (GFM 테이블 보정)
│   │   │       └── weekly-ai-summary.tsx   # Claude Haiku SSE 요약 패널
│   │   ├── summary/
│   │   │   ├── page.tsx
│   │   │   ├── _components/
│   │   │   │   ├── history-shell.tsx       # 오케스트레이터 (뷰/필터 상태, 연동 다이얼로그)
│   │   │   │   ├── history-sidebar.tsx     # 기간/브랜드/태그/중요도/주 네비게이터
│   │   │   │   ├── table-view.tsx          # 테이블 뷰 (우선순위별 타이틀 색상, 검색어 Highlight)
│   │   │   │   ├── timeline-view.tsx
│   │   │   │   ├── summary-view.tsx        # 브랜드별 요약 뷰
│   │   │   │   ├── insight-view.tsx        # AI 인사이트 뷰
│   │   │   │   ├── detail-drawer.tsx       # 항목 상세 drawer
│   │   │   │   └── badges.tsx              # PriorityBars, BrandBadge 등
│   │   │   └── _lib/
│   │   │       ├── types.ts
│   │   │       ├── mock-data.ts            # TAG_META, PRIORITY_META, fmtMonthDay
│   │   │       └── history-service.ts
│   │   ├── notes/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── VaultSetup.tsx
│   │   │       └── DailyNoteView.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── _components/
│   │           └── settings-shell.tsx      # 5섹션 (계정/연동/화면/키워드/데이터)
│   ├── api/
│   │   ├── insights/generate/route.ts      # SSE 스트리밍 인사이트 분석 API
│   │   ├── weekly/
│   │   │   ├── route.ts                    # Outline 문서 파싱 + 5분 캐시
│   │   │   └── ai-summary/route.ts         # Claude Haiku SSE 주간보고 요약
│   │   ├── calendar/
│   │   │   ├── events/route.ts             # Google Calendar 이벤트 조회 (주간 범위)
│   │   │   ├── auth/route.ts               # Google OAuth 시작
│   │   │   └── callback/route.ts           # Google OAuth 콜백
│   │   └── history/[id]/route.ts           # 히스토리 항목 조회/수정
│   ├── share/[token]/
│   │   ├── page.tsx
│   │   └── ShareView.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── login/page.tsx
├── components/
│   ├── AppNav.tsx
│   ├── ScrollToTopButton.tsx               # data-scrolltop 컨테이너 감지 플로팅 Top 버튼
│   ├── AutocompleteInput.tsx               # 공용 자동완성 (TaskDetailDrawer·ProjectFormDialog)
│   ├── gantt/
│   │   ├── GanttChart.tsx                  # ~840줄
│   │   ├── _GanttRows.tsx                  # GanttCategoryLeft/Right, SortableRow 등 (402줄)
│   │   ├── GanttToolbar.tsx
│   │   ├── BoardSidebar.tsx
│   │   ├── ProjectFormDialog.tsx           # 정보/메모/이력 3탭
│   │   ├── TrashPanel.tsx
│   │   └── ShareDialog.tsx
│   ├── tasks/
│   │   ├── TaskFormDialog.tsx              # 정보/메모/이력 3탭
│   │   └── TaskTrashPanel.tsx
│   └── ui/
│       └── drawer.tsx                      # Drawer/DrawerHeader/DrawerBody/DrawerFooter 공통
├── hooks/
│   ├── use-confirm.tsx
│   ├── use-undo-redo.ts
│   └── use-vault-handle.ts                 # IndexedDB FileSystemDirectoryHandle 영속 관리
├── lib/
│   ├── gantt-service.ts                    # CRUD + bulkSoftDelete/bulkUpdateStatus/duplicateTask
│   ├── gantt-utils.ts                      # toDate, toDateStr, isLightColor 등
│   ├── daily-note.ts                       # 경로 패턴 + readNote/writeNote
│   ├── insight-service.ts                  # getInsight / generateInsight SSE 클라이언트
│   ├── history-service.ts                  # client_history CRUD (클라이언트)
│   ├── history-service-server.ts           # 서버 전용 (keywords 등)
│   └── supabase/
├── types/
│   ├── index.ts
│   └── file-system-access.d.ts             # FileSystemHandle.queryPermission 등 타입
└── proxy.ts
```

---

## 주요 상수

```ts
// GanttChart
COL_WIDTH       = 72   // 월 뷰
WEEK_COL_WIDTH  = 36   // 주 뷰
DAY_COL_WIDTH   = 28   // 일 뷰
LEFT_WIDTH      = 260
HEADER_H        = 80   // 연도 34 + 월 28 + today 18
CAT_ROW_H       = 32
PROJ_ROW_H      = 36

// GanttView (태스크 간트)
LEFT_W_DEFAULT  = 300
LEFT_W_MIN      = 120
LEFT_W_MAX      = 560
```

---

## 최근 변경 (2026-05-17) — Settings 브랜드 관리 섹션 추가

### 신규 파일: `settings/_components/brand-drawer.tsx`
- `Drawer/DrawerHeader/DrawerBody/DrawerFooter` 사용
- 필드: 이름(KR) / 이름(EN) / 색상(BRAND_COLORS 16색 그리드) / 키워드(Enter·쉼표 입력) / Slack 채널(준비 중)
- 새 브랜드: INSERT + sort_order max+10 자동 계산
- 삭제: client_history 건수 조회 후 확인 단계 표시 → DELETE
- open 변경 시 useEffect로 폼 상태 리셋 (CSS transition drawer 재오픈 대응)

### 수정: `settings-shell.tsx`
- Section 타입에 `'brands'` 추가, NAV에 "브랜드" 항목 (Layers 아이콘, keywords 앞)
- `brands` 상태 (clients prop 초기값), `drawerTarget`, `drawerOpen` 추가
- `handleSaveBrand` / `handleDeleteBrand` — 낙관적 상태 업데이트
- 브랜드 섹션: 2열 카드 그리드 + "+ 브랜드 추가" 버튼
- BrandDrawer 항상 마운트 (fixed 포지셔닝, 섹션 전환에도 Drawer 애니메이션 유지)

---

## 최근 변경 (2026-05-17) — Settings Weekly 연동 섹션 추가

### `weekly_sources` 테이블 (Supabase — 이미 존재 확인)
- 스키마: `id UUID PK / workspace_id FK / label TEXT / collection_id TEXT / sort_order INT / created_at`
- RLS: `workspace_members` 기준 ALL 정책 (다른 테이블과 동일 패턴)

### Settings UI (`settings-shell.tsx`, `settings/page.tsx`)
- `Section` 타입에 `'weekly'` 추가, NAV에 "Weekly 연동" 항목 (BookOpen 아이콘)
- `SettingsShell` props에 `initialWeeklySources`, `workspaceId` 추가
- `settings/page.tsx` — `weekly_sources` 조회 + `workspace_members`에서 `workspace_id` fetch 병렬화
- Weekly 연동 섹션 UI:
  - 팀 목록: label + collection_id(mono) + ▲▼ 순서변경 + 삭제
  - 팀 추가: label 입력 + collection_id 입력 + 추가 버튼 (Enter 지원)
  - 낙관적 업데이트 + 실패 시 롤백 + toast 피드백
  - sort_order: 이동 시 인접 두 행만 업데이트 (index × 10)

---

## 최근 변경 (2026-05-17) — Settings 토큰 수정 + Keywords 중복 정리

### 수정 내용 (`settings-shell.tsx`, `keywords-client.tsx`)

- **토큰 오류 수정**: `text-status-done` → `text-mint-500` (존재하지 않는 토큰, 연동 연결 상태 아이콘)
- **토큰 오류 수정**: `border-ink-150` → `border-ink-100` (`keywords-client.tsx` 헤더 하단 구분선)
- **Keywords 중복 구현 정리**:
  - `KeywordsInline` (settings-shell 내부) 품질을 `KeywordsClient` 수준으로 업그레이드
    - `await import()` 동적 import → 정적 import로 교체
    - `pending` 상태 추가 (저장 중… 표시)
    - API 실패 시 에러 toast + 이전 상태 롤백 추가
    - aria-label, 버튼 스타일 통일
  - `/settings/keywords` 라우트(`keywords/page.tsx`, `keywords-client.tsx`) 삭제 — AppNav·settings-shell 어디에서도 진입 경로 없는 데드 코드였음

---

## 최근 변경 (2026-05-17) — Weekly Phase 2: 팀별 다중 문서 연동

### API
- `api/weekly/teams/route.ts` (신규): `weekly_sources` 목록 반환 (GET)
- `api/weekly/route.ts` 전면 재작성
  - `?team=id` 파라미터로 팀 선택
  - `weekly_sources`에서 `collection_id` 조회 (Supabase server client)
  - Outline `POST /api/documents.list` → 컬렉션 내 전체 문서 목록 조회
  - 각 문서 병렬 fetch (`Promise.all`) → `## YYYY.MM.DD` 파싱
  - 전체 주차 병합 + isoDate 중복 제거 + 날짜 내림차순 반환
  - 기존 하드코딩 `DOC_ID` 제거

### 컴포넌트
- `_lib/types.ts`: `WeeklyTeam` 타입 추가
- `weekly-shell.tsx`: `teams`·`selectedTeam` 상태 추가, mount 시 `/api/weekly/teams` fetch, 팀 없을 때 empty state + 설정 링크
- `weekly-sidebar.tsx`: 팀 2개 이상일 때 상단에 팀 선택 탭 추가 (1개면 숨김), Props 확장

### 동작 방식
- 분기 문서가 컬렉션에 추가돼도 코드 수정 없이 자동 탐색 (collection 기반)
- Settings의 `weekly_sources` CRUD와 연동: 팀 추가·삭제 즉시 반영

---

## 최근 변경 (2026-05-17) — Weekly 마크다운 렌더링 버그 수정

### `fixMultilineTableCells` 2건 수정 (`weekly-content.tsx`)

- **버그 1 — 빈 줄로 인한 병합 중단**: 테이블 셀 내 번호 목록 항목 사이에 빈 줄이 있으면 while 조건 `trim() !== ''`에서 병합이 중단되어 이후 항목이 테이블 밖으로 탈출, 별도 목록으로 렌더링되던 문제 수정
  - 빈 줄을 만났을 때 다음 non-blank 줄을 look-ahead: `|`로 시작하지 않으면 빈 줄을 건너뛰고 병합 계속
- **버그 2 — `*` 마커 리터럴 표시**: 병합된 셀 내 `<br>* 목적:` 형태가 되어 bullet이 아닌 `*`로 표시되던 문제 수정
  - continuation 줄이 `* ` 또는 `- ` 로 시작하면 `• ` (bullet 문자)로 변환

---

## 최근 변경 (2026-05-17) — 태스크 드로어 UX 개선 4건

### 1. 메모 아이콘 클릭 → 드로어 메모 탭 직행
- `TaskRow`에 `onEditMemo?: (t) => void` prop 추가
- 메모가 있는 행에서 StickyNote 아이콘 클릭 시 `onEditMemo` 호출
- `page.tsx`에 `editMemoHandler` 추가 (`drawerInitialTab = 'memo'`로 설정) → TaskDetailDrawer가 메모 탭으로 바로 열림
- `DraggableTaskRow`에도 `onEditMemo` prop 추가 (`...props`로 전달)

### 2. 생성일/수정일 → 이력 탭으로 이동
- `TaskDetailDrawer` info 탭 하단의 생성일/수정일 메타 정보를 이력 탭 하단으로 이동
- 이력 내역(TaskHistorySection) 아래 `px-5 py-3 border-t` 영역에 표시

### 3. 상위 태스크 명칭 표시
- `TaskDetailDrawer`에 `parentTask?: GanttTask | null` prop 추가
- info 탭 하단 "· 상위 태스크의 하위 항목" 텍스트 → "상위 태스크" 레이블 + 실제 부모 제목 표시
- `page.tsx`에서 `tasks.find(t => t.id === drawerTask.parent_id)` 전달

### 4. TaskFormDialog 하위 태스크 추가 시 부모 태스크 명시
- `TaskFormDialog`에 `parentTask?: GanttTask | null` prop 추가
- info 탭 연결 프로젝트 하단에 "상위 태스크" 레이블 + 제목 표시
- `page.tsx`에서 `pendingParentId`로 부모 태스크 찾아 전달

### 부수 리팩토링
- `TaskDetailDrawer`에 `initialTab?: DrawerTab` prop 추가 (open 시 해당 탭으로 진입)
- `TaskHistorySection` 공통 컴포넌트 재활용 (TaskDetailDrawer + TaskFormDialog)

---

## 최근 변경 (2026-05-17) — TaskFormDialog 탭 구조 추가

### TaskFormDialog에 정보 / 메모 / 이력 탭 추가 (ProjectFormDialog와 동일 패턴)

- `TaskHistorySection` 컴포넌트를 `TaskDetailDrawer.tsx` 로컬 정의에서 `_components/TaskHistorySection.tsx`로 분리 → `TaskDetailDrawer`와 `TaskFormDialog` 양쪽에서 재사용
- `TaskFormDialog.tsx` 구조 변경
  - `tab` state (`'info' | 'memo' | 'history'`) 추가
  - `initialTab?: FormTab` prop 추가 (기본 `'info'`)
  - DrawerHeader에 탭 UI 추가 (`ProjectFormDialog`와 동일한 lilac-600 스타일)
  - 메모 필드를 info 탭 인라인에서 **메모 탭** 전체 textarea로 이동 (`initialMemo` prop 동작 유지)
  - **이력 탭**: `editTask` 있을 때만 탭 표시, `TaskHistorySection` 렌더링
  - 메모 탭 진입 시 textarea 자동 포커스

---

## 최근 변경 (2026-05-17) — 공통 Drawer 컴포넌트 도입

### 드로어 6곳 공통 컴포넌트로 통일

- **신규 파일** `src/components/ui/drawer.tsx` — `Drawer` / `DrawerHeader` / `DrawerBody` / `DrawerFooter` 4개 컴포넌트
  - `Drawer`: fixed inset-0 z-50 + bg-black/20 backdrop + 슬라이드 애니메이션 (duration-300 ease-out) 공통화
  - 너비(`width`), backdrop 표시(`backdrop`), backdrop 클릭 닫기(`closeOnBackdrop`), 패널 추가 클래스(`panelClass`) prop 지원
  - `DrawerHeader`: `shrink-0 border-b` 래퍼 — 내부 레이아웃은 각 컴포넌트가 직접 정의
  - `DrawerBody`: `flex-1 overflow-y-auto` + `className` prop으로 padding/gap 주입
  - `DrawerFooter`: `shrink-0 px-5 py-3 border-t flex justify-end gap-2` 공통 레이아웃
- **헤더 패딩 통일** — 기존 `px-5 pt-4 pb-2` / `px-5 py-4` 혼재 → 전부 `h-12 flex items-center px-5` (Summary 방식)로 통일
- **교체된 파일 6곳**
  - `TaskDetailDrawer.tsx` (480px, 탭 포함)
  - `summary/detail-drawer.tsx` (480px, closeOnBackdrop prop 활용)
  - `ProjectFormDialog.tsx` (440px, 탭 포함)
  - `TaskFormDialog.tsx` (440px)
  - `TaskTrashPanel.tsx` (320px, `backdrop=false panelClass="border-l shadow-xl"`)
  - `TrashPanel.tsx` (320px, 동일)
- TrashPanel 2종: `if(!open) return null` 패턴 제거 → Drawer가 자체적으로 pointer-events-none + translate로 닫힘 처리. 슬라이드 애니메이션 추가됨
- tsc --noEmit 에러 0건, vitest 6/6 통과

---

## 최근 변경 (2026-05-17) — Summary 버그 픽스

### Summary 페이지 소버그 4건 수정

- **작성자 FilterChip 누락 수정** (`history-shell.tsx`): `authorKey !== 'all'`일 때 FilterChip이 없어 작성자 필터 적용 후 칩이 표시되지 않고 해제도 불가했던 문제 수정
- **작성자 FilterChip 중복 렌더 수정** (`history-shell.tsx`): 위 수정 시 기존 블록을 제거하지 않아 칩이 2개 동시에 표시되던 버그 수정 (403~411줄 중복 제거)
- **테이블 뷰 폰트 컨벤션 수정** (`table-view.tsx`): 행 제목 `text-sm`(14px) → `text-xs`(12px) — 프로젝트 폰트 규칙 준수
- **미사용 import 제거** (`history-shell.tsx`): `dateStr`, `isCurrentWeek` 미사용 import 제거
- **`timeline-view.tsx` 삭제**: VIEW_TABS에 timeline 뷰 없고 어디서도 import하지 않는 데드코드 파일 제거
- **BrandSelector useMemo 추가** (`history-shell.tsx`): `counts`, `sorted` 계산을 렌더마다 반복 실행하던 것을 `useMemo`로 메모이제이션
- **filteredActions 등 불필요 deps 제거** (`insight-view.tsx`): `filterByBrand`에서 사용하지 않는 `clients`가 4개 useMemo 의존성 배열에 포함되어 불필요한 재계산을 유발하던 것 제거
- **인사이트 에러 재시도 버튼 추가** (`insight-view.tsx`): 분석 실패 시 에러 텍스트만 표시되던 것을 인라인 "다시 시도" 버튼으로 개선

---

## 최근 변경 (2026-05-17)

### Tasks 페이지 기능 버그 수정 (6건)

- **퀵 추가 이중 생성 방지**: `quickAddTitle`이 상태 그룹 퀵 추가(`quickAddStatus`)와 하위 태스크 퀵 추가(`quickAddParentId`)에 공유되어 동시 활성 시 두 태스크가 동시 생성되던 문제 수정 — 각 퀵 추가 진입 시 반대쪽 상태를 `null`로 초기화
- **고아 하위 태스크 유령화 방지**: 부모만 선택 삭제 시 `parent_id`가 남은 하위 태스크가 `!t.parent_id` 필터에 걸려 보이지 않던 문제 수정 — `taskIdSet`으로 실제 부모 존재 여부 판별, 없으면 최상위 취급 (normal view / KanbanView / `computeColumnOrder` 동일 적용)
- **ListView `start_date` 정렬 null 처리 불일치**: null이 맨 앞에 오던 문제 수정 — `due_date`와 동일한 null-last 로직으로 통합
- **뷰 전환 시 선택 모드 미해제**: kanban/gantt/calendar로 전환 시 floating 액션 바가 남는 문제 수정 — 미지원 뷰 전환 시 `exitSelectionMode()` 호출
- **다이얼로그 상태 색상 하드코딩**: `TaskFormDialog`, `TaskDetailDrawer` 상태 점이 hex로 하드코딩되어 CSS 변수 테마와 불일치하던 문제 수정 — `STATUS_COLOR` 토큰으로 교체
- **CalendarView `onStatusChange` 미사용 prop 제거**: Props 및 호출부에서 제거

### 간트 주 뷰 — 일요일 today 스크롤 버그 수정

- **원인**: `findIndex`에서 주의 마지막 날 판별을 `weekStart + 6일 이하(≤)`로 했는데, 비교 대상 `e`가 일요일 `00:00`(자정)이라 일요일 어느 시간에도 `now > e` → `idx = -1` → `scrollX = 0` → 2025년 1월 시작으로 포커스
- **수정**: `+6일 ≤` → `+7일 <` (다음 월요일 exclusive)로 변경 → 일요일 전 시간대 정상 동작
- 동일 패턴이 `todayX` 계산(오늘 표시선)에도 있어 함께 수정

### Summary 테이블 뷰 타이틀 스타일 개선

- **HighlightAll 제거**: 브랜드명 컬러 볼드 하이라이트 삭제, 검색어 `<mark>` 하이라이팅(`Highlight`)만 유지
- **우선순위별 타이틀 색상 적용**: `PRIORITY_TITLE_CLASS` 맵 추가
  - `high` → `font-semibold text-rose-500`
  - `medium` → `font-medium text-foreground`
  - `low` / 없음 → `font-normal text-muted-foreground`

### 데이터 일관성 버그 수정 (P1×3)

- **addTask**: `gantt_task_projects` insert 에러 무시 → `throw` 처리
- **updateTask**: 연결 delete/insert 에러 무시 → `throw` 처리 (연결 유실 방지)
- **softDeleteTask**: 부모 삭제 시 자식(`parent_id = id`) 동시 soft delete
- **restoreTask**: 부모 복구 시 자식도 같이 복구
- **addProject 시그니처 + 호출부**: `memo` 필드 추가 (생성 시 메모 누락 버그 수정)

### Calendar 드롭존 개선

- `time-grid.tsx` 드래그 이벤트를 최외곽 div로 이동 (중첩 스크롤 문제 해소)
- `dragOver` 상태 시 배경 `bg-lilac-100/30` + "여기에 놓으면 블록 생성" 힌트
- `handleDragLeave`: 자식 요소 이동 시 flicker 방지

### Calendar 페이지 신규 (`/calendar`)

**Time Blocking 기능**
- AppNav에 `CalendarDays` 아이콘 + `/calendar` 항목 추가
- `gantt_tasks`: `scheduled_at TIMESTAMPTZ`, `duration_minutes SMALLINT DEFAULT 60` 컬럼 추가
  - `idx_gantt_tasks_scheduled_at` 인덱스 (workspace_id + scheduled_at, WHERE NOT NULL)
- `GanttTask` 타입에 `scheduled_at`, `duration_minutes` 필드 추가
- `CalendarEvent` 타입 신규 (`src/types/index.ts`)
- `gantt-service.ts`: `getScheduledTasks`, `updateTaskSchedule` 함수 추가
- `/api/calendar/events` 라우트: `provider_token`으로 Google Calendar API 호출, 날짜별 이벤트 반환
  - `NO_PROVIDER_TOKEN` / `TOKEN_EXPIRED` 에러 코드 구분
- `CalendarShell`: 날짜 네비게이터 + 종일 이벤트 바 + 캘린더 오류 안내
- `TimeGrid`: 07~23시 그리드, 30분 점선, 현재 시각 표시, 드래그앤드롭 드롭 타겟
- `TaskBlock`: 블록 이동(중앙 드래그) + 리사이즈(하단 핸들) + 스케줄 해제(×), 15분 스냅
- `EventBlock`: Google Calendar 이벤트 읽기 전용 표시 (colorId → hex)
- `TaskPanel`: 미배치 태스크 목록 (검색 + 드래그 소스), 상태 dot 표시

**Google OAuth 스코프**
- Supabase Google Provider에 `https://www.googleapis.com/auth/calendar.readonly` 추가 필요 (대시보드 수동)

---

## 최근 변경 (2026-05-16)

### 디자인 시스템 & 공통 기반

**폰트: Geist → Noto Sans KR**
- `layout.tsx`: `Noto_Sans_KR` (400/500/700), `lang="ko"`
- `globals.css`: `--font-sans/heading` → `var(--font-noto-sans-kr)`, `--font-mono` → `ui-monospace`

**전체 폰트 크기 정규화 (20개 파일)**
- `text-sm`/`text-base`/`text-[13~15px]` → `text-xs`, `text-[11.5px]` → `text-[11px]`, `text-[10.5px]` → `text-[10px]`
- `font-mono` 전체 제거 (Notes 편집기·코드블록·`/login`·`/share` 제외)

**하드코딩 색상 → CSS 변수 (대규모)**
- `globals.css :root`: `--task-status-*`, `--task-status-*-bg` 추가
- `globals.css @theme`: `--color-id-*` (식별자 팔레트), `--color-cat-*` (카테고리 컬러피커) 추가
- `_constants.tsx`: STATUS_GROUPS / STATUS_COLOR / STATUS_BG_COLOR / PRIORITY_META / PROJECT_COLORS / ASSIGNEE_COLORS 모두 CSS var
- `KanbanView`, `CalendarView`, `TaskTrashPanel`, `GanttChart`, `TaskRow`, `ListView` 일괄 교체

**`.sidebar-btn` / `.sidebar-btn-active` 글로벌 유틸리티**
- 기본: `border-l-2 transparent` / 활성: `border-left-color: var(--color-ink-700)` + `bg-card font-medium`
- Tasks / Weekly / BoardSidebar 적용

**shadcn Calendar 리디자인**
- 셀 28px → 24px, 날짜 폰트 12px → 11px, 요일 헤더 10px
- 토요일 `text-blue-500`, 일요일 `text-red-500`, focused ring 제거
- 오늘(미선택) `bg-lilac-100/50`, 오늘+선택 `bg-lilac-500 text-white`

---

### 앱 공통 기능

**Notes 페이지 신규**
- `use-vault-handle.ts`: IndexedDB `FileSystemDirectoryHandle` 영속 (`VaultStatus` 4종)
- `daily-note.ts`: 경로 패턴 localStorage, `readNote`/`writeNote` (폴더 자동 생성)
- `VaultSetup.tsx`: 연결 전·권한 만료 안내
- `DailyNoteView.tsx`: 뷰(ReactMarkdown+remarkGfm) ↔ 편집(textarea), Ctrl+S
- `types/file-system-access.d.ts`: `FileSystemHandle.queryPermission/requestPermission`, `Window.showDirectoryPicker` 타입

**스크롤 Top 플로팅 버튼**
- `ScrollToTopButton.tsx`: `data-scrolltop` 컨테이너 캡처 리스너, `scrollTop > 300px` 페이드인
- `(app)/layout.tsx` 전역 삽입
- `data-scrolltop` 마킹: `tasks/page.tsx` / `ListView.tsx` / `history-shell.tsx`

**Vitest 테스트 인프라 + Lint 정리**
- vitest + @vitejs/plugin-react + jsdom + @testing-library 설치
- `npm run check`: typecheck + lint + test 일괄
- 회귀 테스트: `_constants.test.tsx` — STATUS_COLOR/PROJECT_COLORS 등 모두 `var(--` 시작 강제
- Lint 50건 정리: unused vars, no-explicit-any, refs, exhaustive-deps, static-components 등

**데드코드 제거**
- `timeline/` 디렉터리, `StatusBadge.tsx`, `ProjectHistoryPanel.tsx`, `CategoryFormDialog.tsx` 삭제
- `tasks/_utils.ts` 미사용 4함수, `SummaryCard.tsx` 삭제
- `gantt-utils.ts` `STATUS_LABELS`/`STATUS_COLORS` 제거

**중복 제거 / 추출**
- `toDate`/`toDateStr` → `gantt-utils.ts` 단일화 (3곳 중복 해소)
- `AutocompleteInput` → `src/components/AutocompleteInput.tsx` 추출 (3곳 중복 해소)

**타이틀 정리 / Weekly 기초**
- GanttToolbar: "Schedule" 고정 타이틀 + 보드명 subtitle
- AppNav: "Tasks" 라벨, Notes 항목 추가
- Weekly: 사이드바(프리셋 4종 + DatePicker) + 메인 영역 플레이스홀더

---

### Tasks / 간트 / 칸반 / 캘린더

**CalendarView 전면 리디자인**
- 헤더: 텍스트 버튼 → Chevron 아이콘, "오늘" 버튼은 다른 달일 때만 노출
- 오늘 `bg-lilac-500` 원 강조, 일요일 `text-status-late/80`, 토요일 `text-lilac-400`
- 빈 셀 `bg-muted/20`, 마지막 행·열 border 제거
- 행 높이 자동 조정 (rows ≤ 5: 100px / rows > 5: 84px)
- `+N개 더` → viewport-flip floating popover

**칸반 내 순서 드래그 (`KanbanView.tsx`)**
- `useDraggable` → `useSortable`, 컬럼별 `SortableContext`
- `columnOrder` 상태로 드래그 중 실시간 피드백 (`handleDragOver`)
- 같은 컬럼 드롭 → `sort_order × 100` 단위 DB persist
- `latestColOrder` ref: stale closure 방지

**태스크 간트 바 날짜 드래그 (`GanttView.tsx`)**
- 바 구조: 좌측 핸들(resize start) + 중앙(move) + 우측 핸들(resize end)
- `localDates` 상태로 드래그 중 즉시 반영
- 3px 미만 이동 → 클릭으로 처리 (drawer 오픈 유지)
- 픽셀→일수: `Math.round(dx * 7 / WEEK_W)`

**GanttChart.tsx 분리**
- 1,262줄 → 840줄, `_GanttRows.tsx` (402줄) 신규
- 이동: `CAT_ROW_H`, `PROJ_ROW_H`, `STATUS_META`, `SortableProjRow`, `SortableCatRow`, `GanttCategoryLeft`, `GanttCategoryRight`

**Summary → Tasks/Schedule 연동 생성**
- `TaskFormDialog`: `initialTitle`, `initialMemo` prop
- `ProjectFormDialog`: `initialName`, `initialMemo` prop
- `table-view.tsx`: 행 hover 시 `ListTodo`/`CalendarRange` 아이콘 버튼 (opacity-0 → group-hover:opacity-100)
- `detail-drawer.tsx`: 헤더에 태스크/프로젝트 버튼

**기타**
- `searchProjects`: `ilike` 패턴에서 `%`, `_`, `\` 이스케이프
- Tasks "+ 태스크 추가" 인덴트: `px-4` → `pl-10 pr-4` (TaskRow 제목과 정렬)
- 중요도 컬럼 정렬 버튼 `flex items-center` 추가 (수직 정렬 통일)
- Projects 행 hover: `hover:text-lilac-600` → `hover:bg-muted` (Tasks 동일 패턴)

---

### Summary 테이블·사이드바

**태그 시스템 전환**
- DB: `client_history.type` deprecated → `tags TEXT[]` + GIN 인덱스
- 6종: `issue`/`decision`/`mention`/`in_progress`/`done`/`schedule`
- `TAG_META` hex → `var(--color-tag-*)` CSS 변수
- 작성자 prefix 표준화: `MMTH_김형종` → `[매머드] 김형종` 등

**페이지 리네이밍 `/history` → `/summary`**

**테이블뷰 UX 전면 개선 (`detail-drawer.tsx` 신규)**
- 행 클릭 → 480px 슬라이드 drawer, 어둠 backdrop, Esc 닫기
- 메타 그리드: 브랜드/중요도/작성자/채널/등록일(풀 타임스탬프), Slack 원본 링크·클립보드
- URL 쿼리스트링 필터 persist, 활성 필터 뱃지 행 `h-7` 고정 + `overflow-x-auto`
- 태그 클릭 → 다중 토글, reclick → 'all' 해제

**브랜드명 볼드 하이라이트 (`HighlightAll`)**
- 제목·본문에서 브랜드 `name`/`name_en`/keywords 탐색 → 브랜드 color `font-semibold`
- 검색어 amber `<mark>`와 중첩 (브랜드 구간 내에서도 검색어 마킹 유지)

**본문 개행 렌더링**
- `item.body.split('\n').filter(Boolean)` → 각 줄 `<div>` (배경/현상/액션 구분)
- `line-clamp-2` 제거

**레이아웃 재편**
- `flex flex-col overflow-hidden` 구조 (Tasks `ListView`와 동일)
- 헤더 `shrink-0`, 행 영역 `flex-1 overflow-y-auto [scrollbar-gutter:stable]`
- `TableView` 내부: 칼럼 헤더 `shrink-0` + 행 `flex-1 overflow-y-auto` + `data-scrolltop`

**버그 수정**
- 증분 분석 필터: `occurred_at > analyzed_at` → `created_at > analyzed_at`
  (MCP로 늦게 INSERT된 과거 날짜 메시지가 누락되던 문제)
- `UpcomingList`/`PendingList`: `border-divider` 미정의 → `border-border`
- `summary-view.tsx`: `#dc2626` → `var(--color-status-late)`, `#d97706` → `var(--color-status-warn)`
- `TAG_META[t]` 미정의 태그 → `return null` null 가드

**컨벤션 / 타입 정리**
- `globals.css`: `--color-tag-*-{text|dot|bg}` 6종, `--color-priority-*-bg` 3종 추가
- `badges.tsx`: `${color}1a` hex 알파 → `color-mix(in srgb, ${color} 10%, transparent)`
- `types.ts`: `HistoryItem.source_id: string | null` 추가

**코드 품질**
- `filterByBrand`: 모듈 수준 유틸 함수, clients 파라미터 제거 (직접 ID 비교)
- `ProgressBar` 컴포넌트 추출 (EmptyState·업데이트 중복 JSX 단일화)
- `counts`/`sortedClients`/`filteredX` 4개 `useMemo` 메모이제이션
- `ActionGrid`/`UpcomingList`/`PendingList`/`DecisionGrid`: `brandId` prop 제거, 이중 필터링 해소
- `history-sidebar.tsx`: `dateStrUtil` 제거, `BrandCombobox` 인사이트 탭에서 숨김

---

### Summary 인사이트 탭

**신규 구축**
- DB: `insights` 테이블 (UNIQUE `workspace_id, week_start`, RLS 활성화)
- `insight-service.ts`: `getInsight` / `generateInsight` (SSE 파싱, `onStatus` 콜백)
- `api/insights/generate/route.ts`: ReadableStream SSE
  - 단계: 슬랙 조회 → AI 분석 → 저장
  - 증분: `created_at > analyzed_at` 신규 항목만 Claude에 전달
  - `normalizeBrands`: Claude 응답 brand 이름 → client_id UUID 변환 (폴백: 원문 유지)
- `insight-view.tsx`: 헤드라인·액션아이템·일정·미결·결정 카드
  - SSE 이벤트가 프로그레스 바 직접 구동 (가짜 타이머 없음)
  - `slowPhase`: AI 단계 CSS transition 18s / 나머지 0.5s

**개선**
- HeadlineCard: "HEADLINE" 레이블(orange-500) + "AI 분석" 뱃지(Sparkles + lilac), 날짜 범위 표시
- ActionGrid 버튼: urgent→`status-late`, watch→`status-warn`, info→`status-future` 계열
- 브랜드 필터: 각 섹션 건수 필터 후 기준, 0건 섹션 완전 숨김
- 주 네비게이션: "이번 주/지난 주" 2버튼 → 최근 4주 목록 (주 레이블 + `MM/DD ~ MM/DD`)
- 주 번호 계산: `Math.ceil(date / 7)` → 월 1일 요일 기준 정확한 산출
- 인사이트 탭 사이드바: 태그·중요도 섹션 숨김 (`view !== 'insight'`)

**브랜드 이름 → client_id 저장 방식 전환**
- `route.ts`: Claude 응답 파싱 직후 `normalizeBrands`로 이름 → UUID (미매칭 시 원문 폴백)
- `insight-view.tsx`: `BrandBadge(clientId)`, `filterByBrand`(ID 직접 비교), `PendingList`/`counts` 모두 `c.id` 기준
- DB 마이그레이션 (Supabase MCP): 기존 JSONB brand 이름 → client_id 일괄 변환

---

## 결정 사항 / 보류

- **협업 배제**: 1인용 도구. 외부 공유는 읽기 전용 토큰 URL만.
- **모바일 미지원**: 간트 특성상 데스크탑 전용.
- **태스크 undo/redo**: 삭제는 토스트 "되돌리기"로 보완. 다른 액션은 명시적이라 미구현.
- **Summary 자동 수집 취소**: Make.com 연동 중단. Claude Code MCP 수동 수집으로 운영.
- **빌드 검증**: `npx tsc --noEmit` 타입 체크, `npm run check` 일괄 검증.

---

## 미구현 / 예정

- **주간보고 Phase 2** (`/weekly`): 각 팀 컬렉션 문서 연동 (현재 Biz Lead 문서만)
- **주간보고 UX 개선**: 구체적 요구사항·디자인 확정 후 수정 예정
- **설정** (`/settings`): 플레이스홀더만 있음
- **캘린더 퀵 등록**: 날짜 셀 클릭으로 해당 마감일 태스크 빠른 생성
- **태스크 parent 재지정**: 드로어에서 하위 → 다른 부모 이동 또는 최상위 승격 UI 없음

---

## Supabase 프로젝트

- Project ID: `eytonzxeogdfeuvxtuwh`
- Region: ap-northeast-2 (서울)
- Auth: 이메일/비밀번호, Google OAuth

## 최근 변경 (2026-05-17)

### Summary 페이지 UI 개선

**detail-drawer.tsx**
- "+ New Task" / "+ New Project" → "+ 태스크 추가" / "+ 프로젝트 추가" (한국어)
- 버튼 스타일: `border-dashed border-border text-ink-400 hover:text-foreground hover:border-ink-400` (dashed 아웃라인)
- `ListTodo`/`CalendarRange` 아이콘 → `Plus`, 버튼 배치 `flex-row` → `flex-col`

**history-shell.tsx**
- FilterChip 컨테이너: `h-7 pb-3` → `py-1.5` (클리핑 수정)
- FilterChip 스타일: `bg-card border-dashed` → `bg-foreground text-background` (선택 상태)

**table-view.tsx**
- 등록일 열: 레이블 `등록일` → `등록일시`, 너비 `w-14` → `w-28`
- 날짜 포맷: `M/D` → `M/d HH:mm` (시간 포함), `fmtMonthDay` 임포트 제거

**api/history/[id]/route.ts**
- 401/403 응답: plain text → JSON `{ error: '...' }` (저장 실패 구체적 메시지)
- `console.error` 로깅 추가

**proxy.ts (Next.js 16 미들웨어)**
- `/api` 경로 최상단 early return 추가 — PATCH 요청이 307로 리디렉트되던 버그 수정
- Next.js 16에서 `middleware.ts` 대신 `proxy.ts`가 미들웨어 파일임 확인

**detail-drawer.tsx (버튼 레이아웃)**
- 태스크 추가/프로젝트 추가 버튼: `flex-col` → `flex` (가로 병렬 배치)
- 스타일: `border-dashed border-border` → `bg-muted border-border hover:bg-card hover:border-ink-300`

---

### 2026-05-17 — Calendar 사이드바 아이템 레이아웃 재편 + 드로어 연결

**태스크 아이템 3영역 분리 (`task-panel.tsx`)**
- 레이아웃: `[GripVertical 핸들] [체크 원] [태스크명 + 날짜 + 배지]`
- 핸들: `cursor-grab`, stopPropagation 없음 → 이 영역에서만 드래그 시작
- 체크 원: `onMouseDown stopPropagation` → 드래그 차단, 클릭 시 done 토글
- 태스크명: `onMouseDown stopPropagation` + `onClick` → 드로어 열기
- done 상태: 핸들 `invisible` (공간 유지), 제목 취소선
- `onTaskClick` prop 추가

**TaskDetailDrawer 연결 (`calendar-shell.tsx`)**
- `drawerTask` state 추가
- 드로어 핸들러 5종 (save / delete / duplicate / addSubTask / statusChange)
- `TaskPanel.onTaskClick` + `TimeGrid.onTaskClick` 모두 `setDrawerTask` 연결
- `TaskDetailDrawer` 렌더링 (정보/메모/이력 3탭)

### 2026-05-17 — Calendar 겹침 레이아웃 + 체크 원 드래그 차단

**겹침 레이아웃 (나란히 표시 + 중복 배지)**
- `time-grid.tsx`: `calcLayout` 함수 추가 — 이벤트+태스크 합산, sweep 알고리즘으로 `colIndex` / `totalCols` 계산
- `DayColumn`: timedEvents + scheduledTasks 합산 레이아웃 계산 후 각 블록에 전달
- `task-block.tsx`: `colIndex` / `totalCols` prop으로 left/width 동적 계산 (퍼센트 기반)
  - `totalCols > 1`이고 `height >= 36`이면 "중복" 배지 표시 (`status-warn` 계열)
- `event-block.tsx`: 동일한 left/width 동적 계산 (배지 없음)

**체크 원 드래그 차단**
- `task-panel.tsx`: 체크 원 버튼에 `onMouseDown={e => e.stopPropagation()}` 추가
  - mousedown이 부모 draggable div에 전파되지 않아 드래그 시작 원천 차단

### 2026-05-17 — Calendar 사이드바 UX 개선 + 드래그 스냅 가이드라인

**`task-panel.tsx`**
- AI 제안 탭 완전 제거 (탭 컴포넌트 전체 삭제)
- 정렬 변경: `생성일` → `진행상황` (STATUS_ORDER 기준: in-progress → to-do → pending → backlog → done)
- 상태 dot(불릿) → 클릭 가능한 체크 원 버튼
  - done 아닌 상태: 빈 원 (상태 컬러 테두리)
  - done 상태: 채워진 원 + 흰색 체크 아이콘
  - 클릭: not done → done (직전 상태 `prevStatusMap`에 저장) / done → 직전 상태 복원
  - done 태스크: `opacity-50` + `line-through`, 드래그 비활성화
- 상태 배지: done 상태에서는 숨김 (중복 방지)
- `onStatusChange` prop 추가 → `calendar-shell.tsx`에서 `updateTask` 연결

**`calendar-shell.tsx`**
- `handleStatusChange` 추가: 낙관적 업데이트 + `updateTask` 호출

**`time-grid.tsx`**
- 드래그 중 스냅 위치 미리 표시 (가이드라인)
  - `snapMinutes` state: `dragOver` 중 매 `onDragOver`마다 스냅 위치 계산
  - lilac 점선 + 시간 레이블(`HH:mm`)으로 드롭 예상 위치 시각화
  - `dragLeave` / `drop` 시 가이드라인 제거

### 2026-05-17 — Calendar 사이드바 스타일 정합 + 토글

- **타이틀 변경**: `배치 대기열` → `CALENDAR` (Tasks 페이지 `TASKS` 와 동일한 uppercase 컨벤션)
- **사이드바 토글**: `panelOpen` 상태 추가 (기본 open), Tasks 페이지와 동일한 패턴
  - 사이드바 헤더: `PanelLeftClose` 버튼으로 닫기
  - 메인 툴바: 닫혔을 때 `PanelLeftOpen` 버튼 표시
  - `transition-all duration-200` width 슬라이드 애니메이션
- **아이콘 교체**: `SlidersHorizontal` → `PanelLeftClose` (`task-panel.tsx`)

### 2026-05-17 — Calendar 주간 뷰 재설계

**목표**: Claude 디자인 스크린샷 기준으로 캘린더 전면 재설계 (단일 날짜 뷰 → 주간 뷰 + 좌측 배치 대기열 사이드바)

**`api/calendar/events/route.ts`**
- `date` 단일 날짜 → `date` + `endDate` (주간 범위) 지원
- `maxResults` 50 → 200

**`calendar-shell.tsx`** (전면 재작성)
- 레이아웃: 좌측 `배치 대기열` 사이드바(w-72) + 우측 메인 캘린더
- 날짜 상태: `date: string` → `weekStart: string` (해당 주 월요일)
- 주간 이동: `goDay` → `goWeek(±7일)`
- 툴바: `5월 11일 - 17일 2026 · W20` 형식 주 범위 + Google Calendar 배지 + 필터 + 이벤트 추가
- 주간 컬럼 헤더: 요일/날짜/이벤트 시간 합계(Nh) 표시, 오늘 날짜 검정 원
- ALL-DAY 행: 종일 이벤트가 있을 때만 표시
- Tasks 오버레이 토글 제거

**`time-grid.tsx`** (전면 재작성)
- Props: `date: string` → `dates: string[]` (7일 배열)
- `DayColumn` 내부 컴포넌트 분리: 각 컬럼이 독립적으로 drag/drop 처리
- `source: 'panel' | 'grid'` dataTransfer 구분으로 이동 시 duration 보존
- 현재 시각 표시는 오늘 컬럼에만

**`task-panel.tsx`** (전면 재작성)
- 오버레이 → 고정 좌측 사이드바
- 탭: `태스크 N` / `AI 제안(빈 상태)`
- 정렬: 마감일 / 우선순위 / 생성일 (클릭으로 순환)
- 태스크 카드: 상태 도트 + 제목 + 마감일 + 상태 배지
- `source: 'panel'` 설정으로 그리드 drop과 구분

**`event-block.tsx` / `task-block.tsx`**
- `left-14` → `left-0` (각 컬럼 내부 포지셔닝으로 변경)
- `task-block.tsx`: 미사용 `gridRef` prop 제거

### 2026-05-17 — Calendar 버그 수정 및 스타일 정합성

**버그 수정**
- **타임존 버그**: `toDateStr`을 `toISOString()`(UTC) → 로컬 날짜 컴포넌트로 교체 → 한국(UTC+9)에서 주 시작일 하루 밀림 해결
- **주 시작 요일**: `weekStartsOn: 1`(월) → `weekStartsOn: 0`(일) — 일·월·화·수·목·금·토 순서
- **너비 문제**: CalendarShell 루트 및 TimeGrid 루트에 `w-full` 추가

**스타일 정합성 (Tasks 페이지 기준)**
- 사이드바: `bg-background` → `bg-muted`, 너비 w-72 → w-64
- 헤더·툴바: `h-11 bg-background` → `h-12 bg-card`
- 타이틀: `text-foreground` → `text-ink-400 uppercase tracking-wider`
- 탭: `bg-card rounded-lg p-0.5` 컨테이너 + active `bg-muted rounded-md`
- 주간 헤더·ALL-DAY 행: `bg-background` → `bg-card`

---

## 작업 현황 (2026-05-17 기준)

### 완료

| 영역 | 내용 |
|------|------|
| **공통 Drawer** | `src/components/ui/drawer.tsx` 생성, 앱 전체 6개 드로어 통일 |
| **Tasks 드로어 탭** | 정보 / 메모 / 이력 탭 추가 (ProjectFormDialog와 동일 패턴) |
| **Tasks UX 4건** | 메모 아이콘→드로어 메모탭, 생성일·수정일→이력탭, 상위 태스크 제목 표시, 신규 폼 부모 태스크 명시 |
| **Calendar 주간 뷰** | 단일 날짜 뷰 → 주간 뷰 (일~토 7컬럼), 배치 대기열 좌측 사이드바, 드래그&드롭 유지 |
| **Calendar 버그·스타일** | 타임존 날짜 밀림, 너비 미채움, 주 시작 요일(일), Tasks 페이지 스타일 정합 |
| **Settings 페이지** | 5개 섹션 구축 (계정/연동/화면/키워드/데이터), `next-themes` ThemeProvider 연결 |

### 미완료 / 예정

| 영역 | 내용 | 비고 |
|------|------|------|
| **Tasks 아카이브** | Done 태스크 자동 아카이브 — `archived_at` 컬럼 추가 + pg_cron 30일 자동 처리 + 기본 뷰 필터 적용 | `deleted_at`과 별도 운영, 아카이브 보기 탭 추가 예정 |
| **Settings** | Slack 채널→브랜드 매핑 DB 저장 | `clients` 테이블에 `channels` 컬럼 추가 필요 |
| **Settings** | 다크 모드 커스텀 토큰 대응 | `globals.css` `.dark {}` 블록에 ink/lilac/status 변수 추가 필요 |
| **Settings** | 데이터 내보내기 | 버튼 mockup만, 실제 구현 없음 |
| **Calendar** | `+ 이벤트 추가` 기능 | 버튼만 있고 동작 없음 |
| **Calendar** | `필터` 기능 | 버튼만 있고 동작 없음 |
| **Calendar** | `AI 제안` 탭 내용 | 현재 "준비 중" 표시 |
| **Calendar** | 태스크 블록 클릭 시 드로어 연동 | `onTaskClick` 빈 핸들러 |
| **Calendar** | 배치 대기열 필터 버튼 기능 | 버튼만 있음 |

---

## Vercel 배포

- Project ID: `prj_YumDJtKv90Kdbsd4DRclJvWUOoQP`
- Team ID: `team_Bz6jHioMJrz5bNuaCk1yBfaK`
- GitHub 푸시 → Vercel 자동 배포
- Vercel CLI 미설치 — 배포는 git push로만 진행

---

## 최근 변경 (2026-05-17) — Weekly 페이지 신규 구축

### 완료

**MVP 기능 구현 (Biz Lead 분기별 주간보고 문서 연동)**

- `OUTLINE_API_URL` / `OUTLINE_API_TOKEN` 환경 변수 추가 (`.env.local`)
- `api/weekly/route.ts`: Outline REST API로 Biz Lead 2026.2Q Weekly 문서 fetch
  - Doc ID: `0ce8a222-694d-4133-a124-823718b8a065`
  - `## YYYY.MM.DD` 헤더 기준으로 주차별 섹션 파싱, 날짜 내림차순 정렬
  - Next.js `fetch` 5분 캐시 (`next: { revalidate: 300 }`)
- `api/weekly/ai-summary/route.ts`: Claude Haiku SSE 스트리밍 요약
  - 선택된 주차 마크다운 전체 전달 → 팀별 핵심 요약 생성
- `weekly/_lib/types.ts`: `WeekSection` / `WeeklyDoc` 타입
- `weekly-shell.tsx`: 좌측 사이드바(240px) + 우측 콘텐츠 레이아웃, 데이터 로딩 관리
- `weekly-sidebar.tsx`: 주차 목록 (날짜 내림차순, NEW 뱃지), 이전/다음 네비게이터
- `weekly-content.tsx`: `react-markdown` + `remark-gfm` + `rehype-raw` 렌더링
  - `fixMultilineTableCells`: Outline 문서의 멀티라인 테이블 셀 GFM 파싱 버그 전처리
  - `==text==` → `**text**` 변환
  - 팀명 열 120px 고정 + 배경, 내용 열 overflow-x-auto
- `weekly-ai-summary.tsx`: 접이식 AI 요약 패널 (요약하기 → SSE 응답 → 텍스트 표시, 재시도·새로고침)
- `page.tsx`: 기존 플레이스홀더 교체

**버그 수정**
- 사이드바 너비 200px → 240px (Summary와 통일)
- 타이틀 "Weekly" → "WEEKLY" (대문자 컨벤션 통일)
- Outline 문서 일부 팀 행의 셀 내용이 다음 줄에 시작해 GFM 파서가 테이블 밖으로 렌더링하는 문제 수정

**패키지 추가**
- `rehype-raw`: 마크다운 테이블 내 `<br>` HTML 태그 렌더링

---

### 미완료 / 다음 작업 (Weekly)

- **Phase 2 — 각 팀 컬렉션 문서 연동**: 현재 Biz Lead 1개 문서만. 사업개발팀·DX기획1팀 등 개별 팀 아웃라인 컬렉션 문서를 팀별로 탭 또는 필터로 보여주는 기능
- **UX 개선**: 요구사항·디자인 확정 후 진행 예정
  - 팀별 필터 (특정 팀만 보기)
  - 키워드 검색
  - 주차별 AI 요약 캐시 (DB 저장 여부 결정 필요)
  - 날짜 표시 형식 개선 (사이드바 주차 라벨)
