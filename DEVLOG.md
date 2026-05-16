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

board_share_tokens                       ← 공개 공유 토큰
  board_id, token, created_at

gantt_categories
  id, workspace_id, board_id, name, color, sort_order, created_at, updated_at

gantt_projects
  id, workspace_id, board_id, category_id, parent_id
  name, status, start_date(YYYY-MM-DD), end_date(YYYY-MM-DD)
  sort_order, team, pm, memo, priority, created_at, updated_at
  deleted_at TIMESTAMPTZ                 ← 소프트 삭제

gantt_project_history                    ← DB 트리거 자동 기록 (SECURITY DEFINER)
  id, project_id, field_name, old_value, new_value, changed_at

gantt_tasks
  id, workspace_id, title
  status: 'backlog' | 'to-do' | 'in-progress' | 'done' | 'pending'
  type: 'mine' | 'delegated'
  assignee TEXT, start_date DATE, due_date DATE, memo TEXT
  labels TEXT[], parent_id (자기참조 — 하위 태스크), priority SMALLINT NOT NULL DEFAULT 0
  sort_order, created_at, updated_at
  deleted_at TIMESTAMPTZ                 ← 소프트 삭제

gantt_task_history                       ← DB 트리거 자동 기록 (SECURITY DEFINER)
  id, task_id, field_name, old_value, new_value, changed_at

gantt_task_projects                      ← M:N 연결 테이블
  task_id, project_id

clients                                  ← Client History
  id, workspace_id, name, name_en, color, keywords TEXT[], sort_order, created_at, updated_at

client_history                           ← AI 수집 히스토리
  id, workspace_id, client_id
  type: 'issue' | 'decision' | 'task' | 'doc' | 'slack'
  channel, source_ref, source_id (dedupe), title, body, occurred_at
  status, status_kind: 'late' | 'warn' | 'ok' | 'future'
  created_at, updated_at, deleted_at
  ⚠️ 초기엔 workspace_id + source_id 부분 UNIQUE 인덱스 있었으나 Make 자동 수집 호환성 위해 제거 (2026-05-16). 중복 방지는 INSERT 클라이언트 측에서 처리 예정
```

### Supabase RPC / 트리거
- `create_workspace_for_user(workspace_name)` — RLS 우회용 SECURITY DEFINER
- `get_shared_board(p_token)` — 공유 페이지에서 비인증 접근용, board + categories + projects를 한 번에 반환
- `log_gantt_project_changes()` — AFTER UPDATE 트리거 (SECURITY DEFINER)
- `log_gantt_task_changes()` — AFTER UPDATE 트리거 (SECURITY DEFINER) ⚠️ 반드시 SECURITY DEFINER여야 RLS 통과

---

## 페이지 구조

좌측 56px 고정 다크 아이콘 레일(`AppNav`, `bg-ink-900`)에서 전환. 라벨은 영문:

| 경로 | 라벨 | 설명 |
|------|------|------|
| `/` | Schedule | 간트 차트 메인 |
| `/tasks` | Task | 태스크 관리 (5뷰) |
| `/weekly` | Weekly | 주간보고 (플레이스홀더) |
| `/history` | History | 클라이언트별 히스토리 — Make.com Slack 수집 + Supabase 저장 |
| `/settings` | Settings | 설정 (플레이스홀더) |
| `/settings/keywords` | — | 클라이언트별 슬랙 탐색 키워드 관리 |
| `/share/[token]` | — | 외부 공개 읽기 전용 보드 (인증 우회) |
| `/login` | — | 로그인 |
| `/timeline` | — | (구) Timeline mock — AppNav에서 제거, 파일만 보존 |

`(app)` route group으로 `AppNav` 공유 레이아웃. `usePathname`으로 활성 표시.

---

## 주요 기능

### 간트 페이지 (`/` Schedule)

**보드 사이드바 (BoardSidebar)**
- 워크스페이스 내 여러 보드 생성·전환
- `@dnd-kit`으로 보드 순서 드래그 재정렬
- 더블클릭 → 이름 인라인 편집
- 사이드바 열기/닫기 토글
- 하단 휴지통 버튼 (삭제 건수 배지)

**간트 차트 (GanttChart)**
- **월/주/일 3개 뷰**: 컬럼 너비 72px / 36px / 28px
- 바 드래그(이동) + 좌우 리사이즈
- 뷰 전환 시 today 위치로 자동 스크롤
- 카테고리 드래그 재정렬, 프로젝트는 카테고리 내·간 이동 지원 (`liveItems` 실시간 미리보기)
- 상태 배지 클릭으로 사이클 변경: `to-do → in-progress → pending → backlog → done → to-do`
- **좌측 컬러 막대 = 상태** (4px, hover 6px), 클릭으로 사이클 변경
- 제목 **우선순위 폰트 강조** (0=`text-ink-400 normal`, 1=`text-muted-foreground normal`, 2=`text-foreground medium`, 3=`text-rose-500 semibold`)
- 우측 호버 액션(메모/삭제) + 그라데이션 페이드 — 평소 행은 깔끔, 호버 시에만 등장
- 메모 인디케이터 + hover 풍선말 (`clampTooltipPos` — 화면 하단에서는 위로 자람)
- **Undo/Redo**: 툴바 버튼 + Ctrl+Z / Ctrl+Y, 20단계 (`useUndoRedo` 훅)
- **휴지통 패널 (TrashPanel)**: 복원 / 영구 삭제 / 전체 비우기
- **수정 이력**: 프로젝트 폼 다이얼로그 내 탭으로 통합 (`ProjectFormDialog`의 `이력` 탭)
- **공유 다이얼로그 (ShareDialog)**: 보드 단위 공개 토큰 발급/복사/취소

**GanttToolbar**
- **검색**: 클릭으로 펼침/접힘, X 또는 외부 클릭+빈값으로 닫힘
- **필터 드롭다운**: 팀/PM 체크박스 (활성 개수 배지)
- **정렬 드롭다운**: 기본 / 시작일↑ / 종료일↓ / 우선순위↓
- **지연/시작 지연 배지**: `overdueCount`, `startDelayedCount` 카운트 + 토글 필터 (`status-late`/`status-warn` 토큰)
- "+ 카테고리" / "+ 프로젝트 추가" 버튼, Undo/Redo 버튼

### 태스크 페이지 (`/tasks` Task)

**5개 뷰 전환** (액션바 탭)
| 뷰 | 설명 |
|----|------|
| 일반 | 지연 묶음 + 상태 그룹(접기/펼치기) + 인라인 퀵 등록 |
| 목록 | 부모-자식 들여쓰기 + 정렬 + 인라인 퀵 등록 |
| 칸반 | 상태 컬럼, dnd-kit으로 컬럼 간 이동(=상태 변경) + 인라인 퀵 등록 |
| 간트 | 시작/마감 기준 간트 — 정렬: 시작일→마감일→sort_order |
| 캘린더 | **마감일 기준** 캘린더 (시작일은 표시 안 함) |

**사이드바 (240px)**
- 퀵 필터: **전체 / 지연 / 시작 지연 / 오늘 마감 / 이번 주 마감 / 다음 주 마감** — 활성 상태에서 다시 누르면 해제
- 프로젝트별 카운트 — 컬러 도트 + 클릭 필터(토글)
- 담당자별 카운트 — 상위 7명 + "+N명 더보기" 토글, 이름 검색 시 전체 노출
- 라벨 해시태그 필터 — 라벨별 카운트, 클릭 필터
- 하단 휴지통 버튼 (TaskTrashPanel)

**메인 액션바 (h-12)**
- 뷰 탭 / 검색(제목·담당자·메모·라벨) / `+ 태스크 추가` / 선택 모드 토글
- 담당자 필터 바: 사이드바 닫혔을 때만 표시

**TaskRow (일반 뷰 행)**
- 좌측: 그립 핸들 (선택 모드 시 체크박스로 전환)
- 제목 — 우선순위 폰트 강조, Done이면 `line-through text-ink-400` + 행 `opacity-55`
- 배지: 지연(`status-late`) / 시작 지연(`status-warn`) / 무응답(7일+ 미수정) / 연결 프로젝트 / 라벨 / 하위 진행
- `sub +` 호버 버튼 (부모 행에서만) — 인라인 하위 태스크 등록 트리거
- 컬럼: 메모(w-10, hover 풍선말) | 담당자(w-28) | 일정(w-24)

**벌크 액션 (일반·목록 뷰)**
- `selectionMode` 토글 시 체크박스 노출, DnD 비활성
- floating 액션 바: N개 선택됨 / 상태 변경 드롭다운 / 삭제(undo 토스트) / 취소
- `bulkSoftDeleteTasks`, `bulkUpdateTaskStatus` 서비스 함수

**태스크 복제**
- `TaskDetailDrawer` 헤더 Copy 버튼 → 제목+"(복사)", 동일 필드+프로젝트 링크 복사
- `duplicateTask` 서비스 함수

**ListView (목록 뷰)**
- 헤더 정렬: 비활성 시에도 `↕` 표시, 마감일 없는 항목은 항상 뒤로
- 부모-자식 들여쓰기 (`CornerDownRight ↳` + `bg-muted/40`)
- 상태 컬럼은 블릿+텍스트 (pill 대신)
- 부모 행 hover 시 `sub +` 버튼, 클릭 시 sub 행 아래 들여쓰기 입력창

**KanbanView (칸반 뷰)**
- 미니멀 카드: `ring-1 ring-ink-150`, hover `ring-ink-200`
- 우선순위 폰트 강조, Done opacity, 인라인 배지(지연/무응답/프로젝트/라벨)
- 메모 hover 풍선말, 컬럼 하단 인라인 퀵 등록

**GanttView (태스크 간트 뷰)**
- 좌측 컬럼 폭 드래그 리사이즈 (기본 300px, min 120 / max 560)
- 하위 태스크 들여쓰기 (`CornerDownRight ↳`)
- 마감 초과 바 빨강, 시작 지연 바 앰버
- 정렬: 시작일 → 마감일 → sort_order

**CalendarView (캘린더 뷰)**
- 마감일 기준 칩 (시작일 표시 안 함)
- 좌측 컬러 막대 3px + 라운드 우측 (status color, overdue 빨강)
- 셀당 3개 + `+N개 더` 텍스트

**TaskDetailDrawer** (편집)
- 우측 슬라이드 패널, 행 클릭으로 오픈
- **탭 구조**: 정보 / 메모 / 이력
- 필드: 제목 → 상태+담당자 → 시작/마감일 → 우선순위 → 연결 프로젝트 → 라벨 → 하위 태스크
- 헤더: 복제(Copy) + 삭제(Trash2) 버튼

**TaskFormDialog** (새 태스크)
- 필드: 제목 → 상태+담당자 → 시작/마감일 → 우선순위 → 연결 프로젝트 → 메모
- 라벨은 드로어에서만 (새 태스크 다이얼로그엔 없음)

**인라인 퀵 등록 UX**
- 트리거: 상태 그룹 하단(일반) / sub+ 버튼(일반·목록) / 컬럼 하단(칸반) / 리스트 최하단(목록)
- Enter 저장 + 연속 등록, Esc 또는 빈값 blur로 취소
- sub의 경우 부모의 연결 프로젝트 자동 상속

**필터링**
- 퀵필터/검색 적용 시 하위 태스크의 부모가 조건 미충족이어도 `baseFiltered`에서 복원 → 트리 렌더링 정상 유지

### History 페이지 (`/history`)

**앱 측 (완성)**
- 좌측 사이드바: 클라이언트 리스트, 카운트 + name_en
- 상단: 검색 / 필터 chip 5종 / 새로고침 + "마지막 수집 X분 전"
- 메인: 통계 4-up(미해결 이슈/결정/태스크/문서) + 월별 그룹 타임라인 카드
- DB: `clients` 시드 6건(tony 워크스페이스), `client_history` 비어 있음
- 앱은 **읽기 전용** — Insert는 외부 시스템 담당

**자동 수집 (보류, 2026-05-16 시점)**
- Make.com 시나리오로 Slack Webhook → Claude Haiku 분류 → Supabase Insert 흐름을 시도했음
- 6 모듈(Slack Watch / Slack Get Channel / Supabase Search Rows / Anthropic Claude / JSON Parse / Supabase Upsert) 완성. 데이터 흐름까지는 검증됨 (Supabase에 실제 메시지 INSERT 1건 확인)
- **남은 문제**:
  - Search Rows가 클라이언트별 N bundle 출력 → 1 메시지당 Claude N회 호출되는 구조 (낭비)
  - 비용 최적화 위해 Search Rows → Anthropic 사이 IML 필터 추가 시도 (`length(match(lower(channel + text); lower(join(keywords; "|")))) > 0`) 했으나 안정화 미완
  - Slack 큐 재전송 / 동일 source_id 처리 시 unique constraint 충돌 → Make 자동 비활성화 패턴
  - `idx_client_history_source_dedupe` UNIQUE 인덱스 제거 후에는 Make 멈춤은 사라졌지만 중복 row 가능성 남음
- **현재 상태**: 시나리오 삭제됨. Make 잔여물(webhook 2315528, data structure 371441, connections 3종)도 Make UI에서 정리 예정
- **재시도 시 메모**:
  - 단순화 옵션 A: 6 클라이언트 모두 한 번에 Claude로 보내고 매칭 + 분류 같이 시키기 (1 메시지 = 1 Claude 호출). 단, Search Rows의 N bundle을 단일 prompt에 합치는 데 IML `map()`이 string concat을 지원하지 않아 별도 모듈 필요
  - 단순화 옵션 B: 채널 ID ↔ client_id 매핑 테이블을 별도로 둬서 Search Rows 자체에서 1건만 가져오게 만들기 (가장 깔끔, 시드 비용 약간)
  - 중복 처리: Make의 모듈에 "Ignore error" 핸들러 추가하거나, `idx_client_history_source_dedupe` 복원 후 INSERT 전에 `searchRows`로 사전 체크

**환경**
- Slack OAuth 연결됨 (waldlust-product.slack.com / tony@waldlust.co.kr)
- Anthropic 크레딧 $50 충전됨
- Supabase service_role 키 Make에 등록됨
- Make 조직: My Organization `7277872` / Team `2146547`

### 보드 공유 (`/share/[token]`)
- `ShareDialog`에서 토큰 생성 → 비인증 접근 가능 (`proxy.ts`에서 `/share/*` 가드 제외)
- 서버 컴포넌트가 `get_shared_board` RPC로 데이터 페치 → `ShareView`에서 읽기 전용 간트 표시

---

## 디자인 시스템

### 팔레트 토큰 (`globals.css` `@theme` 블록)
| 그룹 | 토큰 예시 |
|------|-----------|
| Neutral | `ink-50` ~ `ink-900` |
| Primary accent | `lilac-100` ~ `lilac-600` |
| Status | `status-late` (#E5484D) / `status-warn` (#F2A33C) / `status-soon` / `status-future` / `status-ok` |
| Coral | `coral-100` ~ `coral-500` |
| Mint | `mint-100` / `mint-300` / `mint-500` |
| Identifier | `id-{indigo,amber,orange,violet,green,blue,pink,teal,purple}` — 프로젝트/담당자 식별색 |
| Cat picker (vivid) | `cat-{indigo,blue,green,yellow,orange,red,pink,purple}` |
| Cat picker (pastel) | `cat-{...}-light` |

### 태스크 상태 CSS 변수 (`:root`, inline style용)
| 변수 | 값 |
|------|----|
| `--task-status-backlog` | `var(--color-ink-300)` |
| `--task-status-todo` | `var(--color-lilac-500)` |
| `--task-status-in-progress` | `var(--color-status-warn)` |
| `--task-status-done` | `var(--color-mint-500)` |
| `--task-status-pending` | `var(--color-lilac-300)` |
| `--task-status-*-bg` | `color-mix(in srgb, ... 12%, transparent)` |
| `--task-status-overdue-bg` | `color-mix(in srgb, var(--color-status-late) 12%, transparent)` |

### 시맨틱 토큰 (shadcn 브릿지)
- `bg-background` / `bg-card` — 흰 배경
- `bg-muted` — 헤더·사이드바 등 약한 회색 배경
- `text-foreground` — 주 텍스트
- `text-muted-foreground` — 보조 텍스트
- `border-border` — 기본 구분선
- `bg-accent` / `text-accent-foreground` — lilac 틴트 hover/selected

### 폰트 톤 (전 컴포넌트 공통)
- 본문 / 행 제목: `text-xs`
- 보조 / 날짜 / 상태: `text-[11px]`
- 메타 / 컬럼 헤더 / 배지: `text-[10px]`
- 라벨 칩 / `+N`: `text-[9px] leading-none px-1 py-[3px] rounded font-medium`

### 우선순위 폰트 강조 (모든 뷰 공통)
| Priority | 라벨 | 클래스 |
|----------|------|--------|
| 0 | 없음 | `font-normal text-ink-400` |
| 1 | 낮음 | `font-normal text-muted-foreground` |
| 2 | 보통 | `font-medium text-foreground` |
| 3 | 높음 | `font-semibold text-rose-500` |

### 버튼 톤
- 주요 버튼: `bg-foreground text-background hover:bg-ink-800`
- 인라인 "+ 추가": `text-ink-400 hover:text-foreground`
- 점선 보더 sub+ 버튼: `border-dashed border-ink-300 hover:border-ink-400 hover:bg-muted`

### 지연 배지 (전 뷰 공통)
- 마감 지연: `bg-status-late/10 text-status-late border border-status-late/15`
- 시작 지연: `bg-status-warn/10 text-status-warn border border-status-warn/15`
- 무응답(7일+): `bg-coral-100 text-coral-500 border border-coral-100`

### 메모 풍선말 (`clampTooltipPos` 헬퍼)
- `text-[11px]`, `bg-foreground text-background`, `max-h-[60vh] overflow-hidden`
- 가로: 우측 넘침 → 좌측 플립 / 세로: 화면 하단(>50%) → `bottom` 앵커로 위로 자람

### Helper 유틸 (`_utils.ts`)
- 날짜: `fmtDate`, `fmtRange`, `daysDiff`, `overdueDays`, `isOverdue`, `isDueThisWeek`, `isDueNextWeek`
- 시작 지연: `isStartDelayed`, `startDelayedDays` (to-do/backlog + start_date < today)
- 톤: `isLightColor` (sRGB 휘도 > 170 → light)
- 툴팁: `clampTooltipPos`

---

## 파일 구조

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx              # AppNav 공유 레이아웃
│   │   ├── page.tsx                # 간트 메인
│   │   ├── tasks/
│   │   │   ├── page.tsx
│   │   │   ├── _constants.tsx      # STATUS_GROUPS, ASSIGNEE_COLORS, VIEW_TABS, PRIORITY_META, PriorityBars
│   │   │   ├── _utils.ts           # 날짜·툴팁·색 유틸
│   │   │   └── _components/
│   │   │       ├── TaskRow.tsx
│   │   │       ├── TaskDetailDrawer.tsx
│   │   │       ├── ListView.tsx
│   │   │       ├── KanbanView.tsx
│   │   │       ├── GanttView.tsx
│   │   │       └── CalendarView.tsx
│   │   ├── history/
│   │   │   ├── page.tsx
│   │   │   ├── _components/        # history-shell, timeline, client-list, stat-tile 등
│   │   │   └── _lib/               # types, mock-data
│   │   ├── timeline/page.tsx       # (구) mock — AppNav에서 제거, 파일만 보존
│   │   ├── weekly/page.tsx         # 사이드바(기간 프리셋+DatePicker) + 메인 영역(콘텐츠 TBD)
│   │   └── settings/page.tsx       # 플레이스홀더
│   ├── share/[token]/
│   │   ├── page.tsx                # 서버 컴포넌트, RPC 호출
│   │   └── ShareView.tsx
│   ├── globals.css                 # 팔레트 @theme + 시맨틱 :root + 스크롤바 커스텀
│   ├── layout.tsx
│   └── login/page.tsx
├── components/
│   ├── AppNav.tsx                  # 좌측 56px 다크(ink-900) 아이콘 레일
│   ├── gantt/
│   │   ├── GanttChart.tsx          # ⚠️ ~1,200줄 (분리 예정)
│   │   ├── GanttToolbar.tsx
│   │   ├── BoardSidebar.tsx
│   │   ├── ProjectFormDialog.tsx   # 정보/메모/이력 3탭
│   │   ├── CategoryFormDialog.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── TrashPanel.tsx
│   │   └── ShareDialog.tsx
│   ├── tasks/
│   │   ├── TaskFormDialog.tsx
│   │   └── TaskTrashPanel.tsx
│   └── ui/                         # shadcn 컴포넌트
├── hooks/
│   ├── use-confirm.tsx
│   └── use-undo-redo.ts
├── lib/
│   ├── gantt-service.ts            # CRUD + bulkSoftDelete/bulkUpdateStatus/duplicateTask
│   ├── gantt-utils.ts
│   └── supabase/
├── proxy.ts                         # 인증 가드
└── types/index.ts
```

---

## 주요 상수

```ts
// GanttChart (간트 메인)
COL_WIDTH       = 72   // 월 뷰
WEEK_COL_WIDTH  = 36   // 주 뷰
DAY_COL_WIDTH   = 28   // 일 뷰
LEFT_WIDTH      = 260  // 좌측 패널 기본 너비
HEADER_H        = 80   // 헤더 높이 (연도 34 + 월 28 + today 18)
CAT_ROW_H       = 32
PROJ_ROW_H      = 36

// GanttView (태스크 간트)
LEFT_W_DEFAULT  = 300  // 드래그 리사이즈 기본
LEFT_W_MIN      = 120
LEFT_W_MAX      = 560  // (tasks/_components/GanttView.tsx 상수는 다름, 확인 필요)
```

---

## 최근 변경

### 2026-05-16 — Summary 페이지 태그 시스템 + 실데이터 수집 + 표준 정렬

**태그 시스템 전환 (단일 type → 다중 tags TEXT[])**
- DB: `client_history.tags TEXT[]` + GIN 인덱스 추가, 기존 `type` 컬럼은 deprecated
- 6종 태그: `issue` 🔴 / `decision` 🟡 / `mention` 🔵 / `in_progress` 🟢 / `done` ✅ / `schedule` 📅
- 사이드바 태그 다중 선택(AND), 본문에서 `TagList` 다중 뱃지

**Slack 실데이터 수집 (MCP)**
- 8개 채널에서 93건 수집·분류·INSERT (매머드 30 / 빽다방 7 / 텐퍼 19 / 더리터 9 / 몬스터 8 / SNBI 10 외)
- 태그 분포: issue 42 · decision 18 · mention 20 · in_progress 38 · done 12 · schedule 14

**Slack Summary SOP v1.0 표준화**
- 메모리: `project_slack_summary_sop.md` — 태그 6종/중요도/작성자 prefix/제외 기준
- 태그명 표준 정렬: `in-progress`→`in_progress`, `scheduled`→`schedule` (코드 + DB 동시)
- 외부 작성자 prefix: `MMTH_김형종`→`[매머드] 김형종` 등 정규화
- `client_history.source_id text` 컬럼 + `(workspace_id, source_id)` 유니크 인덱스 추가 (중복 SKIP)

**페이지 리네이밍 `/history` → `/summary`** — 라우트/네비/SUMMARY 헤더 일괄 변경

**사이드바 정비**
- 브랜드: 검색 가능 콤보박스(Popover + input), 40~60개 브랜드 대응
- 채널 필터 제거, 작성자 섹션 제거
- 기간: from/to DatePicker + 프리셋 4종(오늘/이번 주/한 달/전체) 텍스트 버튼, 활성 프리셋 하이라이트
- 선택 하이라이트: `sidebar-btn` / `sidebar-btn-active` 글로벌 클래스로 태스크와 통일

**본문 뷰**
- 카드 뷰 삭제, 3뷰(테이블/타임라인/요약)
- 테이블 칼럼 순서: 내용 / 브랜드 / 태그 / 중요도 / 작성자 / 등록일 (채널 제거)
- 테이블 브랜드·태그는 배경 뱃지 → 점+텍스트만 (단순 표기)
- 작성자 셀에서 Avatar 제거 → 이름만 표시
- 중요도: 태스크 동일 3단 막대 그래프(`PriorityBars`), 색상 토큰 `status-future`(낮음·파랑) / `status-warn`(보통·주황) / `status-late`(높음·빨강)

**캘린더 더보기 팝오버**
- "+N개 더" 인라인 확장 → 버튼 클릭 시 viewport-flip 지원 floating popover로 전환

**칸반 뷰 잔여 수정**
- `KanbanView.tsx`에서 `STATUS_GROUPS` destructure `bgColor` 누락 보강

**추가 보완 (사용자 피드백 반영)**
- 테이블 태그 칼럼: 가로 wrap → 세로 개행 (`flex-col`) — 다수 태그 가독성
- 중요도 reclick → `'all'` 해제 (toggle off) 적용. **기본 룰**로 메모리화: [[filter-toggle]]
- 본문 상단 브랜드 칩 행 `sticky top-0 z-10 bg-card` — 스크롤 시 고정
- 테이블 컬럼 정렬: 브랜드 / 중요도 / 작성자 / 등록일 헤더 클릭으로 asc↔desc 토글. 정렬 미적용 `↕`, 적용 `↑/↓`. 기본 등록일 desc, 한국어 `localeCompare('ko')`
- 사이드바 '전체' 항목에 `LayoutList` 아이콘 추가 (중요도·브랜드 콤보박스 popover) — Tasks 사이드바와 통일

- `npx tsc --noEmit` 통과

### 2026-05-16 — 하드코딩 색상 → 디자인 토큰 교체 (대규모)

**globals.css `:root`에 태스크 상태 CSS 변수 추가**
- `--task-status-{backlog,todo,in-progress,done,pending}` — 상태별 대표색
- `--task-status-{..}-bg` — `color-mix(in srgb, ... 12%, transparent)` 배경색
- `--task-status-overdue-bg` — 마감 초과 배경

**globals.css `@theme`에 식별자 팔레트 추가**
- `--color-id-{indigo,amber,orange,violet,green,blue,pink,teal,purple}` — 프로젝트/담당자 식별색
- `--color-cat-{*}` (vivid 8종) / `--color-cat-{*}-light` (pastel 8종) — 카테고리 컬러피커 팔레트

**`_constants.tsx`**
- `STATUS_GROUPS`: `bgColor` 필드 추가, hex → CSS var
- `STATUS_COLOR`: hex → CSS var
- `STATUS_BG_COLOR` 신규 export (상태별 배경색)
- `PRIORITY_META`: hex → `var(--color-ink-300)` / `status-*` CSS var
- `PriorityBars` inactive bar: `#e5e7eb` → `var(--color-ink-150)`
- `PROJECT_COLORS` / `ASSIGNEE_COLORS`: hex → `var(--color-id-*)` CSS var

**`GanttChart.tsx`**
- `STATUS_META` dot 색상: hex → `var(--task-status-*)`
- `backgroundColor: '#f8f9fa'` → `var(--muted)` (2곳)
- PM 색상 폴백 `#9ca3af` → `var(--color-ink-300)`
- `CAT_COLORS` hex 배열 유지 (DB 저장값과 비교해야 하므로 문자열 hex 필요) — globals.css `@theme`에 동일 값으로 `--color-cat-*` 토큰 등록해 참조 명세 유지

**`KanbanView.tsx`**
- `color + '20'` hex-alpha → `bgColor` prop (STATUS_GROUPS에서 전달)
- 담당자 색상 폴백 `#9ca3af` → `var(--color-ink-300)`

**`TaskTrashPanel.tsx`**
- `(STATUS_COLOR[...] ?? ...) + '20'` → `STATUS_BG_COLOR[...] ?? 'var(--task-status-backlog-bg)'`

**`CalendarView.tsx`**
- `#ef4444` → `var(--color-status-late)`, `#fef2f2` → `var(--task-status-overdue-bg)`
- `STATUS_COLOR[...] + '20'` → `STATUS_BG_COLOR[...]`

**`TaskRow.tsx`, `ListView.tsx`, `tasks/page.tsx`**
- 담당자 색상 폴백 `#9ca3af` → `var(--color-ink-300)`

- `npx tsc --noEmit` 통과

### 2026-05-16 — 사이드바 필터 버튼 선택 상태 통일

**globals.css에 `.sidebar-btn` / `.sidebar-btn-active` 유틸리티 클래스 추가**
- `.sidebar-btn`: 공통 기본 스타일 (flex, w-full, gap, padding, border-l-2 transparent)
- `.sidebar-btn-active`: 선택 상태 — `border-left-color: var(--color-ink-700)` 어두운 바 + `bg-card` + `text-foreground font-medium`
- hover는 `.sidebar-btn:not(.sidebar-btn-active):hover`로 active 상태 덮어쓰기 방지
- 적용 범위: Tasks 사이드바(퀵필터/프로젝트/담당자) + Weekly 프리셋 버튼 + BoardSidebar 보드 항목

### 2026-05-16 — 타이틀 정리 + Weekly 페이지 기초 작업

**타이틀 일관성 수정**
- `BoardSidebar.tsx`: 사이드바 헤더 "보드" → "Schedule"
- `GanttToolbar.tsx`: 보드명 h1 대신 "Schedule" 고정 타이틀로 변경, boardName은 옆에 `text-[11px] text-muted-foreground` subtitle로 유지
- `AppNav.tsx`: 네비게이션 메뉴명 "Task" → "Tasks"
- `tasks/page.tsx`: 사이드바 h1 "태스크" → "Tasks"

**Weekly 페이지 (`/weekly`) 기초 작업**
- 좌측 사이드바 (200px): Tasks 페이지와 동일한 구조/스타일
  - 기간 프리셋 버튼 4종: 오늘 / 이번 주 / 이번 달 / 전체
  - 선택 시 `bg-accent text-accent-foreground font-medium` 하이라이트, 기본값 "이번 달"
  - 시작일/마감일 DatePickerButton — 직접 변경 시 프리셋 해제
  - 사이드바 토글 (PanelLeftClose / PanelLeftOpen)
- 메인 영역은 콘텐츠 기획 확정 후 채울 예정

### 2026-05-16 — 태스크 영역 데드코드 정리
- `tasks/_utils.ts` 미사용 함수 4개 제거: `relativeTime`, `toKSTDateStr`, `weekStart`, `abbrev`
- `tasks/_components/SummaryCard.tsx` 파일 삭제 (어디서도 import 안 됨)
- `npx tsc --noEmit` 통과

### 2026-05-16 — 죽은 컴포넌트/페이지 제거
- `src/app/(app)/timeline/page.tsx` + 디렉터리 삭제 (구 mock, AppNav에서 이미 빠진 상태였음)
- `src/components/gantt/StatusBadge.tsx` 삭제 (어디서도 import 0건)
- `src/components/gantt/ProjectHistoryPanel.tsx` 삭제 (`ProjectFormDialog`의 이력 탭으로 통합 후 잔재)
- `src/components/gantt/CategoryFormDialog.tsx` 삭제 (어디서도 import 0건)
- `gantt-utils.ts`의 `STATUS_LABELS` / `STATUS_COLORS` 제거 (`StatusBadge` 외 사용처 없었음, 동반 사망)
- `npx tsc --noEmit` 통과

### 2026-05-16 — 폼 헬퍼/컴포넌트 중복 제거
- `toDate` / `toDateStr` → `src/lib/gantt-utils.ts`로 이동 (3곳 중복 → 단일 정의)
- `AutocompleteInput` → `src/components/AutocompleteInput.tsx`로 추출 (3곳 중복 → 단일 컴포넌트)
  - TaskDetailDrawer 버전이 쓰던 `text-ink-700` → `text-foreground`로 통일 ([[feedback-font-consistency]])
- `TaskFormDialog`, `TaskDetailDrawer`, `ProjectFormDialog`에서 중복 정의 제거 + import로 대체
- `TaskTrashPanel`의 `STATUS_LABEL`/`STATUS_COLOR` 중복 정의 제거 → `_constants`에서 import
- `npx tsc --noEmit` 통과

---

## 알려진 이슈

### ⚠️ GanttChart.tsx 라인 수 초과
현재 약 1,200줄. 자체 규칙(1,000줄) 위반 — 분리 리팩토링 필요.

### ⚠️ `searchProjects` 와일드카드 이스케이프 누락
`gantt-service.ts`의 `ilike '%query%'`에서 사용자 입력의 `%`, `_`가 패턴 문자로 그대로 작동. SQL 인젝션은 아니지만 검색 결과가 의도와 다를 수 있음.

---

## 결정 사항 / 보류

- **협업 기능 배제**: 1인용 개인 업무 도구. 외부 공유는 읽기 전용 토큰 URL로만.
- **반응형(모바일) 미지원**: 간트 차트 특성상 데스크탑 전용.
- **태스크 undo/redo 미구현**: 삭제는 토스트 "되돌리기"로 보완, 다른 액션은 명시적이라 불필요 판단.
- **GanttChart.tsx 분리 보류**: 기능 추가 안정화 후 분리 예정.
- **빌드 검증**: 코드 변경 후 `npx tsc --noEmit`로 타입 체크.

---

## 미구현 / 예정

- **주간보고** (`/weekly`): 주간 태스크 자동 요약 — 플레이스홀더만 있음
- **설정** (`/settings`): 플레이스홀더만 있음
- **태스크 드래그 정렬**: 칸반 컬럼 간 상태 변경은 되지만, 같은 그룹/컬럼 내 순서 변경 미구현
- **간트 바 날짜 드래그**: 태스크 간트 뷰의 바를 좌우 드래그해 날짜 변경 — 현재 읽기 전용
- **캘린더 퀵 등록**: 날짜 셀 클릭으로 해당 마감일로 태스크 빠른 생성
- **태스크 parent 재지정**: 드로어에서 하위 태스크를 다른 부모 아래로 이동하거나 최상위로 승격하는 UI 없음
- **GanttChart.tsx 분리 리팩토링**: ~1,200줄 → 1,000줄 제한 준수
- **History 자동 수집 (보류)**: Make.com 시나리오로 Slack→Claude→Supabase 흐름 시도했으나 안정화 미완. 자세한 내용은 History 페이지 섹션 참조. 재시도 시점에 옵션 A/B 중 택일

---

## Supabase 프로젝트

- Project ID: `eytonzxeogdfeuvxtuwh`
- Region: ap-northeast-2 (서울)
- Auth: 이메일/비밀번호, Google OAuth

## Vercel 배포

- Project ID: `prj_YumDJtKv90Kdbsd4DRclJvWUOoQP`
- Team ID: `team_Bz6jHioMJrz5bNuaCk1yBfaK`
- GitHub 푸시 → Vercel 자동 배포
- Vercel CLI 미설치 — 배포는 git push로만 진행
