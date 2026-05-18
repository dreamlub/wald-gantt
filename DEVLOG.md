# Wald Gantt — 개발 로그

## 최근 변경 (2026-05-18) — UX 레이블 정리 + 완료 포함 토글 이동

### 1. 정렬 기본값 레이블 변경 (`GanttToolbar.tsx`, `settings-shell.tsx`)
- `'기본'` → `'입력순'` — 입력 순서를 유지한다는 의미를 명확히 표현

### 2. '완료 포함' 토글 — 태스크 액션바에 추가 (`TasksActionBar.tsx`, `page.tsx`)
- 완료 숨김 토글을 사이드바 눈 아이콘 외에 본문 상단 액션바에도 추가
- 캘린더 task-panel과 동일한 role="switch" 스타일
- `hideDone` / `onHideDoneChange` props 추가, `filters.hideDone`·`filters.setHideDone` 연결

### 3. 레이블 통일: `'완료'` → `'완료 포함'` (`TasksActionBar.tsx`, `task-panel.tsx`)
- 태스크 액션바·캘린더 패널 양쪽에서 동일한 표현으로 통일

### 4. 캘린더 task-panel 폰트 크기 개선 (`task-panel.tsx`)
- 정렬 콤보박스 트리거·드롭다운 항목: `text-[11px]` → `text-xs`
- ChevronDown 아이콘: `size={10}` → `size={12}`
- "완료 포함" 레이블: `text-[10px]` → `text-xs`

---

## 최근 변경 (2026-05-18) — SSR 호환성 버그 수정 2건

### 1. `localStorage is not defined` 수정 (`GanttChart.tsx`)
- **원인**: `useState` 초기화 함수에서 `localStorage`를 직접 참조 — `'use client'` 컴포넌트도 SSR 시에는 `window`/`localStorage`가 없음
- **수정**: `typeof window !== 'undefined'` 가드 추가 (viewMode, sortMode 2곳)
- `localStorage`가 없는 환경(SSR)에서는 `null` → 기본값(`'week'`, `'default'`) 사용

### 2. React 19 + next-themes script tag 경고 수정 (`providers.tsx`)
- **원인**: React 19에서 JSX로 렌더링된 `<script>` 태그는 클라이언트에서 자동 실행되지 않음 — `next-themes`의 ThemeProvider가 테마 감지용 script를 주입하면서 발생
- **수정**: `next/dynamic`으로 `ThemeProvider`를 `ssr: false`로 dynamic import → SSR 시점에 script 주입 차단
- `<html suppressHydrationWarning>`이 기존에 설정되어 있어 하이드레이션 불일치는 무해하게 처리됨

---

## 최근 변경 (2026-05-18) — 캘린더 연동 딥링크 + 간트 설정 영속성

### 1. 태스크 → 캘린더 딥링크 (`TaskRow.tsx`, `calendar-shell.tsx`)
- **기능**: TaskRow의 스케줄 시간 뱃지 클릭 시 `/calendar?highlight=<id>`로 이동
- **캘린더**: `?highlight` 파라미터 감지 → 해당 태스크의 주로 자동 이동 + 하이라이트
- 이동 완료 후 `router.replace('/calendar')`로 URL 파라미터 제거
- `highlightTaskId` → `TimeGrid`에 `highlightTaskId`, `onHighlightClear` prop으로 전달

### 2. 태스크 스케줄 시간 뱃지 개선 (`TaskRow.tsx`)
- `duration_minutes` 있을 때 종료 시각 계산해 `시작 ~ 종료` 형식으로 표시
- 기존 `<span>` → `<Link>` 컴포넌트로 교체, `e.stopPropagation()` 으로 행 클릭과 분리

### 3. 캘린더 좌측 패널 UX 개선 (`task-panel.tsx`)
- **정렬 UI**: 버튼 나열 → 드롭다운 콤보박스로 변경 (외부 클릭 닫힘 처리 포함)
- **완료 숨김 토글**: 스위치 UI 추가, 완료 태스크는 항상 목록 하단 정렬
- **검색창**: `Input` → 네이티브 `<input>`, Escape 키로 검색어 초기화

### 4. TooltipProvider 전역 등록 (`layout.tsx`)
- 앱 레이아웃(`(app)/layout.tsx`)에 `<TooltipProvider>` 래핑 추가
- 기존 각 페이지별 개별 등록 불필요
- `src/components/ui/tooltip.tsx` 신규 생성

### 5. 간트 설정 localStorage 영속성 (`GanttChart.tsx`, `settings-shell.tsx`)
- `viewMode` / `sortMode` 초기값을 `localStorage`에서 읽어 복원
- 변경 시 `changeViewMode()` / `changeSortMode()` 헬퍼가 localStorage에 즉시 저장
- **Settings 연동**: `wald.gantt.view` → `wald.gantt.viewMode` 키 통일, 정렬 기본값(`wald.gantt.sortMode`) 설정 항목 추가

### 6. 간트 공유 모드 빈 행 숨김 (`_GanttRows.tsx`)
- `readOnly` 일 때 카테고리 하단 빈 행(`PROJ_ROW_H`) 미렌더링

---

## 최근 변경 (2026-05-18) — UI 버그 수정 3건

### 1. 사이드바 완료 눈 아이콘 위치 수정 (`TasksSidebar.tsx`)
- **문제**: 눈 아이콘(완료 숨김 토글)이 카운트 숫자 뒤에 렌더링됨
- **원인**: 눈 버튼이 메인 버튼 바깥(형제 요소)에 있어서 `[dot] [완료] [6] [👁]` 순서가 됨
- **수정**: `<span role="button">`으로 눈 버튼을 메인 버튼 내부로 이동, 카운트 앞에 배치 → `[dot] [완료] [👁] [6]`
- 외부 wrapper `<div>` 제거, 버튼 구조 단순화

### 2. 구글 캘린더 블록 풍선말 교체 (`event-block.tsx`)
- **문제**: 구글 캘린더 이벤트 블록이 브라우저 기본 `title` 속성으로 풍선말을 표시함 (태스크 블록과 다른 UX)
- **수정**: 네이티브 `title` 제거, 커스텀 `Tooltip` 컴포넌트 적용
- 풍선말 내용: 제목(bold) + 시간 범위 + 장소(`location`, 있을 때) + 설명(`description`, 있을 때)

### 3. 태스크 캘린더 블록 풍선말 시간 추가 (`task-block.tsx`)
- **문제**: 태스크 블록 풍선말에 제목만 표시됨 (구글 블록과 달리 시간 없음)
- **수정**: `fmtTime(scheduled_at)` + `duration_minutes`로 종료 시각 계산해 `시작 – 종료` 형식으로 추가
- `toMinutes` 유틸 import 추가

### 4. 공유 페이지 간트 스크롤 동기화 버그 수정 (`GanttChart.tsx`)
- **문제**: 공유 URL(`/share/[token]`) 에서 스크롤 시 프로젝트 목록(좌)과 간트 바(우)가 엇갈림
- **원인 1**: React의 `onWheel`은 passive 리스너라 `e.preventDefault()` 불가 → wheel 이벤트가 body/상위 컨테이너로 전파되어 이중 스크롤 발생
- **원인 2**: `e.deltaMode` 미처리 — Windows 마우스는 `deltaMode=1`(줄 단위)인데 `deltaY` 값을 픽셀로 취급해 실제 스크롤량의 1/16만 적용됨
- **수정**:
  - `onWheel` 제거 → `useEffect`로 non-passive `addEventListener('wheel', handler, { passive: false })` 등록
  - `deltaMode` 정규화: `1(줄) × 16px`, `2(페이지) × clientHeight`
  - `rightRef`에 `overscrollBehavior: contain` 추가 → 스크롤 체이닝 차단

---

## 최근 변경 (2026-05-18) — 프로젝트 코드 리뷰 & 리팩터링

### 배경
프로젝트 전체 코드 리뷰 수행. tasks/page.tsx 메가 컴포넌트, GanttChart DOM 직접 조작, any 타입, 매직넘버, 중복 함수 등 7개 항목 발견 후 전부 처리.

### 1. tasks/page.tsx 분리 (1286줄 → 190줄)
- **커스텀 훅 5개** (`_hooks/`): use-tasks-data, use-task-filters, use-task-drag, use-task-selection, use-quick-add
- **하위 컴포넌트 4개** (`_components/`): TasksSidebar, TasksActionBar, NormalView, BulkActionBar
- useState 68개 → page.tsx에 10개만 남기고 훅으로 분산

### 2. GanttChart DOM 직접 조작 → React state
- `document.createElement` × 4 (overlay, tooltip) → `barDrag` state + JSX 선언적 렌더링
- 메모리 누수 원천 차단 (`setBarDrag(null)`로 cleanup)

### 3. useMemo 메모이제이션
- `use-task-filters.ts`: 통계/사이드바 데이터/필터링 결과/파생 그룹 4곳
- `GanttChart.tsx`: yearGroups, monthGroups, gridLinePositions 3곳
- 드래그/hover 등 잦은 리렌더 시 불필요한 O(n) 재계산 방지

### 4. any 타입 제거 (6곳 → 0곳)
- `_GanttRows.tsx`: `listeners: any` → `ReturnType<typeof useSortable>['listeners']`
- `gantt-service.ts`: `(member as any)` → 명시적 캐스팅, `(row: any)` → `TaskRow`/`ProjectRow` 타입

### 5. 빈 catch 블록 에러 로깅
- `supabase/server.ts`: `catch {}` → `catch (e) { console.warn(...) }`

### 6. 날짜 포맷 함수 중복 제거
- `gantt-utils.ts`에 `formatHistValue()`, `formatHistDate()` 공통화
- `ProjectFormDialog.tsx`, `TaskHistorySection.tsx` 로컬 함수 제거 → import

### 7. 매직넘버 상수화
- `MS_PER_DAY` (gantt-utils) — `864e5`/`86_400_000` 8곳 교체
- `AVG_DAYS_PER_MONTH` (GanttChart) — `30.4375` 주석 포함 상수화

### 8. 완료 숨김 토글 + 자동 아카이브
- **완료 숨김 토글**: 사이드바 '완료' 항목 옆 눈 아이콘(Eye/EyeOff), localStorage에 설정 저장
- **자동 아카이브**: DB `archived_at` 컬럼 추가, 페이지 로드 시 완료 후 7일 경과 태스크 자동 아카이브
- **아카이브 패널**: Drawer UI로 아카이브된 태스크 열람/복원 가능
- **사이드바**: 아카이브 버튼 + 카운트 배지 추가 (휴지통 위)
- 아카이브 기간 설정은 향후 Settings에서 조정 예정

### 9. 사이드바 '완료' 퀵필터 추가
- 퀵필터 목록 하단에 '완료' 항목 추가 (초록색 dot, done 카운트)
- 클릭 시 done 상태 태스크만 필터링

### 9. DnD 핸들러 패턴 공용화
- `dnd-utils.ts` 신규 — `useDndSensors`, `useDndSensorsPointer`, `computeReorder`, `findContainer`
- 3곳(use-task-drag, GanttChart, BoardSidebar)에서 센서 설정/재정렬/컨테이너 탐색 중복 제거

---

## 최근 변경 (2026-05-18) — Calendar 코드 리팩터링

### 배경
캘린더 코드 리뷰에서 중복 코드, God Component, 성능 문제, 디자인시스템 미준수 발견. 4단계에 걸쳐 리팩터링 수행.

### Step 1: 중복 코드 제거
- `calendar/_constants.ts` 신규 — 상수 11개 + SortKey 타입 통합
- `calendar/_utils.ts` 신규 — 유틸 함수 18개 + LayoutItem 타입 통합
- 7개 컴포넌트에서 복붙된 로컬 함수/상수 삭제, import 교체
- 매직넘버 `8` → `WORK_HOURS_PER_DAY` 상수로 교체

### Step 2: 커스텀 훅 추출
- `calendar/_hooks/use-calendar-data.ts` 신규 — useState 7개 + useCallback 12개
- `calendar-shell.tsx` 515줄 → 290줄 (43% 축소), JSX만 남김

### Step 3: useMemo 추가
- `use-calendar-data.ts`: assigneeSuggestions, allLabels
- `calendar-shell.tsx`: weekDates, allDayEvents, allDayTasks, timedTasks
- `time-grid.tsx` DayColumn: layoutData (calcLayout O(n²) × 7컬럼 → 변경 시에만)

### Step 4: shadcn 공통 컴포넌트 전환
- `calendar-shell.tsx` raw `<button>` 8개 → shadcn `Button`
- `task-panel.tsx` 닫기 → `Button`, 검색 → shadcn `Input`

---

## 최근 변경 (2026-05-18) — Tasks UX 대폭 개선

### 변경 내역

**TaskDetailDrawer 하위태스크 인라인 입력**
- "하위 태스크 추가" 버튼 클릭 → 드로어 안에서 인라인 입력 필드 노출 (기존: 드로어 닫히고 본문에서 입력)
- Enter 연속 입력 가능, Esc 취소
- 하위태스크 생성 시 부모 속성 전체 상속 (status, type, assignee, start_date, due_date, priority, labels, projects). memo는 제외

**부모-하위 태스크 자동 완료 연동**
- 부모 완료 → 미완료 하위태스크 일괄 완료 + 토스트 알림
- 하위 전체 완료 → 부모 자동 완료 (기존 유지)

**태스크 드래그 순서 변경**
- `DraggableTaskRow`: `useDraggable` → `useSortable` 교체
- 같은 상태 그룹 내 순서 변경 + 다른 상태 그룹으로 이동 시 상태 변경 + 정확한 위치 삽입
- 그룹별 `SortableContext` + `onDragOver`로 타겟 그룹 추적, `getSortableIds`가 드래그 아이템을 타겟 그룹에 동적 삽입
- collision detection: `pointerWithin` + `rectIntersection` 조합
- 드래그 시작 시 하위태스크 자동 접기, 종료/취소 시 복원
- 드래그 중 원본 `opacity-0`으로 DragOverlay 중첩 방지

**라벨 자동완성**
- `TaskDetailDrawer` / `TaskFormDialog`: 라벨 입력에 자동완성 드롭다운 추가
- 기존 라벨 목록에서 필터링, 색상 점 표시, 클릭으로 즉시 추가
- Calendar 드로어에도 `labelSuggestions` 전달
- `TaskFormDialog`에 라벨 입력 UI 신규 추가 (`onSave`에 `labels` 필드 추가)

**메모 풍선말 높이 제한**
- `TaskRow` / `MemoTooltip`: `max-h-[60vh]` → `max-h-48` (192px), `overflow-hidden`

**메모 호버 버튼 개선**
- 색상 `text-ink-200` → `text-ink-300`, hover `text-lilac-500`로 가시성 향상
- 메모 유무 관계없이 클릭 시 항상 메모 탭으로 드로어 오픈

**태스크 행 삭제 호버 버튼**
- 태스크 제목 영역 안(sub+ 버튼 옆)에 Trash2 아이콘 삭제 버튼 추가
- 호버 시에만 표시, `hover:text-status-late` 강조

**상위 태스크 표시 개선**
- TaskDetailDrawer: 상위 태스크 텍스트 `text-[11px]` → `text-sm font-medium` 크게 변경

**Google Calendar OAuth 진단**
- `.env.local`에 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` 미설정 → `invalid_client` 오류
- Vercel 환경변수 추가 + Google Cloud Console 리디렉션 URI(`www.ggugong.com`) 등록 안내

### 수정된 파일
- `src/app/(app)/tasks/_components/TaskDetailDrawer.tsx` — 인라인 하위태스크 입력, 라벨 자동완성, 상위 태스크 크게
- `src/app/(app)/tasks/_components/TaskRow.tsx` — `useSortable`, 삭제 버튼, 메모 버튼 개선, 드래그 opacity
- `src/app/(app)/tasks/page.tsx` — 드래그 순서 변경, 부모-하위 자동완료, 라벨 수집/전달
- `src/components/tasks/TaskFormDialog.tsx` — 라벨 입력 UI + 자동완성 추가
- `src/app/(app)/calendar/_components/calendar-shell.tsx` — 하위태스크 부모 속성 상속, labelSuggestions 전달
- `src/components/MemoTooltip.tsx` — max-h 제한

---

## 최근 변경 (2026-05-18) — Calendar UX 개선

### 변경 내역

**타임그리드 확대** (`time-grid.tsx`, `task-block.tsx`)
- `HOUR_H`: 60 → 80 (1시간 높이 확대)
- `SNAP_MIN`: 15 → 30 (드래그 스냅 간격 30분)
- 기본 블록 duration: 60분 → 30분 (0.5h)

**블록 스타일 개선** (`task-block.tsx`, `event-block.tsx`)
- 블록 하단 2px 패딩 (`height - 2`)
- 내부 텍스트 간격 축소: `py-2` → `py-1`, `gap-1` → `gap-0.5`
- 태스크 블록 레이아웃 변경: 1행 체크+태스크명 / 2행 시간 (순서 반전)
- 체크박스 축소: `w-3.5 h-3.5 border-2` → `w-2.5 h-2.5 border-[1.5px]`
- 중복 뱃지 제거

**업무가능시간 계산 변경** (`calendar-shell.tsx`)
- 업무시간 슬롯: 9~12시 + 13~18시 = 8h (점심 제외)
- 구글 이벤트가 업무시간 슬롯과 겹치는 부분만 차감
- 태스크 시간은 차감에서 제외

**레이아웃 통일** (`calendar-shell.tsx`)
- 사이드바 너비: 256 → 240 (간트와 동일)
- 태스크 추가 버튼: 간트 프로젝트 추가 버튼 스타일로 통일
- 날짜 헤더 축소: `h-12` → `h-8`, `text-sm` → `text-xs`, 오늘 원 `w-7 h-7` → `w-5 h-5`
- sticky top 보정: 업무가능 행 `top-12` → `top-8`, ALL-DAY 행 `top-[76px]` → `top-[60px]`

**미배정 태스크 시각 구분** (`task-panel.tsx`)
- 미배정: 상태 색상 8% 배경 + 4px 좌측 보더
- 배정됨: 흰 배경 + 3px 좌측 보더 + opacity 낮춤

**z-index 정리**
- `ScrollToTopButton`: `z-50` → `z-40` (Drawer 중첩 방지)
- 현재시간 줄: `z-20` → `z-10` (sticky 헤더 아래로)

### 수정된 파일
- `src/app/(app)/calendar/_components/calendar-shell.tsx`
- `src/app/(app)/calendar/_components/event-block.tsx`
- `src/app/(app)/calendar/_components/task-block.tsx`
- `src/app/(app)/calendar/_components/task-panel.tsx`
- `src/app/(app)/calendar/_components/time-grid.tsx`
- `src/components/ScrollToTopButton.tsx`

---

## 최근 변경 (2026-05-17) — 공통 컴포넌트 추출 리팩터링

### 변경 내역

**`MemoTooltip` 공통화** (`src/components/MemoTooltip.tsx` 신규)
- `ListView.tsx` / `KanbanView.tsx`에 중복 존재하던 12줄 인라인 메모 툴팁 블록을 단일 컴포넌트로 추출
- `clampTooltipPos` (`tasks/_utils.ts`) import 유지 — 화면 하단 50% 이상 시 bottom 앵커 플립

**`EmptyState` 공통화** (`src/components/ui/empty-state.tsx` 신규)
- `TrashPanel` / `TaskTrashPanel` 등에 분산된 빈 상태 UI를 단일 컴포넌트로 추출
- Props: `icon? / title / description? / action? / className?`

**`SectionLabel` 공통화** (`src/components/ui/section-label.tsx` 신규)
- `text-[10px] font-semibold text-ink-400 uppercase tracking-wider` 패턴 컴포넌트화

**`formatDateYMD` 중앙화** (`src/lib/gantt-utils.ts`)
- `TrashPanel` / `TaskTrashPanel` 각자 정의하던 `formatDate` 로컬 함수 삭제
- `gantt-utils.ts`에 `formatDateYMD(iso: string): string` 추가 후 두 파일 모두 참조

### 수정된 파일
- `src/app/(app)/tasks/_components/ListView.tsx` — `MemoTooltip` 적용, 인라인 블록 제거
- `src/app/(app)/tasks/_components/KanbanView.tsx` — 동일
- `src/components/gantt/TrashPanel.tsx` — `EmptyState` + `formatDateYMD` 적용, 로컬 `formatDate` 제거
- `src/components/tasks/TaskTrashPanel.tsx` — 동일

---

## 최근 변경 (2026-05-17) — Weekly 대시보드 데이터 수집·저장 인프라 정비

### 변경 내역

**AISummaryCard 헤더 동적 제목** (`weekly-dashboard.tsx`)
- `"AI 주간 요약"` 고정 텍스트 → `getWeekTitle(weekStart)` 함수로 동적 생성
- 형식: `"N월 M주 전체 요약"` (예: "5월 2주 전체 요약")

**ItemRow dotCls Runtime TypeError 수정** (`weekly-dashboard.tsx`)
- `item.type`이 `TYPE_META`에 없는 값일 때 `undefined.dotCls` 크래시 발생 수정
- `FALLBACK_META = { label: '기타', dotCls: 'bg-ink-300', badgeCls: 'bg-ink-100 text-ink-500' }` 추가
- `TYPE_META[item.type]` → `TYPE_META[item.type as keyof typeof TYPE_META] ?? FALLBACK_META`

**weekly_reports 테이블 UNIQUE 제약 추가** (Supabase migration)
- `(workspace_id, source, team, week_start)` 조합에 UNIQUE 제약 `weekly_reports_unique_key` 추가
- ON CONFLICT upsert가 동작하지 않던 문제 해결

**5/11 주차 데이터 수집·저장** (Outline MCP → Supabase)
- Outline MCP로 6개 문서 수집: Biz Lead Board, DX기획1/2팀, 핵심고객지원팀, UX디자인팀, DX담당
- 올바른 포맷(`{type, title, detail, brand, date}`)으로 구조화 후 DB upsert 완료
- 총 13개 레코드 저장 (biz_lead 8팀 + team_doc 5팀)

---


## 최근 변경 (2026-05-17) — Calendar 디자인시스템 정합성 개선

### 변경 내역

**중복 상수 제거**
- `calendar-shell.tsx`, `task-panel.tsx`, `task-block.tsx`에 각각 로컬 정의되어 있던 `STATUS_COLOR`, `STATUS_BG` 삭제
- `@/app/(app)/tasks/_constants`의 `STATUS_COLOR`, `STATUS_BG_COLOR`, `STATUS_LABEL` import로 통일

**Google 로고 SVG 공유화** (`event-block.tsx`)
- 로컬 `function GoogleIcon()` → `export function GoogleIcon({ size = 9 })` 로 export
- `calendar-shell.tsx`의 인라인 SVG 중복 제거 → `<GoogleIcon size={8} />` 참조

**하드코딩 색상 → CSS 변수** (`globals.css`, `calendar-shell.tsx`)
- globals.css에 캘린더 전용 변수 추가: --color-google-primary, --color-day-sun, --color-day-sun-muted, --color-day-sat, --color-day-sat-muted
- #4285f4 → var(--color-google-primary)
- 일/토 날짜 색상: Tailwind 토큰 하드코딩 → style prop + CSS 변수로 교체

**ALL-DAY 태스크 배경 일치** (`calendar-shell.tsx`)
- `color-mix(in srgb, ${color} 12%)` → `STATUS_BG_COLOR[task.status]` (task-block과 동일 방식)

**드롭 영역 색상 상수화** (`drag-state.ts`)
- `DRAG_OVER_BG = 'bg-lilac-100/30'` 상수 추가
- `time-grid.tsx`, `task-panel.tsx`, `calendar-shell.tsx` 3곳의 리터럴 → 참조로 교체

**폰트 크기 수정** (`calendar-shell.tsx`)
- ALL-DAY 시간 표시에 누락된 `text-[10px]` 추가
- 업무가능 시간: `text-[10px]` → `text-xs`, `font-medium` → `font-semibold`

**태스크 추가 버튼** (`calendar-shell.tsx`)
- DB 사전 생성 방식 제거 → `TaskFormDialog` 컴포넌트 재사용 (태스크 페이지와 동일)

---

## 최근 변경 (2026-05-17) — Tasks 라벨 필터·상태 행 구분 개선

### 변경 내역

**라벨 필터 — 하위태스크 표시 수정** (`page.tsx`)
- 라벨이 부모 태스크에 있을 때 → 하위태스크도 라벨 무관하게 함께 표시
- 라벨이 하위태스크에 있을 때 → 부모 태스크도 함께 복원되어 트리 렌더링 정상 동작
- `preLabel` 변수 추가: 라벨 필터 적용 전 풀을 저장해 부모 복원 시 참조
- 부모 복원 조건에 `|| !!filterLabel` 추가, `parentPool` 분기로 label 케이스 처리

**라벨 필터 버튼 — 활성 상태 표시 수정** (`page.tsx`)
- 기존 `ringColor: bg` (유효하지 않은 CSS 속성)로 링이 실제로 적용되지 않던 버그 수정
- 비선택: 투명 배경 + 라벨 색상 텍스트 + 라벨 색상 테두리
- 선택: 라벨 색상 배경 + 역상 텍스트 (fill → 역상 방식)

**상태 그룹 헤더 배경 구분** (`page.tsx`)
- 지연·STATUS_GROUPS 헤더: `bg-card` → `bg-muted` (태스크 행과 시각적 구분)
- hover: `hover:bg-muted` → `hover:bg-accent/40`

---

## 최근 변경 (2026-05-17) — Calendar 헤더·날짜·통계·드래그 개선

### 변경 내역

**툴바 재설계** (`calendar-shell.tsx`)
- "CALENDAR" 텍스트 제거
- 날짜 범위 레이블을 `< 5/17 ~ 5/23 (2026년 20W) >` 형태로 nav 버튼 사이에 배치
- Google Calendar 버튼: 미연결(NO_TOKEN/TOKEN_EXPIRED) 시 주황 배지 "Google 연결" → `handleConnectGoogle`, 연결 시 기존 새로고침 버튼
- 필터 버튼 제거
- "이벤트 추가" → "태스크 추가": 클릭 시 빈 태스크 DB 생성 후 TaskDetailDrawer 오픈

**날짜 헤더** (`calendar-shell.tsx`)
- 일요일 날짜·요일: blue-500 / blue-400
- 토요일 날짜·요일: red-500 / red-400
- 요일 폰트 크기: `text-[10px]` → `text-sm` (날짜 숫자와 동일)

**통계 행** (`calendar-shell.tsx`)
- "업무 Xh / 구글 Xh" → "업무가능 Xh" (8h에서 업무+구글 시간 차감)
- ALL-DAY 태스크가 있는 날은 업무가능 0h 표시 (주황색)
- 2h 이하는 status-late 색상으로 강조

**ALL-DAY → 타임그리드 드래그 수정** (`calendar-shell.tsx`)
- ALL-DAY 셀의 `onDragOver`/`onDrop`에서 `from-all-day` 타입 드래그 차단
- from-all-day 드래그 시 ALL-DAY 행이 drop target이 되지 않아 타임그리드까지 도달 가능

**태스크 패널 정렬 UI** (`task-panel.tsx`)
- "정렬" 레이블 텍스트 제거
- 미선택 뱃지 배경: `bg-background` (흰색)
- 태스크명·뱃지 간격: `mt-0.5` → `mt-1.5`

---

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

insights                                 ← AI 주간 분석 캐시 (Slack 기반)
  id, workspace_id, week_start DATE
  content JSONB, analyzed_at, source_count INT
  created_at, updated_at
  UNIQUE (workspace_id, week_start)

weekly_sources                           ← Weekly Outline 연동 설정
  id, workspace_id, label, collection_id, sort_order, created_at
  RLS: workspace_members 기준

weekly_reports                           ← Outline 수집 raw 데이터
  id, workspace_id, source, team, author, week_start
  raw_content TEXT, summary JSONB, created_at, updated_at
  UNIQUE INDEX: (workspace_id, source, team, COALESCE(author,''), week_start)
  RLS: workspace_members 기준

weekly_insights                          ← Weekly AI 종합 인사이트
  id, workspace_id, week_start DATE
  content JSONB, analyzed_at, created_at
  UNIQUE (workspace_id, week_start)
  RLS: workspace_members 기준
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
│   │   │       ├── event-block.tsx         # Google Calendar 이벤트 블록
│   │   │       └── drag-state.ts           # dragstart offsetY 모듈 공유 (브라우저 제한 우회)
│   │   ├── weekly/
│   │   │   ├── page.tsx
│   │   │   ├── _lib/
│   │   │   │   └── types.ts               # WeekSection, WeeklyDoc
│   │   │   └── _components/
│   │   │       ├── weekly-shell.tsx        # 오케스트레이터 (fetch + 사이드바/대시보드 조합)
│   │   │       ├── weekly-sidebar.tsx      # 주 목록 (NEW 배지, 주 레이블, 월별 구분선)
│   │   │       └── weekly-dashboard.tsx    # 매니저 대시보드 (AI 요약·스탯·탭 4종)
│   │   ├── summary/
│   │   │   ├── page.tsx
│   │   │   ├── _components/
│   │   │   │   ├── history-shell.tsx       # 오케스트레이터 (뷰/필터 상태, 연동 다이얼로그)
│   │   │   │   ├── history-sidebar.tsx     # 기간/브랜드/태그/중요도/주 네비게이터
│   │   │   │   ├── table-view.tsx          # 테이블 뷰 (우선순위별 타이틀 색상, 검색어 Highlight)
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
│   │           ├── settings-shell.tsx      # 6섹션 (계정/연동/화면/브랜드/Weekly 연동/데이터)
│   │           └── brand-drawer.tsx        # 브랜드 편집 Drawer (이름/색상/키워드/삭제)
│   ├── api/
│   │   ├── insights/generate/route.ts      # SSE 스트리밍 인사이트 분석 API
│   │   ├── weekly/
│   │   │   ├── teams/route.ts              # weekly_sources 목록 반환 (GET)
│   │   │   ├── ai-summary/route.ts         # Claude Haiku SSE 주간보고 요약 (간이)
│   │   │   └── analyze/route.ts            # 2단계 AI 분석 SSE (weekly_reports→insights)
│   │   ├── calendar/
│   │   │   ├── events/route.ts             # Google Calendar 이벤트 조회 (주간 범위)
│   │   │   ├── auth/route.ts               # Google OAuth 시작
│   │   │   ├── callback/route.ts           # Google OAuth 콜백
│   │   │   └── disconnect/route.ts         # Google Calendar 연동 해제
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
│   ├── MemoTooltip.tsx                     # 메모 풍선말 (clampTooltipPos 적용, ListView/KanbanView 공용)
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
│       ├── drawer.tsx                      # Drawer/DrawerHeader/DrawerBody/DrawerFooter 공통
│       ├── empty-state.tsx                 # 빈 상태 UI (icon/title/description/action)
│       └── section-label.tsx              # 섹션 레이블 칩 (10px/semibold/uppercase/tracking)
├── hooks/
│   ├── use-confirm.tsx
│   ├── use-undo-redo.ts
│   └── use-vault-handle.ts                 # IndexedDB FileSystemDirectoryHandle 영속 관리
├── lib/
│   ├── gantt-service.ts                    # CRUD + bulkSoftDelete/bulkUpdateStatus/duplicateTask
│   ├── gantt-utils.ts                      # toDate, toDateStr, isLightColor 등
│   ├── daily-note.ts                       # 경로 패턴 + readNote/writeNote
│   ├── insight-service.ts                  # getInsight / generateInsight SSE 클라이언트
│   ├── weekly-service.ts                   # getWeeklyReports/upsertWeeklyReport/getWeeklyInsight/analyzeWeekly
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

## 최근 변경 (2026-05-17) — Weekly DB 완전 전환 (Outline 의존성 제거)

### 배경
대시보드(3단계)가 DB에서 데이터를 읽게 되면서, 사이드바 주차 목록만 여전히 Outline API에 의존하는 불일치 상태였음. DB 완전 전환으로 통일.

### 변경 내용
- **`weekly-service.ts`**: `getWeeklyWeeks(team)` 추가 — `weekly_reports`의 고유 `week_start` 내림차순 반환 (RLS 자동 스코핑)
- **`weekly-shell.tsx`**: Outline `fetchDoc` → `fetchWeeks(teamLabel)` 교체, `doc(WeeklyDoc)` 상태 제거, `weeks: string[]`로 단순화
- **`weekly-sidebar.tsx`**: `weeks: WeekSection[]` → `weeks: string[]` (week_start ISO 문자열 배열), 네비게이터 표시는 `.replace(/-/g, '.')` 변환
- **`_lib/types.ts`**: `WeekSection` / `WeeklyDoc` 타입 삭제 (데드코드)
- **`api/weekly/route.ts` 삭제**: Outline 컬렉션 기반 주차 탐색 라우트 제거

### 결과
- `weekly_sources.collection_id` 는 DB에 남아있지만 Weekly 페이지에서 더 이상 사용하지 않음
- 주차 목록 = `weekly_reports`에 수집된 데이터 기준
- Outline API, Outline 연동 코드 Weekly 페이지에서 완전 제거

---

## 최근 변경 (2026-05-17) — Weekly 매니저 대시보드 (3단계)

### 신규: `weekly-dashboard.tsx`
- `WeeklyDashboard` 컴포넌트 — AI 요약 카드 + 스탯 행 + 탭별 뷰
- **AISummaryCard**: headline + changes(전주 대비) + 다시 요약 버튼 + ProgressBar SSE 진행
  - `analyzeWeekly` SSE 호출, per-report 진행에 따라 progress 단계적 업데이트
- **StatsRow**: 리포트 작성 / 이슈 / 결정사항 / 다음주 계획 · count + delta (▲▼)
- **탭 4개**: 종합(AllView) / 팀별(TeamView) / 브랜드별(BrandView) / 담당자별(AssigneeView)
  - 각 탭: `weekly_reports.summary.items` 그룹화 + type별 색상 dot + 브랜드/담당자 hash→ASSIGNEE_COLORS
- 빈 상태: 보고서 없음 / 인사이트 미분석 구분 메시지
- `DashboardTab` / `DASHBOARD_TABS` export → weekly-shell 헤더 탭에서 사용

### 수정: `weekly-shell.tsx`
- `tab(DashboardTab)` + `reports(WeeklyReport[])` + `insight(WeeklyInsight|null)` + `dashLoading` 추가
- `selectedIso` 변경 시 `getWeeklyReports` + `getWeeklyInsight` 병렬 fetch
- 헤더(h-12) 우측 탭 버튼 4개 (`DASHBOARD_TABS`)
- 메인 콘텐츠: `WeeklyDashboard` (기존 `WeeklyContent` + `WeeklyAiSummary` 대체)
- `onRefresh`: 분석 완료 후 reports + insight 재조회 콜백

### 삭제 (데드코드)
- `weekly-content.tsx` — GFM 마크다운 렌더러, 대시보드로 대체
- `weekly-ai-summary.tsx` — 기존 단순 요약 패널, 대시보드로 대체

---

## 최근 변경 (2026-05-17) — Weekly AI 분석 2단계

### API (`src/app/api/weekly/analyze/route.ts` 신규)
- `POST /api/weekly/analyze` SSE 라우트
- **1단계 — 레코드별 요약**: `weekly_reports.raw_content` → Claude Haiku → `summary JSONB` 업데이트
  - 이미 `summary`가 있는 레코드는 건너뜀 (중복 분석 방지)
  - Zod `ReportSummarySchema`로 JSON 검증: `{ items: [{type, title, detail, date, brand}], summary }`
- **2단계 — 종합 인사이트**: 전체 요약 집계 → Claude Haiku → `weekly_insights` upsert
  - `stats` 자동 계산: `authors/issues/decisions/plans` count + 전주 대비 delta
  - 전주 `weekly_reports.summary` JSONB로 delta 계산 (별도 AI 호출 없음)
  - Zod `InsightNarrativeSchema`로 `headline`·`changes` 검증
- SSE 이벤트: `status` (진행상황) / `result` (최종 `weekly_insights` row) / `error`

### 서비스 (`src/lib/weekly-service.ts`)
- `getWeeklyInsight(weekStart)` — `weekly_insights` 단건 조회 (RLS 자동 workspace 스코핑)
- `analyzeWeekly(weekStart, onStatus?)` — SSE 클라이언트 (insight-service.ts 패턴 동일)

---

## 최근 변경 (2026-05-17) — Weekly 데이터 수집 레이어 기반 구축

### DB
- `weekly_reports` 테이블 신규 생성 (Supabase migration)
  - `id, workspace_id, source, team, author, week_start, raw_content, summary JSONB, created_at, updated_at`
  - UNIQUE: `(workspace_id, source, team, COALESCE(author, ''), week_start)` → unique index로 구현
  - RLS: workspace_members 기준 (다른 테이블과 동일 패턴)

### 타입 (`src/types/index.ts`)
- `WeeklySource` 인터페이스 추가
- `WeeklyReportSource` 타입 추가 (`'biz_lead' | 'team_doc'`)
- `WeeklyReport` 인터페이스 추가
- `WeeklyReportItem` / `WeeklyReportSummary` — 보고서 AI 분석 결과 JSONB 구조
- `WeeklyInsightStats` / `WeeklyInsightContent` / `WeeklyInsight` — 종합 인사이트 구조

### DB
- `weekly_insights` 테이블 신규 (UNIQUE workspace_id,week_start + RLS)

### 서비스 (`src/lib/weekly-service.ts` 신규)
- `getWeeklyReports(weekStart)` — 해당 주 전체 리포트 조회
- `upsertWeeklyReport(report)` — MCP 수집 시 INSERT/UPDATE (UNIQUE 충돌 시 덮어씀)

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

## 최근 변경 (2026-05-17) — Summary Slack 수집 기능

### Slack 메시지 웹에서 직접 수집 (`/api/slack/collect`)

- **신규 파일** `src/app/api/slack/collect/route.ts`
  - `SLACK_USER_TOKEN` (User Token) 으로 Slack `search.messages` API 호출
  - 클라이언트별 `keywords`를 OR 조건으로 검색 (`"키워드1" OR "키워드2"`)
  - `after:` 날짜 필터 없이 전체 검색 → `(client_id, source_id)` dedup으로만 중복 방지
    - ⚠️ `after:` 필터를 MCP 레코드의 `occurred_at` 기준으로 쓰면 창이 너무 좁아져 수집 불가 — 제거함
  - 작성자명: `users.info` API로 조회, 요청 내 캐싱
  - 태그·중요도는 빈 값으로 삽입 → 사용자가 드로어에서 수동 편집
- **`history-shell.tsx` 수정**
  - `Inbox` 아이콘 + `sonner` toast import 추가
  - `isCollecting` 상태 추가
  - `handleCollect` 함수: POST `/api/slack/collect` → 결과 toast → 자동 새로고침
  - 툴바에 "수집" 버튼 추가 (새로고침 버튼 왼쪽)
- 챗창 없이 웹 UI에서 직접 수집 가능 (17건 첫 수집 확인 → 이후 전체 롤백)
- 툴바 새로고침 버튼 제거 → "수집은 Claude Desktop MCP로 실행" 안내 텍스트로 대체

---

## 최근 변경 (2026-05-17) — 인사이트 AI 분석 JSON 파싱 오류 수정

### `src/app/api/insights/generate/route.ts`
- `max_tokens` 4096 → 8192 증가 — 56건+ 데이터 분석 시 응답이 잘려 JSON 파싱 실패하던 문제 수정
- `JSON.parse` try-catch 추가 — 파싱 실패 시 "JSON 파싱 실패 (응답이 잘렸을 수 있음)" 메시지로 원인 명시

---

## 최근 변경 (2026-05-17) — Summary 디자인 시스템 정합성 수정

비표준 폰트 크기 3건 수정 (`text-xs` = 12px 기준)

- **`history-sidebar.tsx`** 224번줄: `text-[12.5px]` → `text-xs` (주 네비게이터 레이블)
- **`insight-view.tsx`** 390번줄: `text-[12px]` → `text-xs` (오류 메시지)
- **`detail-drawer.tsx`** 329·338번줄: `text-[11px]` → `text-xs` (태스크/프로젝트 추가 CTA 버튼)

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

## 최근 변경 (2026-05-17) — Calendar 페이지 대규모 UX 개선

### 사이드바 스타일 Tasks 페이지 통일
- 배경색 `bg-card` → `bg-muted`, 헤더 uppercase + tracking-wider 스타일 적용
- 타이틀 "배치 대기열" → "CALENDAR"
- `panelOpen` state 추가: `PanelLeftClose` (사이드바 내부) / `PanelLeftOpen` (툴바, 닫힌 경우만 표시) 토글 버튼
- 사이드바 너비 `style={{ width: panelOpen ? 256 : 0 }}` + `transition-all duration-200`

### TaskPanel 전면 개편 (`task-panel.tsx`)
- **AI 제안 탭 완전 제거**: 탭 구조 자체 삭제, 태스크 목록만 유지
- **정렬 옵션 변경**: 생성일 제거 → 마감일 / 중요도 / 진행상황 3종 사이클 (`SortKey` 타입)
- **진행상황 정렬 순서**: in-progress → to-do → pending → backlog → done (`STATUS_ORDER`)
- **done 태스크 필터 유지**: `candidates = tasks.filter(!scheduled_at && !deleted_at)` — done 포함, 아래로 정렬
- **상태 레이블 영문 통일**: Backlog / To-Do / In Progress / Done / Pending (Tasks 페이지 일치)
- **체크 원 버튼**: 상태 점 → 클릭 가능한 원형 버튼으로 교체
  - 클릭 시 done 처리, 재클릭 시 직전 상태 복구 (`prevStatusMap: Record<string, string>` 로컬 state)
  - done 상태: 배경 채움 + Check 아이콘, 미완료: 테두리만
- **3구역 아이템 레이아웃**: [GripVertical 핸들] [체크 원] [태스크명]
  - 핸들 영역만 drag 이벤트 전파, 체크 원·태스크명은 `onMouseDown e.stopPropagation()`으로 드래그 차단
  - 핸들: `cursor-grab`, done 시 `invisible`
  - 태스크명: `cursor-pointer`, 클릭 → `onTaskClick(task)` 콜백
- **done 태스크 스타일**: `opacity-50`, 제목 `line-through text-ink-400`, 상태 뱃지 숨김

### 드래그 스냅 가이드라인 (`time-grid.tsx`)
- `DayColumn`에 `snapMinutes: number | null` state 추가
- `handleDragOver`에서 `getMinutesFromY(e.clientY - offsetY)` → `snapMinutes` 실시간 업데이트
- `handleDragLeave` / `handleDrop`에서 `snapMinutes = null` 초기화
- 가이드라인 렌더: 라일락 점 + 점선 + 우측 시각 레이블 (`HH:mm` 포맷, `z-30 pointer-events-none`)

### 겹침 레이아웃 (`time-grid.tsx`, `task-block.tsx`, `event-block.tsx`)
- `calcLayout(blocks)` 함수 추가: sweep line 알고리즘으로 `colIndex` / `totalCols` 계산
  - startMin 오름차순 정렬 후 greedy 컬럼 할당, 겹치는 모든 블록의 maxCol로 totalCols 결정
- `DayColumn` IIFE 렌더: timedEvents + scheduledTasks 합산 → `calcLayout` → 분리 적용
- `TaskBlock` / `EventBlock` 모두 `colIndex` / `totalCols` prop 수용, 동적 left/width 계산
  - `left: calc(${leftPct}% + ${colIndex > 0 ? 1 : 0}px)`, `width: calc(${widthPct}% - N px)`
- `TaskBlock`에 "중복" 뱃지 추가: `totalCols > 1`일 때 시각 텍스트 영역에 `bg-status-warn/15 text-status-warn` 소형 pill

### TaskDetailDrawer 연결 (`calendar-shell.tsx`)
- `drawerTask: GanttTask | null` state 추가
- `TaskPanel.onTaskClick` → `setDrawerTask`, `TimeGrid.onTaskClick` → `setDrawerTask` 연결
- 핸들러 신규: `handleDrawerSave` / `handleDrawerDelete` / `handleDrawerDuplicate` / `handleDrawerAddSubTask` / `handleDrawerStatusChange` / `handleSearchProjects`
- `assigneeSuggestions`: 태스크 목록에서 고유 담당자 추출
- `TaskDetailDrawer` 렌더: JSX Fragment로 감싸 main flex 외부에 배치

### TaskPanel 라벨 검색 추가 (`task-panel.tsx`)
- 기존: 제목만 검색
- 변경: 제목 OR 라벨 중 하나라도 검색어 포함 시 결과 표시
- `(t.labels ?? []).some(l => l.toLowerCase().includes(ql))` — `labels: null` 안전 처리 포함

### 날짜 하루 밀림 버그 수정 (`time-grid.tsx`)
- **원인**: `buildIso()`가 `new Date(y, mo-1, d, h, m).toISOString()` (UTC) 반환 → 한국(UTC+9) 9시 이전 드롭 시 UTC 날짜가 전날로 바뀌어 저장
- **필터 불일치**: `t.scheduled_at?.startsWith(date)` 에서 로컬 날짜 문자열과 UTC ISO 문자열 비교 → 전날 컬럼으로 분류
- **수정**: `localDateStr(iso)` 헬퍼 추가 (`new Date(iso)`의 로컬 `getFullYear/Month/Date` 사용), 필터를 `localDateStr(t.scheduled_at) === date` 로 교체

---

## 최근 변경 (2026-05-17) — Calendar UX 개선 (드래그·카드·레이아웃)

### 드래그 위치 버그 수정 (`drag-state.ts` 신규)
- **문제**: 그리드 내 태스크 재이동 시 스냅 인디케이터 위치와 실제 드롭 위치 불일치 (브라우저 보안 제한으로 `dragover`에서 `getData('offsetY')` 반환 불가)
- **수정**: `drag-state.ts` 신규 — `setActiveDragOffsetY` / `getActiveDragOffsetY` 모듈 레벨 공유
  - `task-block.tsx` dragstart: `setActiveDragOffsetY(dragOffsetY.current)`
  - `task-panel.tsx` / `calendar-shell.tsx` (all-day) dragstart: `setActiveDragOffsetY(0)`
  - `time-grid.tsx` `handleDragOver`: `getActiveDragOffsetY()` 사용 → 인디케이터·드롭 위치 일치

### ALL-DAY 행 개편 (`calendar-shell.tsx`)
- **모든 소스에서 ALL-DAY 드롭 허용**: `from-grid` 포함 전 소스 허용 — 그리드 태스크를 종일로 이동 가능
- **행 높이 확대** (`min-h-[52px]`): 체크 원 + 제목 2행 레이아웃 수용
- **체크 원 추가**: ALL-DAY 태스크에 완료 토글 버튼 추가 (`Check` 아이콘, `handleStatusChange` 연결)
- **레이아웃 변경**: 1행 `[체크 원] [종일]` → 2행 `[태스크명 line-clamp-2]` (task-block과 동일 패턴)
- **구글 이벤트 로고**: ALL-DAY 구글 이벤트에 컬러 "G" SVG 아이콘 추가

### 구글 이벤트 스타일 통일 (`event-block.tsx`, `calendar-shell.tsx`)
- 구글이 제공하는 `colorId` 색상 무시 → `ink-100` 배경 + `ink-300` 좌측 바로 고정
- 타임그리드 `EventBlock` 제목 앞에 구글 "G" SVG 로고(9px) 추가

### TaskPanel 카드 스타일 전면 개편 (`task-panel.tsx`)
- **카드 디자인**: `border border-border bg-card rounded` + 좌측 상태 컬러 3px 바 (task-block 스타일 통일)
- **사이드바 드롭으로 배치 해제**: `from-grid` 타입 dragover 감지 → 드롭 시 `onUnschedule` 호출, "여기에 놓으면 배치 해제" 점선 힌트 표시
- **To-Do 뱃지 소형화**: `text-[10px] px-1.5 py-0.5` → `text-[9px] px-1 py-px`
- **담당자 표시**: 뱃지 우측에 `task.assignee` 텍스트 추가
- **제목 line-clamp-2**: `truncate` → 2줄 표시 후 말줄임
- **배치된 태스크도 카드**: CalendarDays 아이콘 + 날짜·시각 메타 표시

### TaskBlock 레이아웃 변경 (`task-block.tsx`)
- **2행 구조**: 1행 `[체크 원] [시각 · 분]` → 2행 `[태스크명 line-clamp-2]`
- **패딩/간격**: `py-1` → `py-1.5`, `gap-0.5` 행 간격 추가
- 제목 `truncate` → `line-clamp-2` (2줄 표시 후 말줄임)

### Tasks 페이지 캘린더 배치 뱃지 (`TaskRow.tsx`)
- `scheduled_at` 있는 태스크에 lilac 색 뱃지 표시: `CalendarDays` 아이콘 + `M/D HH:mm` (종일이면 `M/D 종일`)
- 라벨 뱃지 다음, 하위 태스크 진행 뱃지 앞에 삽입

---

## 최근 변경 (2026-05-17) — Calendar 날짜 버그 재수정 + Notplan UX

### Notplan 스타일 UX (`task-panel.tsx`, `task-block.tsx`, `time-grid.tsx`, `calendar-shell.tsx`)
- **TaskPanel 전면 개편**: 체크박스 제거, 전체 태스크(미배치+배치 모두) 표시
  - 미배치 태스크: GripVertical 핸들 + 상태 뱃지 (드래그 가능)
  - 배치된 태스크: CalendarDays 아이콘 + "M/D HH:mm" 시각 뱃지 (드래그 불가, 클릭 시 드로어)
  - `onStatusChange` prop 제거 (체크 기능을 캘린더 블록으로 이전)
- **TaskBlock 완료 토글 추가**: 블록 좌측에 체크 원 버튼 → 클릭 시 done 처리, 재클릭 시 직전 상태 복구 (`prevStatus` 로컬 state)
- **TimeGrid**: `onStatusChange` prop 체인 추가 (DayColumnProps → TaskBlock)

### 헤더/통계/ALL-DAY 구조 개편 (`calendar-shell.tsx`)
- **단일 스크롤 컨테이너**: 헤더·통계·ALL-DAY·타임그리드를 하나의 `overflow-y-auto` 안에 넣어 스크롤바 폭 차이로 인한 컬럼 밀림 완전 해소
- **날짜 헤더**: `D (요일)` 형식 — 예: `17 (일)`, 오늘은 bg-foreground 원 강조
- **업무/구글 통계 행**: 날짜 헤더 아래 h-7 행 — 업무 Nh / 구글 Nh 표시
- **ALL-DAY 행**: 항상 표시, 종일 이벤트 + 종일 배치 태스크, 드래그 드롭 가능
- **timedTasks / allDayTasks 분리**: `isAllDayScheduled` (로컬 hours/minutes = 0)로 구분

### 날짜 버그 재수정 (2차)
- **`task-block.tsx` `source` 누락**: `handleDragStart`에 `setData('source', 'grid')` 추가 → 그리드 내 이동 시 `onMove`(duration 유지) 경로 올바르게 사용
- **이벤트 날짜 필터 UTC→로컬**: `time-grid.tsx` `DayColumn` 이벤트 필터를 `new Date(e.start).toISOString().slice(0,10)` → `localDateStr(e.start)` 교체 → KST 9시 이전 이벤트 하루 밀림 수정
- **`today` UTC→로컬**: `time-grid.tsx`의 `today` 계산을 `new Date().toISOString().slice(0,10)` → `localDateStr(new Date().toISOString())` 교체
- **구글 시간 통계 UTC→로컬**: `calendar-shell.tsx` `calcDayHours` 이벤트 필터도 `toDateStr(new Date(e.start)) === date` 로 교체

---

## 최근 변경 (2026-05-17) — Calendar 드래그 위치 버그 3차 수정

### ALL-DAY 행 실수 드롭 + 드래그 복구 (`calendar-shell.tsx`, `task-block.tsx`, `task-panel.tsx`)

- **문제**: 타임그리드에서 태스크를 드래그할 때 sticky ALL-DAY 행(z-20)이 스크롤된 그리드 콘텐츠 위에 겹쳐 dragover 이벤트를 가로채 태스크가 ALL-DAY로 실수 배치되는 문제
- **수정 1 — ALL-DAY dragover 전원 허용**: 모든 소스(`from-panel`, `from-grid`, `from-all-day`)에서 ALL-DAY로 드롭 가능 — 그리드 태스크를 ALL-DAY로 옮겨 종일 작업으로 표시 가능
- **수정 2 — ALL-DAY 태스크 draggable 추가**: 종일 배치된 태스크에 `draggable` + `onDragStart`(`from-all-day` 타입) 추가 → 타임그리드에 다시 드래그해 빼낼 수 있음
- **수정 3 — task-block.tsx source 추가**: `handleDragStart`에 `setData('source', 'grid')` 및 `setData('from-grid', '')` 추가 → 그리드 이동 시 `onMove` (duration 보존) 경로 사용

### 드래그 스냅 인디케이터 위치 불일치 수정 (`drag-state.ts` 신규, `time-grid.tsx`, `task-block.tsx`, `task-panel.tsx`, `calendar-shell.tsx`)

- **문제**: 그리드 내 태스크를 다시 이동할 때 스냅 인디케이터는 커서 위치에 표시되지만 실제 드롭 위치는 커서보다 `offsetY`만큼 위에 놓이는 차이 발생
  - 원인: 브라우저 보안 정책상 `dragover`에서 `e.dataTransfer.getData('offsetY')`는 항상 `''` 반환 → `DayColumn.handleDragOver`에서 offsetY를 읽지 못해 스냅이 커서 기준으로 계산됨
  - `drop` 이벤트에서는 올바르게 읽혀 실제 배치는 커서 - offsetY 위치 → 둘의 불일치가 "밀림"으로 체감
- **수정**: `drag-state.ts` 신규 모듈 (`setActiveDragOffsetY` / `getActiveDragOffsetY`) — dragstart 시 실제 offsetY를 저장해 `handleDragOver`에서 공유
  - `task-block.tsx` dragstart: `setActiveDragOffsetY(dragOffsetY.current)` 호출
  - `task-panel.tsx` dragstart: `setActiveDragOffsetY(0)` 호출
  - `calendar-shell.tsx` all-day task dragstart: `setActiveDragOffsetY(0)` 호출
  - `time-grid.tsx` `handleDragOver`: `getData('offsetY')` 대신 `getActiveDragOffsetY()` 사용
- 결과: 스냅 인디케이터 위치와 실제 드롭 위치가 완전히 일치

---

## 최근 변경 (2026-05-16)

### 디자인 시스템 & 공통 기반

**폰트: Geist → Noto Sans KR**
- `layout.tsx`: `Noto_Sans_KR` (400/500/700), `lang="ko"`
- `globals.css`: `--font-sans/heading` → `var(--font-noto-sans-kr)`, `--font-mono` → `ui-monospace`

**전체 폰트 크기 정규화 (20개 파일)**
- 큰 폰트(sm/base/13~15px) → xs, 중간 폰트(11.5px) → 11px, 작은 폰트(10.5px) → 10px 로 정규화
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

---

## 최근 변경 (2026-05-17) — Settings 키워드 섹션 제거

### `settings-shell.tsx`

- **키워드 섹션 삭제**: `Section` 타입에서 `'keywords'` 제거, NAV 항목 제거, 섹션 JSX 제거
- **`KeywordsInline` 컴포넌트 삭제**: 브랜드 드로어(BrandDrawer)에 키워드 편집 기능이 이미 포함되어 있어 중복 — 브랜드 섹션으로 통합
- `KeyRound` lucide import 제거, `updateClientKeywords` import 제거

---

## 최근 변경 (2026-05-17) — Settings Weekly 연동 DnD 순서 변경

### `settings-shell.tsx`

- **▲▼ 버튼 → GripVertical 드래그 핸들로 교체**
  - `moveWeeklySource` 함수 제거 (up/down swap 방식)
  - `@dnd-kit/core` + `@dnd-kit/sortable` 기반 드래그앤드롭 순서 변경으로 대체
  - `SortableWeeklyRow` 컴포넌트 추가: `useSortable` 훅 + `GripVertical` 핸들 아이콘
  - `handleWeeklyDragEnd`: `arrayMove` 후 전체 행 `sort_order` 재계산 + 병렬 DB 업데이트
  - 드래그 중 opacity 0.5로 위치 피드백
- **Collection ID `font-mono` 제거**
  - 팀 목록 행의 `collection_id` span: `font-mono` 삭제
  - 팀 추가 폼의 `collection_id` input: `font-mono` 삭제
  - 일반 Noto Sans 폰트로 통일

---

## 최근 변경 (2026-05-17) — Settings > 연동 Obsidian Vault 블록 추가

### `settings-shell.tsx`

- **Obsidian Vault SettingCard 추가** (integrations 섹션, Google Calendar 아래)
  - `useVaultHandle` 훅 import → 연결 상태(connected/disconnected/needs-permission/loading) 표시
  - 미연결: "Vault 연결" 버튼 → `showDirectoryPicker()` + IndexedDB 저장
  - 권한 만료: "권한 허용" 버튼 → `requestPermission()` 호출
  - 연결됨: 폴더명 표시 + "연결 해제" 버튼
  - 연결됨일 때 경로 패턴 입력 표시 (blur/Enter 시 localStorage 저장)

### `notes/page.tsx`

- 미연결(`disconnected`): VaultSetup 전체 UI 제거 → "Settings › 연동에서 연결하기" 링크 안내
- 권한 만료(`needs-permission`): VaultSetup 제거 → 미니멀 "권한 허용" 버튼만 표시

### `notes/_components/VaultSetup.tsx` 삭제

- notes 페이지에서만 사용하던 전용 UI — 인라인으로 대체 후 삭제
