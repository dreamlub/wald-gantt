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
| AI | @anthropic-ai/sdk (Claude Haiku — Summary 인사이트) |
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
| `/` | Schedule | 간트 차트 메인 |
| `/tasks` | Tasks | 태스크 관리 (5뷰) |
| `/weekly` | Weekly | 주간보고 (플레이스홀더) |
| `/notes` | Notes | Obsidian Daily Note — File System Access API (Chrome/Edge) |
| `/summary` | Summary | Slack 수집 이력 + AI 인사이트 |
| `/settings` | Settings | 설정 (플레이스홀더) |
| `/settings/keywords` | — | 클라이언트별 슬랙 탐색 키워드 관리 |
| `/share/[token]` | — | 외부 공개 읽기 전용 보드 (인증 우회) |
| `/login` | — | 로그인 |

---

## 주요 기능

### 간트 페이지 (`/`)

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
│   │   ├── page.tsx                # 간트 메인
│   │   ├── tasks/
│   │   │   ├── page.tsx
│   │   │   ├── _constants.tsx      # STATUS_GROUPS, ASSIGNEE_COLORS, PRIORITY_META, PriorityBars
│   │   │   ├── _utils.ts
│   │   │   └── _components/
│   │   │       ├── TaskRow.tsx
│   │   │       ├── TaskDetailDrawer.tsx
│   │   │       ├── ListView.tsx
│   │   │       ├── KanbanView.tsx
│   │   │       ├── GanttView.tsx
│   │   │       └── CalendarView.tsx
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
│   │   ├── weekly/page.tsx
│   │   ├── notes/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       ├── VaultSetup.tsx
│   │   │       └── DailyNoteView.tsx
│   │   └── settings/
│   │       ├── page.tsx
│   │       └── keywords/keywords-client.tsx
│   ├── api/
│   │   └── insights/generate/route.ts      # SSE 스트리밍 분석 API
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
│   │   ├── TaskFormDialog.tsx
│   │   └── TaskTrashPanel.tsx
│   └── ui/
├── hooks/
│   ├── use-confirm.tsx
│   ├── use-undo-redo.ts
│   └── use-vault-handle.ts                 # IndexedDB FileSystemDirectoryHandle 영속 관리
├── lib/
│   ├── gantt-service.ts                    # CRUD + bulkSoftDelete/bulkUpdateStatus/duplicateTask
│   ├── gantt-utils.ts                      # toDate, toDateStr, isLightColor 등
│   ├── daily-note.ts                       # 경로 패턴 + readNote/writeNote
│   ├── insight-service.ts                  # getInsight / generateInsight SSE 클라이언트
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

## 최근 변경 (2026-05-17)

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

- **주간보고** (`/weekly`): 플레이스홀더만 있음
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

## Vercel 배포

- Project ID: `prj_YumDJtKv90Kdbsd4DRclJvWUOoQP`
- Team ID: `team_Bz6jHioMJrz5bNuaCk1yBfaK`
- GitHub 푸시 → Vercel 자동 배포
- Vercel CLI 미설치 — 배포는 git push로만 진행
