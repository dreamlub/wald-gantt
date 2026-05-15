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

gantt_task_history                       ← DB 트리거 자동 기록 (SECURITY DEFINER, 신규)
  id, task_id, field_name, old_value, new_value, changed_at

gantt_task_projects                      ← M:N 연결 테이블
  task_id, project_id
```

### Supabase RPC / 트리거
- `create_workspace_for_user(workspace_name)` — RLS 우회용 SECURITY DEFINER
- `get_shared_board(p_token)` — 공유 페이지에서 비인증 접근용, board + categories + projects를 한 번에 반환
- `log_gantt_project_changes()` — AFTER UPDATE 트리거 (SECURITY DEFINER)
- `log_gantt_task_changes()` — AFTER UPDATE 트리거 (SECURITY DEFINER) ⚠️ 반드시 SECURITY DEFINER여야 RLS 통과 (안 그러면 status 업데이트 실패함)

---

## 페이지 구조

좌측 56px 고정 다크 아이콘 레일(`AppNav`)에서 전환. 라벨은 영문:

| 경로 | 라벨 | 설명 |
|------|------|------|
| `/` | Schedule | 간트 차트 메인 |
| `/tasks` | Task | 태스크 관리 (5뷰) |
| `/weekly` | Weekly | 주간보고 (플레이스홀더) |
| `/timeline` | Timeline | 브랜드별 이력/타임라인 (mock 데이터) |
| `/settings` | Settings | 설정 (플레이스홀더) |
| `/share/[token]` | — | 외부 공개 읽기 전용 보드 (인증 우회) |
| `/login` | — | 로그인 |

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
- **월/주/일 3개 뷰**: 컬럼 너비 72px / 44px / 24px
- 바 드래그(이동) + 좌우 리사이즈
- 뷰 전환 시 today 위치로 자동 스크롤
- 카테고리 드래그 재정렬, 프로젝트는 카테고리 내·간 이동 지원 (`liveItems` 실시간 미리보기)
- 상태 배지 클릭으로 사이클 변경: `to-do → in-progress → pending → backlog → done → to-do`
- **좌측 컬러 막대 = 상태** (4px, hover 6px), 클릭으로 사이클 변경
- 제목 **우선순위 폰트 강조** (0=gray-400 normal, 1=gray-600 normal, 2=gray-900 medium, 3=rose-400 semibold)
- 우측 호버 액션(메모/삭제) + 그라데이션 페이드 — 평소 행은 깔끔, 호버 시에만 등장
- 메모 인디케이터(인디고 점) + hover 풍선말 (`clampTooltipPos` — 화면 하단에서는 위로 자람)
- **Undo/Redo**: 툴바 버튼 + Ctrl+Z / Ctrl+Y, 20단계 (`useUndoRedo` 훅)
- **휴지통 패널 (TrashPanel)**: 복원 / 영구 삭제 / 전체 비우기
- **수정 이력**: 프로젝트 폼 다이얼로그 내 탭으로 통합 (`ProjectFormDialog`의 `이력` 탭)
- **공유 다이얼로그 (ShareDialog)**: 보드 단위 공개 토큰 발급/복사/취소

**GanttToolbar (재설계)**
- **검색**: 클릭으로 펼침/접힘, X 또는 외부 클릭+빈값으로 닫힘
- **필터 드롭다운**: 팀/PM 체크박스 (활성 개수 배지)
- **정렬 드롭다운**: 기본 / 시작일↑ / 종료일↓ / 우선순위↓
- **지연/시작 지연 배지**: `overdueCount`, `startDelayedCount` 카운트 + 토글 필터
- "+ 카테고리" / "+ 프로젝트 추가" 버튼 (블랙 톤)
- Undo/Redo 버튼
- **Ghost compare 기능 제거** (이전엔 점선 ghost 바로 이전 일정 비교, 현재 삭제)

### 태스크 페이지 (`/tasks` Task)

**5개 뷰 전환** (액션바 탭)
| 뷰 | 설명 |
|----|------|
| 일반 | 지연 묶음 + 상태 그룹(접기/펼치기) + 인라인 퀵 등록 |
| 목록 | 부모-자식 들여쓰기 + 인라인 퀵 등록 |
| 칸반 | 상태 컬럼, dnd-kit으로 컬럼 간 이동(=상태 변경) + 인라인 퀵 등록 |
| 간트 | 시작/마감 기준 간트 — 정렬: 시작일→마감일→sort_order |
| 캘린더 | **마감일 기준** 캘린더 (시작일은 표시 안 함) |

**사이드바 (240px)**
- 퀵 필터: **전체 / 지연 / 오늘 마감 / 이번 주 마감 / 다음 주 마감** (좌측 정렬, 색 도트). 활성 상태에서 다시 누르면 `all`로 해제
- 프로젝트별 카운트 — 컬러 도트 + 클릭 필터(토글)
- 담당자별 카운트 — **상위 7명 + "+N명 더보기" 토글**, 이름 검색 시 전체 노출
- **라벨 해시태그 필터** — 라벨별 카운트, 클릭 필터
- 미니 캘린더는 **삭제됨** (`/weekly`와 중복, 사이드바 스크롤 유발)
- 하단 휴지통 버튼 (TaskTrashPanel)

**메인 액션바**
- 뷰 탭 / 검색(제목·담당자·메모·라벨) / `+ 태스크 추가` (블랙)
- 담당자 필터 바: 사이드바 닫혔을 때만 표시 (중복 회피)
- 빈 상태 메시지 **컨텍스트 분기**: 지연 → "지연된 태스크가 없어요 👍", 필터 적용 → "조건에 맞는 태스크가 없어요", 진짜 빈 → "+ 첫 번째 태스크 추가" CTA

**TaskRow (일반 뷰 행)**
- 좌측: 그립 + 체크박스(`Circle`/`CheckCircle2`)
- 제목 — 우선순위 폰트 강조, Done이면 `line-through font-medium text-gray-400` + 행 `opacity-55`
- 배지: 지연(빨강) / 시작 지연(앰버) / 무응답(주황, 7일+ 미수정) / 연결 프로젝트 / 라벨(9px) / 하위 진행
- **`sub +` 호버 버튼** (제목 영역 끝, 부모 행에서만) — 인라인 퀵 등록 트리거
- 컬럼: 메모(w-10, hover 풍선말) | 담당자(w-28, 점+이름) | 일정(w-24, `시작 ~ 마감`)
- 행 클릭으로 드로어 오픈 (체크박스만 `stopPropagation`)

**ListView (목록 뷰)**
- 헤더 정렬: 정렬 가능 컬럼에 비활성 시에도 옅은 `↕` 표시
- 마감일 정렬 시 **날짜 없는 항목은 항상 뒤로**, asc는 임박순
- 부모-자식 들여쓰기 (`CornerDownRight ↳` + `bg-gray-50/40`)
- 같은 컬럼 구성, 상태 컬럼은 **블릿+텍스트** (pill 대신)
- 부모 행 hover 시 `sub +` 버튼, 클릭 시 sub 행 아래에 들여쓰기된 입력
- 하단 인라인 퀵 추가 (결과 있을 때만 노출)

**KanbanView (칸반 뷰)**
- 미니멀 카드: `ring-1 ring-gray-100`, hover `ring-gray-300` (그림자 제거)
- 우선순위 폰트 강조, Done opacity, 인라인 배지(지연/무응답/프로젝트/라벨/하위)
- 메모 hover 풍선말
- 컬럼 하단 인라인 퀵 등록 (`+ 태스크 추가`)
- 카드 클릭 → 드로어 (편집/삭제 호버 버튼 제거)

**GanttView (태스크 간트 뷰)**
- 좌측 컬럼 폭 **드래그 리사이즈** (기본 300px, min 120 / max 560, 전체 높이)
- 우선순위 폰트 강조, Done opacity, 메모 아이콘 + hover 풍선말
- 하위 태스크 들여쓰기 (`CornerDownRight ↳`)
- **마감 초과 바 빨강** (#fca5a5 / #ef4444), **시작 지연 바 앰버** (#fcd34d / #f59e0b)
- 정렬: 시작일 → 마감일 → sort_order 오름차순 (시간 흐름)

**CalendarView (캘린더 뷰)**
- 마감일 기준 칩 (시작일은 표시 안 함)
- 좌측 컬러 막대 3px + 라운드 우측 (status color, overdue 빨강)
- 우선순위 폰트 강조, Done opacity, 메모 점 인디케이터
- 셀당 3개 + `+N개 더` 텍스트

**TaskDetailDrawer** (편집)
- 우측 슬라이드 패널, 행 클릭으로 오픈
- **탭 구조**: 정보 / 메모 / 이력
- 필드 순서: 제목 → 상태+담당자 → 시작/마감일 → 우선순위 → 연결 프로젝트 → 라벨 → 하위 태스크 → 메타 정보 *(메모는 별 탭)*
- 연결 프로젝트 — 클릭만 해도 전체 보드별 그룹 노출, debounce 검색
- 라벨 추가·삭제 (해시 기반 자동 컬러, `isLightColor`로 글자색 자동 대비)
- 우선순위 `PriorityBars`로 시각화
- **이력 탭 (TaskHistorySection)**: 신규. `getTaskHistory(taskId)` → 10초 이내 변경은 한 그룹으로 묶음, 필드/이전→이후 값 표시
- 헤더에 삭제 버튼(`Trash2`) — 행에서 삭제 버튼 제거하고 드로어로 일원화

**TaskFormDialog** (새 태스크)
- 필드 순서 통일: 제목 → 상태+담당자 → 시작/마감일 → 우선순위 → 연결 프로젝트 → 메모
- (라벨은 드로어에서만 — 새 태스크 다이얼로그엔 없음)

**인라인 퀵 등록 UX 통일**
- 트리거 위치: 상태 그룹 하단(일반 뷰) / 부모 sub+ 버튼(일반/목록 뷰) / 컬럼 하단(칸반) / 리스트 최하단(목록)
- 동작: 클릭 → 입력창 변환 (`autoFocus`), **Enter 저장 + 연속 등록**, **Esc 또는 빈값 blur로 취소**
- 기본값: `type=mine`, `priority=2`, 상태는 트리거 위치에 따라(컬럼/상태 그룹/부모 상태 상속)
- sub의 경우 부모의 **연결 프로젝트 자동 상속**

**TaskTrashPanel**
- 삭제된 태스크 목록, 복원 / 영구 삭제 / 전체 비우기

### Timeline 페이지 (`/timeline` Timeline, 신규)
- 브랜드별 이력/타임라인 (이슈 / 결정사항 / 태스크 / 문서 / 슬랙 메시지)
- 현재 **mock 데이터**로 UI 프로토타입 — DB 연결 미구현
- 타입별 컬러 도트 + 아이콘, 브랜드별 그룹

### 보드 공유 (`/share/[token]`)
- `ShareDialog`에서 토큰 생성 → `${origin}/share/${token}` URL 공유
- 비인증으로 접근 가능 (`proxy.ts`에서 `/share/*` 가드 제외)
- 서버 컴포넌트가 `get_shared_board` RPC로 board/categories/projects 페치
- `ShareView`에서 읽기 전용 간트 표시
- 만료된/삭제된 토큰은 에러 페이지

### 프로젝트 상태

| 상태 | 색상 |
|------|------|
| To-Do | 보라 `#ede9fe` |
| In Progress | 파랑 `#dbeafe` |
| Pending | 노랑 `#fef3c7` |
| Backlog | 회색 `#f3f4f6` |
| Done | 초록 `#dcfce7` |

---

## 디자인 시스템 (정합성 룰)

### 폰트 톤 (전 컴포넌트 공통)
- 본문 / 행 제목 / 카드 제목: `text-xs`
- 보조 / 툴팁 / 날짜 / 상태 텍스트: `text-[11px]`
- 메타 / 컬럼 헤더 / 보조 배지: `text-[10px]`
- 라벨 칩 / `+N`: `text-[9px] leading-none px-1 py-[3px] rounded font-medium`

### 우선순위 폰트 강조 (모든 뷰 공통)
| Priority | 라벨 | 클래스 |
|----------|------|--------|
| 0 | 없음 | `font-normal text-gray-400` (딤) |
| 1 | 낮음 | `font-normal text-gray-600` |
| 2 | 보통 | `font-medium text-gray-900` |
| 3 | 높음 | `font-semibold text-rose-400` |

### 추가 버튼 톤
- 주요 버튼: `bg-gray-900 hover:bg-black text-white`
- 인라인 "+ 추가" 버튼: `text-gray-400 hover:text-gray-900`
- 점선 보더 sub+ 버튼: `hover:text-gray-900 hover:border-gray-400 hover:bg-gray-100`

### 메모 풍선말 (`clampTooltipPos` 헬퍼)
- `text-[11px]`, `bg-gray-900 text-gray-100`, `max-h-[60vh] overflow-hidden`
- 가로: 우측 넘침 → 좌측 플립
- 세로: 커서 화면 하단(>50%) → `bottom` 앵커로 위로 자람
- 화살표 위치도 자동 플립

### 라벨 색상 (`labelColor` 해시 + `isLightColor`)
- 10색 팔레트 해시 매핑
- 배경 밝기 따라 글자색 자동 (`#1f2937` 또는 `#ffffff`)

### Helper 유틸 (`_utils.ts`)
- 날짜: `fmtDate`, `fmtRange`, `daysDiff`, `overdueDays`, `isOverdue`, `isDueThisWeek`, `isDueNextWeek`, `toKSTDateStr`, `weekStart`
- 시작 지연: `isStartDelayed`, `startDelayedDays` (to-do/backlog + start_date < today)
- 톤: `isLightColor` (sRGB 휘도 > 170 → light)
- 툴팁: `clampTooltipPos`
- 기타: `relativeTime`, `abbrev`

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
│   │   │   ├── _constants.tsx      # STATUS_GROUPS, PROJECT_COLORS, VIEW_TABS, PRIORITY_META, PriorityBars
│   │   │   ├── _utils.ts           # 날짜·툴팁·색 유틸
│   │   │   └── _components/
│   │   │       ├── TaskRow.tsx
│   │   │       ├── TaskDetailDrawer.tsx
│   │   │       ├── ListView.tsx
│   │   │       ├── KanbanView.tsx
│   │   │       ├── GanttView.tsx
│   │   │       ├── CalendarView.tsx
│   │   │       └── SummaryCard.tsx   # (현재 미사용)
│   │   ├── timeline/page.tsx       # Timeline 페이지 (mock)
│   │   ├── weekly/page.tsx         # 플레이스홀더
│   │   └── settings/page.tsx       # 플레이스홀더
│   ├── share/
│   │   └── [token]/
│   │       ├── page.tsx            # 서버 컴포넌트, RPC 호출
│   │       └── ShareView.tsx       # 읽기 전용 뷰
│   ├── layout.tsx                  # 루트 (Toaster, 타이틀)
│   └── login/page.tsx              # "Wald Task Manager" 타이틀
├── components/
│   ├── AppNav.tsx                  # 좌측 56px 아이콘 레일 (5개 + 로그아웃)
│   ├── gantt/
│   │   ├── GanttChart.tsx
│   │   ├── GanttToolbar.tsx        # 검색 토글 / 필터 드롭다운 / 정렬 드롭다운 / 지연·시작지연 배지
│   │   ├── GanttBar.tsx
│   │   ├── BoardSidebar.tsx
│   │   ├── ProjectFormDialog.tsx   # 정보/메모/이력 3탭
│   │   ├── CategoryFormDialog.tsx  # 색 선택 포함
│   │   ├── StatusBadge.tsx
│   │   ├── ProjectHistoryPanel.tsx # (다이얼로그 탭으로 통합)
│   │   ├── TrashPanel.tsx
│   │   └── ShareDialog.tsx
│   ├── tasks/
│   │   ├── TaskFormDialog.tsx
│   │   └── TaskTrashPanel.tsx
│   └── ui/                          # shadcn
├── hooks/
│   ├── use-confirm.tsx
│   └── use-undo-redo.ts
├── lib/
│   ├── gantt-service.ts             # CRUD + getTaskHistory 추가
│   ├── gantt-utils.ts
│   ├── utils.ts
│   └── supabase/
│       ├── client.ts
│       └── server.ts
├── proxy.ts                          # 인증 가드 (Next 16: middleware → proxy)
└── types/index.ts                    # GanttBoard/Category/Project/Task/Priority/TaskHistoryEntry 등
```

**삭제된 파일**
- `MemoPanel.tsx` — 슬라이드 메모 패널 제거 (현재 메모는 hover 풍선말 + 다이얼로그 탭으로 대체)
- `MiniCalendar.tsx` — 사이드바 미니캘린더 제거 (퀵 필터로 대체)

---

## 주요 상수 (GanttChart)

```ts
COL_WIDTH       = 72   // 월 뷰 컬럼 너비
WEEK_COL_WIDTH  = 44   // 주 뷰 컬럼 너비
LEFT_WIDTH      = 260  // 좌측 패널 너비
HEADER_H        = 80   // 헤더 높이 (연도 34 + 월 28 + today/주 18)
CAT_ROW_H       = 32   // 카테고리 행 높이
PROJ_ROW_H      = 36   // 프로젝트 행 높이
```

> `PROJ_ROW_H_CMP = 56` 은 ghost compare 제거로 같이 삭제됨.

태스크 GanttView의 좌측 폭:
```ts
LEFT_W_DEFAULT = 300   // 기본
LEFT_W_MIN     = 120   // 최소
LEFT_W_MAX     = 560   // 최대
```

---

## 알려진 이슈

### ⚠️ GanttChart.tsx 1k 라인 제한 초과
현재 약 1,150줄. 자체 규칙(1,000줄) 위반 — 분리 리팩토링 필요.

### ⚠️ `searchProjects` 와일드카드 이스케이프 누락
`gantt-service.ts`의 `ilike '%query%'`에서 사용자 입력의 `%`, `_`가 그대로 패턴 문자로 작동. SQL 인젝션은 아니지만 검색이 의도와 다르게 동작할 수 있음.

### ✅ 해결됨: Priority 기능 타입 정의 누락
이전 커밋 `3272a63`에서 도입한 Priority 기능이 타입·상수 미정의로 컴파일이 깨져 있었다. 보강 완료:
- `Priority = 0 | 1 | 2 | 3` 타입 추가, `GanttProject`/`GanttTask`에 `priority` 필드 추가
- `_constants.tsx`에 `PRIORITY_META`, `PRIORITY_OPTIONS`, `PriorityBars` 컴포넌트 export
- 서비스 시그니처(`addProject`, `addTask`, `updateTask`)에 priority 허용
- `(app)/page.tsx`의 `addProject` 호출에서 priority가 누락되던 버그 수정
- `GanttToolbar`의 `SortMode`에 `'priority-desc'` 추가
- `npx tsc --noEmit` 통과

### ✅ 해결됨: 태스크 done 처리 안 되던 버그
새로 추가한 `log_gantt_task_changes()` 트리거 함수에 `SECURITY DEFINER`가 빠져 있어 `gantt_task_history` INSERT가 RLS에 막혀 UPDATE 자체가 롤백됐다. 마이그레이션 `fix_log_gantt_task_changes_security_definer`로 즉시 수정.

---

## 결정 사항 / 보류

- **협업 기능 배제**: 1인용 개인 업무 도구. 멤버 초대 등 협업 기능 구현하지 않음. (외부 공유는 읽기 전용 토큰 URL로만)
- **반응형(모바일) 미지원**: 간트 차트 특성상 데스크탑 전용.
- **소스 파일 1,000줄 제한** — 현재 GanttChart 초과 상태, 추후 분리 예정.
- **빌드 검증**: 코드 변경 후 `npx tsc --noEmit`로 타입 체크.
- **태스크 undo/redo 미구현**: 삭제는 토스트 "되돌리기"로 보완, 다른 액션은 명시적이라 불필요 판단.
- **Ghost compare 제거**: gantt 메인의 점선 ghost 바 비교 기능. 사용 빈도 대비 복잡도가 커서 정리.
- **MemoPanel 제거**: 메모는 hover 풍선말 + 프로젝트/태스크 다이얼로그의 메모 탭으로 일원화.
- **MiniCalendar 제거**: 사이드바 공간 회수, 퀵 필터(지연/오늘/이번주/다음주)로 충분히 커버.

---

## Supabase 프로젝트

- Project ID: `eytonzxeogdfeuvxtuwh`
- Region: ap-northeast-2 (서울)
- Auth: 이메일/비밀번호, Google OAuth

## Vercel 배포

- Project ID: `prj_YumDJtKv90Kdbsd4DRclJvWUOoQP`
- Team ID: `team_Bz6jHioMJrz5bNuaCk1yBfaK`
- GitHub 푸시 → Vercel 자동 배포 (git integration 연동됨)
- Vercel CLI 미설치 — 배포는 git push로만 진행

---

## 미구현 / 예정

- **주간보고** (`/weekly`): 플레이스홀더만 있음
- **설정** (`/settings`): 플레이스홀더만 있음
- **Timeline** (`/timeline`): UI 프로토타입 완료, DB/실데이터 연결 필요 (현재 mock)
- **태스크 드래그 정렬**: 칸반 컬럼 간 상태 변경은 되지만, 같은 그룹/컬럼 내 순서 변경은 미구현
- **GanttChart.tsx 분리 리팩토링**: 1,150줄 → 1k 라인 제한 준수
- **태스크 자체 undo/redo**: 의도적 미구현 (필요해지면 추가)

---

## 이번 세션 (`2026-05-15 ~ 16`) 주요 변경 요약

### A. 다른 에이전트가 한 작업
- **AppNav 라벨 영문화** (`Schedule/Task/Weekly/Timeline/Settings`) + Timeline 네비 추가
- **신규 `/timeline` 페이지** — 브랜드별 이력 mock UI (이슈/결정/태스크/문서/슬랙)
- **GanttToolbar 재설계** — 검색 토글, 필터/정렬 드롭다운, 지연·시작지연 배지+필터
- **Ghost compare 제거** — `getProjectsGhostDates`, `ghostDates`, `handleToggleGhost`, `PROJ_ROW_H_CMP` 일괄 삭제
- **MemoPanel 삭제** — hover 풍선말 + 다이얼로그 탭으로 대체
- **CategoryFormDialog 색상 선택 도입** — `handleAddCategory(name, color)`, `handleUpdateCategory(id, updates)`
- **DEVLOG 구조 정비** — 페이지 표, 5뷰, 라벨/하위태스크/공유 등 누락 항목 추가
- `시작 지연 (isStartDelayed)` 도입 (TaskRow/KanbanView에 시작 지연 배지)

### B. 이번 세션에서 한 작업
- **DB**: `gantt_task_history` 테이블 + 트리거 + RLS 정책 추가. 트리거 SECURITY DEFINER 보강
- **태스크 페이지 UX 통일**:
  - 사이드바: MiniCalendar 제거, 담당자 상위 7명+더보기, 퀵필터 5종(토글 해제 가능)
  - TaskRow: 우선순위 폰트 강조, 우측 클러스터 제거, `sub +` 부활, 메모 hover 풍선말
  - ListView: 행 클릭=편집, 메모 컬럼, 하위태스크 들여쓰기, 인라인 퀵 등록, sub+ + 부모별 sub 입력, 상태 블릿+텍스트, 정렬 ↕ 표시
  - KanbanView: 미니멀 카드(ring), 카드 우측 클러스터 제거, 인라인 퀵 등록, 메모 hover 풍선말
  - GanttView: 우선순위/Done/메모/하위 들여쓰기, 마감초과·시작지연 바 컬러링, 시작일→마감일→sort_order 정렬, 좌측 폭 드래그 리사이즈
  - CalendarView: 좌측 컬러 막대 + 라운드 칩, 우선순위 강조, 메모 점, **마감일만** 표시
  - TaskDetailDrawer: 정보/메모/이력 3탭, 필드 순서 정렬(제목→상태/담당→일정→우선순위→프로젝트→라벨), 이력 섹션 신규
- **다이얼로그/드로어 공통**: 연결 프로젝트 picker 클릭만으로 전체 보드별 그룹 노출
- **인라인 퀵 등록 통일**: Enter 연속, Esc/빈 blur 취소, 부모 sub+에서 sub 인라인 등록 (프로젝트 상속)
- **메모 풍선말 통일**: 6곳 모두 `clampTooltipPos` + `text-[11px]` + 하단 자동 플립
- **폰트/색상 정합성**:
  - 풍선말 `text-[11px]` 통일 (gantt 메인 `text-xs` 였던 곳 수정)
  - 라벨 칩 9px로 축소
  - 우선순위 톤: rose-bold → rose-400 semibold로 톤다운
  - 모든 "+ 추가" 버튼 black 톤 (`bg-gray-900 hover:bg-black`, 인라인 `hover:text-gray-900`)
- **버그 수정**: 캘린더 시작일 마커 제거(사용자 요청), 12월 헤더 줄바꿈 깨짐, 사이드바 퀵필터 토글 해제 안 되던 문제, 트리거 RLS로 done 처리 안 되던 문제
- **기타**: 로그인 페이지 타이틀 `Wald Gantt` → `Wald Task Manager`
