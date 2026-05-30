# Wald Gantt — 개발 로그

## 백로그

| 항목 | 내용 | 우선순위 |
|---|---|---|
| autoArchiveTasks 성능 | `load()` 호출마다 archive 쿼리 실행 → 하루 1회로 제한 필요 (페이지 진입 시에만 또는 별도 cron) | 낮음 |

---

## 최근 변경 (2026-05-30) — Bulk 반복 태스크 완료 처리

### 변경 내용
- **`handleBulkStatusChange` 반복 태스크 처리 추가** (`tasks/_hooks/use-tasks-data.ts`)
  - bulk 완료 시 반복 규칙(`recurrence_rule`)이 있는 태스크에 대해 `createNextRecurringInstance` 호출
  - 다음 인스턴스 생성 후 `load()` 재조회, 토스트에 생성 건수 표시

---

## 최근 변경 (2026-05-30) — 메모 에디터 Tiptap WYSIWYG 전환

### 목적
textarea + 별도 미리보기 토글 방식을 제거하고, Tiptap 기반 실시간 리치 에디터로 교체

### 변경 내용

**신규 패키지 (`package.json`)**
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-placeholder`, `tiptap-markdown` 추가

**`note-editor.tsx` 신규**
- Tiptap 에디터 래퍼 컴포넌트
- StarterKit + TaskList + TaskItem(nested) + Markdown(`tiptap-markdown`) + Placeholder 확장 조합
- `ExitEmptyTaskItem` 커스텀 Extension: 빈 체크박스 항목에서 Enter 시 리스트 탈출
- props: `content`, `onChange(markdown)`, `placeholder?`, `autoFocus?`
- 마크다운 문자열 ↔ Tiptap 문서 변환을 `tiptap-markdown`이 담당 (인/아웃 모두)

**`note-edit-modal.tsx` 수정**
- `textarea` + `preview` state + `NoteMarkdown` 렌더 → `NoteEditor` 단일 컴포넌트로 교체
- 미리보기/편집 토글 버튼 제거 (WYSIWYG이므로 불필요)
- `useLayoutEffect` auto-resize 로직 제거
- `Eye`/`EyeOff` import 제거, `useRef` 제거

---

## 최근 변경 (2026-05-30) — Weekly Raw View 마크다운 전처리 개선

### 목적
Outline 원문의 짝 없는 `**` 마커와 연속 줄바꿈으로 인한 렌더링 오류 수정

### 변경 내용

**`weekly-raw-view.tsx`**
- `remarkBreaks` 플러그인 추가: 단일 줄바꿈도 `<br>`로 렌더링
- `preprocessMd()` 함수 신규: `<br>` → `\n` 변환, 연속 빈 줄 정리, **짝 없는 `**` 마커 이스케이프** (리스트·헤딩 줄은 제외)
- 기존 인라인 전처리 로직 → `preprocessMd()` 함수로 분리

---

## 최근 변경 (2026-05-30) — 프로젝트 진척률(%) 기능

### 목적
프로젝트 간트에서 진척률을 수동으로 입력하고 바에 시각적으로 표시

### 변경 내용

**DB**
- `gantt_tasks.progress smallint NOT NULL DEFAULT 0 CHECK (0~100)` 추가
- `gantt_projects.progress smallint NOT NULL DEFAULT 0 CHECK (0~100)` 추가

**`types/index.ts`**
- `GanttTask.progress: number` 추가
- `GanttProject.progress: number` 추가

**`gantt-service.ts`** — `addProject` fields에 `progress?: number` 추가

**`task-service.ts`** — `updateTask` Pick 타입에 `'progress'` 추가

**`ProjectFormDialog.tsx`**
- `progress` state 추가, editProject 동기화
- 우선순위 아래 슬라이더 UI (0~100, step 5) 추가
- 마일스톤은 progress 강제 0
- `onSave` fields 타입에 `progress: number` 추가

**`projects/page.tsx`** — `handleSaveProject`에 `progress` 필드 추가 (신규·수정 모두)

**`_GanttCategoryRight.tsx`**
- 우선순위 기반 투명도(`barOpacity`) 제거 → 고정 배경 `barColor + 'aa'`(67%)
- 진척률 fill: `absolute inset-0`, 100% opacity로 배경과 명확한 대비
- 텍스트 `z-10`으로 fill 위에 표시, 흑/백 shadow 강화
- 바 우측 메타 영역에 `{progress}%` 숫자 표시 (카테고리 색상, bold)

---

## 최근 변경 (2026-05-30) — 마일스톤 기능 구현

### 목적
간트 차트에서 단일 날짜 기반 이정표(마일스톤) 지원

### 변경 내용

**DB** — migration `add_is_milestone_to_gantt_projects`
- `gantt_projects.is_milestone boolean NOT NULL DEFAULT false` 추가

**`types/index.ts`** — `GanttProject.is_milestone: boolean` 추가

**`gantt-service.ts`** — `addProject` fields에 `is_milestone?: boolean` 추가

**`ProjectFormDialog.tsx`**
- "마일스톤" 토글 버튼 추가 (서브프로젝트 폼 제외)
- 마일스톤 ON: 날짜 하나만 입력, 상태/시작일/팀/PM 숨김
- 타이틀 "마일스톤 추가 / 마일스톤 수정" 분기

**`_GanttCategoryLeft.tsx`**
- 마일스톤 행: 상태 점 대신 ◆ 다이아몬드 아이콘, 날짜(MM/DD) 표시
- 카테고리 하단에 "마일스톤" 추가 버튼 추가

**`_GanttCategoryRight.tsx`**
- 마일스톤은 바 대신 회전된 정사각형(◆) 마커를 해당 날짜 컬럼에 렌더링

**`GanttChart.tsx`** — `onAddMilestone` prop 추가 및 전달

**`projects/page.tsx`**
- `DialogState`에 `isMilestone?: boolean` 추가
- `onAddMilestone` → `setDialog({ type: 'addProject', isMilestone: true })`
- `handleSaveProject`에 `is_milestone` 필드 추가

---

## 최근 변경 (2026-05-30) — Priority 좌측 컬러 스트라이프

### 목적
프로젝트 행에서 우선순위를 직관적으로 시각화 (기존: 바 투명도에만 반영, 시인성 낮음)

### 변경 내용

**`_GanttCategoryLeft.tsx`**
- `PRIORITY_META` import 추가
- `ProjectRow` 내부: priority > 0인 행에 절대위치 3px 좌측 컬러 스트라이프 추가
  ```tsx
  {(project.priority ?? 0) > 0 && (
    <div className="absolute left-0 top-0 bottom-0 w-[3px]"
         style={{ backgroundColor: PRIORITY_META[project.priority!].color }} />
  )}
  ```
- 카테고리 헤더 stripe(3px, cat.color)와 동일한 방식, 개별 프로젝트 행에 priority 색상 적용

---

## 최근 변경 (2026-05-29) — 서브프로젝트 기능 구현

### 목적
Gantt 프로젝트의 계층 구조 지원 (parent_id 필드가 DB/타입에 존재했으나 UI가 전혀 없었음)

### 변경 내용

**`_useGanttDnd.ts`**
- DnD liveItems 초기화 시 자식 프로젝트(parent_id 있는 것) 제외 → 부모만 드래그 가능

**`GanttChart.tsx`**
- `collapsedParents` 상태 + `toggleCollapsed` 함수 추가
- `parentIds` Set 계산 (자식이 있는 프로젝트 ID 집합)
- `orderedProjectsOf()` 함수 추가: 부모 → 자식 순으로 인터리브된 정렬 목록 반환, 접힌 부모는 자식 생략
- `onAddSubProject` prop 추가 및 GanttCategoryLeft에 전달

**`_GanttCategoryLeft.tsx`** (전체 재작성)
- `ProjectRow` 내부 컴포넌트 분리 (부모/자식 공용)
- 자식 있는 부모: ChevronDown/Right 토글 버튼 표시
- 자식 행: 20px 들여쓰기, 드래그 핸들 없음
- 부모 행 호버 시 "+" 버튼으로 서브프로젝트 추가
- SortableContext에 부모 ID만 포함 (자식은 드래그 불가)

**`ProjectFormDialog.tsx`**
- `parentId` 상태, `defaultParentId`/`parentProjects` props 추가
- "상위 프로젝트" select 드롭다운 추가 (parentProjects 있을 때만 표시)

**`projects/page.tsx`**
- DialogState에 `parentId` 필드 추가
- `addProject` 호출 시 `fields.parentId` 실제 전달
- `handleDeleteProject`: 부모 삭제 시 자식도 cascade soft-delete
- `handleMoveProject`: 부모가 카테고리 이동 시 자식도 함께 이동
- `onAddSubProject` 핸들러 + ProjectFormDialog에 `parentProjects` 전달

### 동작 방식
```
Board > Category
  ▼ 부모 프로젝트     [+서브] [삭제] [메모]   ← 접기/펼치기 토글
      ▸ 서브프로젝트                           ← 들여쓰기, 드래그 불가
      ▸ 서브프로젝트
  — 단독 프로젝트     [삭제] [메모]
```

---

## 최근 변경 (2026-05-29) — 메모 → 태스크 연결 기능

### 목적
메모장의 주목적(아이디어 빠른 캡처 → 태스크 전환)을 지원하는 워크플로우 추가

### 1. DB 변경
- `notes` 테이블에 `links JSONB NOT NULL DEFAULT '[]'` 컬럼 추가 (마이그레이션 `20260529000002`)
- `NoteLink` 타입: `{ type: 'task' | 'project', id: string, title: string }`

### 2. NoteEditModal — 태스크 등록 흐름
- 하단 툴바에 "↗ 태스크 등록" 버튼 추가
- 클릭 시 인라인 폼 슬라이드인: 제목(note.title pre-fill), Enter 등록
- `addTask()` 호출, 메모 내용 → 태스크 `memo` 필드 자동 입력
- 등록 완료 후 `note.links`에 `{ type: 'task', id, title }` 저장
- 모달 상단에 연결 배지 목록 표시 → 클릭 시 `/tasks` 이동, ✕ 링크 해제

### 3. NoteCard / NoteListItem
- 연결 태스크가 있으면 "↗ N개 연결됨" 배지 표시 (보라색)

### 4. 태스크 삭제 시 메모 링크 자동 정리 (`eed0b29`)
- `removeTaskLinkFromNotes(taskId)` 추가 (note-service): JSONB `cs` 필터로 해당 taskId가 포함된 메모 조회 후 links 배열에서 제거
- `softDeleteTask`, `permanentDeleteTask`, `bulkSoftDeleteTasks` 에 정리 호출 추가 (fire-and-forget)
- 태스크 삭제 후 메모 카드의 "N개 연결됨" 배지가 즉시 사라지지 않을 수 있으나 다음 로드 시 반영됨

### 검증
- `npx tsc --noEmit` 통과
- Supabase SQL Editor에서 마이그레이션 수동 실행 완료
- `git push origin master` 완료 (`eed0b29`)

---

## 최근 변경 (2026-05-28) — Weekly: Outline 수집 + AI 자동 분류

### 1. Outline import 정규식 수정 (`import-outline/route.ts`)
- 날짜 구분자: `##YYYY.MM.DD` (점) → `##YYYY-MM-DD` (하이픈) 둘 다 지원, 내부 통일
- 분기 문서 탐지 패턴 `isQuarterDoc()` 신규 추가: `2026 Q1`, `Q2 2026`, `2026 1Q` 등 다양한 표기 허용
- `results` 타입에 `quarterDocsFound: string[]` 추가 → 디버깅용 문서 목록 반환

### 2. 수집 토스트 피드백 세분화 (`weekly-shell.tsx`)
- 분기 문서 0개: "Outline 문서 제목을 확인해 주세요" 경고
- 문서는 있지만 섹션 0개: "날짜 형식(## YYYY-MM-DD)을 확인해 주세요" 경고
- 정상 수집: "N건 저장" 성공

### 3. 이슈/결정/계획 타입 탭 UI (`weekly-dashboard.tsx`)
- `TypeKey`, `TYPE_TABS` 상수 추가 (전체/이슈/결정/계획)
- `TypeTab` 컴포넌트 — 언더라인 탭 + 건수 배지
- `typeFilter` 상태 + `typeCounts` 연산, `FilterBar` 위에 렌더링

### 4. 수집 후 자동 AI 분류 (`weekly-shell.tsx`)
- `fetchWeeks()` 반환 타입: `void` → `Promise<string[]>` 변경
- `handleAutoAnalyze(weekStart)` 추가 — `analyzeWeekly()` 호출 + 인라인 진행 표시
- `handleImportOutline` 개선: 수집 완료(total > 0) 후 `fetchWeeks` → `handleAutoAnalyze(freshWeeks[0])` 자동 실행
- 헤더 아래 슬림 진행 바 + 상태 텍스트 표시 (autoAnalyzing 중)
- CloudDownload 버튼: importing || autoAnalyzing 동안 비활성화

---

## 최근 변경 (2026-05-29) — Slack 분류 + 데일리 리포트 (2026-05-28)

### 슬랙 분류 결과
- 총 raw 메시지: 120건
- **분류 저장: 55건** / 제외: 65건 (봇·자동알림·단순응답·빈메시지)
- 브랜드 수: **22개**
- 우선순위: high 22건, medium 26건, low 7건
- 결정 항목: 6건 (CBK 세트메뉴 ERP 6/4 오픈, HPS D3 판가 확정, 삼성웰스토리 시안 확정, 쿠우쿠우 친구플러스 미지급 확인, 전사 조직 2건)
- 주요 이슈: 몬스터커피 목원대점 신규 오픈 다중 장애(5건), HPS 카카오페이 매출 불일치, 쿠우쿠우 데이터 분석·계약해지 준비, 도쿄플라츠 GMO POS 사양서 누락

### 데일리 리포트 생성 (`daily_reports` — 2026-05-28)
- action_items 18건 (urgent 5, watch 7, info 6)
- decisions 5건, upcoming 10건, pending 7건
- 헤드라인 요약: 쿠우쿠우 KISA 기한 당일 미팅 (계약 분기점), 몬스터커피 목원대점 신규 오픈 다중 이슈, HPS·퀴즈노스 세금계산서 공통 버그
- 참조: 5/21~5/27 과거 리포트 4건, 5/18·5/25 주차 타임라인 활용

---

## 최근 변경 (2026-05-29) — 메모장 개선 + API 키 관리 + Tasks inbox 정리

### 1. 메모장(Notes) 기능 개선
- **NoteCard 개선**: 최대 높이(10rem) 제한 + 긴 내용 하단 fade 마스크, 날짜 표시(`M/d`), 전체화면 편집 버튼(`Maximize2`) 추가
- **NoteEditModal 신규**: 전체화면 편집 모달. Ctrl+Enter/Esc로 저장/닫기, 제목·내용 auto-resize, 배경 클릭 저장
- **notes/page.tsx 전면 개선**:
  - 검색 바: title + content 대소문자 무시 필터
  - 실행취소 삭제: 삭제 즉시 UI에서 제거 후 5초 타이머, 토스트 "실행취소" 클릭 시 복원
  - 고정 메모 우선, 그 아래 최신순 정렬
- **리스트 뷰 미구현 (취소)**: NoteListItem / 리스트-그리드 뷰 전환은 불필요로 판단해 미구현

### 2. 설정 > API 키 탭 신규
- `workspace_api_keys` 테이블 마이그레이션 (`20260529000001_create_workspace_api_keys.sql`)
  - `workspace_id`, `service` (slack_user | anthropic), `token` 저장
  - RLS: 본인 워크스페이스만 읽기/쓰기
- `ApiKeysSection` 컴포넌트: Slack User Token / Anthropic API Key 등록·삭제 UI
- `settings-shell.tsx`: `Section` 타입에 `'apikeys'` 추가, NAV·SECTION_TITLE 동기화

### 3. Slack/AI API 라우트 — DB 우선, env 폴백
- `slack-service.ts`: `classifyMessage()` 3번째 인자로 `anthropicApiKey?` 수신
- `collect-raw`, `reclassify`, `channels`, `channel-mappings`, `update-threads`: `getApiKey(sb, workspaceId, 'slack_user', env폴백)` 패턴으로 토큰 조회
- `insights/generate`, `weekly/analyze`, `weekly/import-outline`: Anthropic 키도 동일 패턴

### 4. Tasks inbox 정리
- Inbox 전용 퀵캡처(`inboxQuickCreate`) 제거 — inbox는 TaskStatus 값으로만 존재
- 사이드바 `inboxCount` 및 `QuickFilterKey`에서 `'inbox'` 제거
- `STATUS_ORDER`에서 inbox를 -1(정렬 최상단)으로 조정
- `_constants.tsx`: STATUS_ABBR inbox 약자 `↓` → `X`, CSS 변수에 폴백 값 추가

### 5. TypeScript 수정
- `settings-shell.tsx` Section 타입 + SECTION_TITLE에 `'apikeys'` 누락 → 추가
- `note-card.tsx` 충돌 해소: render 중 setState 패턴 → `useEffect` 방식으로 교체

### 검증
- `npx tsc --noEmit` 통과 (weekly 2건은 pre-existing 오류, 본 작업 무관)
- `git push origin master` 완료 (`34e0a35`)

---

## 최근 변경 (2026-05-28) — Daily Report V2 접힌 행 디자인 개선

### CollapsedRow 재디자인 (B안)
- 심각도 점(dot) → **뱃지 pill** 교체 (`item.badge.label` + `item.badge.cls`)
- **ChevronRight** 아이콘 우측 추가 → 클릭 가능함을 명시
- 항목 구분선 강화: `border-border/40` → `border-border`
- 패딩 확대: `py-2.5` → `py-3`
- hover 강화: `hover:bg-muted/40` → `hover:bg-muted/60`
- 타이틀에 `min-w-0` 추가 → truncate 정상 동작 보장

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## 최근 변경 (2026-05-28) — Tasks 간트 뷰 UX 개선

### 1. 주 컬럼 너비 확대 (36px → 52px)
- `WEEK_W` 상향 → 날짜 레이블 가시성 개선
- `showFull` / `showShort` 기준도 `WEEK_W * 2` / `WEEK_W` 상대값으로 전환

### 2. 마운트 시 오늘 위치 자동 스크롤
- `scrollRef` + `useEffect`(mount only) — 뷰포트 중앙에 오늘 선이 오도록 초기 `scrollLeft` 설정

### 3. "오늘" 버튼 추가
- 헤더 좌측 고정 영역 우하단에 추가 → 클릭 시 smooth scroll

### 4. 드래그 중 델타 레이블 표시
- `dragDelta` 상태 추가 — 바 드래그 중 `+N일` / `-N일` 레이블을 바 위에 표시

### 5. 하위 태스크 들여쓰기 강화
- `isSub` 행 좌측 패딩 `px-3` → `pl-6 pr-3` 으로 변경

### 6. 날짜 없는 섹션 헤더 레이아웃 수정
- `sticky` 레이블 옆 `flex-1` 빈 div 추가 → 가로 스크롤 시 배경 깨짐 해소

### 7. 유틸 함수 분리 (500줄 규칙)
- `addDays`, `calcViewRange`, `yearGroups`, `monthGroups`, `reorderWithSubs`, `gantSortCompare`, `barLabel` → `_utils.ts` 이동
- `gantt-view.tsx`: 532줄 → 389줄

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## `7bab0b3` (2026-05-28) — 오버레이 충돌 수정 + 태스크 뷰 스타일 통일

### 오버레이·다이얼로그 렌더링 구조 개선
- **TaskDetailDrawer 인라인 전환** (`drawer.tsx`, `task-detail-drawer.tsx`, `tasks/page.tsx`)
  - 포털 기반 backdrop이 Gantt 뷰 sticky/overflow 컨테이너와 충돌해 화면 깨지는 문제 수정
  - `Drawer`에 `noPortal` prop 추가 → backdrop 없이 인라인 렌더링
  - Tasks 페이지: 뷰 영역 + 디테일 패널 나란히 배치, `width 0 ↔ 480px` 슬라이드 애니메이션
- **ProjectFormDialog 인라인 전환** (`ProjectFormDialog.tsx`, `projects/page.tsx`)
  - 동일 원인으로 Projects 페이지도 동일 구조로 전환
- **CategoryAddDialog page 레벨로 이동** (`GanttChart.tsx`, `projects/page.tsx`)
  - GanttChart 내부 stacking context가 다이얼로그 backdrop을 가리는 z-index 충돌 해결
  - 다이얼로그 상태(`addCatOpen` 등)와 렌더링을 `projects/page.tsx`로 분리
  - `GanttChart`에 `onOpenAddCategory` prop 추가

### 태스크 뷰 스타일 통일
- **우선순위 텍스트 스타일 제거** — Gantt·Calendar 뷰에서 `font-semibold / text-rose-500` 등 우선순위별 색상·굵기 제거, List 뷰와 동일하게 `text-foreground` 단일화
- **Gantt 뷰 폰트 크기** — 태스크 타이틀 `text-xs` → `text-sm` (List 뷰 맞춤)
- **Gantt 뷰 상태 표시** — 단순 블릿(`w-2 h-2`) → 프로젝트 뷰와 동일한 상태 원(`w-3.5 h-3.5` + 약어 + 클릭 시 상태 변경)
- **List View 우선순위 컬럼 너비** — 헤더·행 `w-8` → `w-12` 통일

---

## 최근 변경 (2026-05-28) — UI 버그 수정 및 폼 너비 조정

### Tasks / Summary 탭 폰트 크기
- `tasks-action-bar.tsx` / `summary-toolbar.tsx`: 탭 버튼 `text-xs` → `text-sm` 통일

### Drawer 내 DatePicker z-index 수정
- `src/components/ui/popover.tsx`: Positioner z-index `z-50` → `z-dialog` 로 상향
- Drawer(`z-dialog`)보다 낮아 DatePicker 캘린더가 뒤에 가리는 문제 해결

### Gantt 행 정렬 변경 시 LEFT/RIGHT 패널 어긋남 수정
- `_GanttRows.tsx`: `SortableProjRow` / `SortableCatRow` 에 `animateLayoutChanges: () => false` 추가
  - dnd-kit이 순서 변경 시 임시 CSS transform 적용하는 것을 방지
- `GanttChart.tsx`: `useLayoutEffect`로 정렬·필터 변경 시 scroll 강제 동기화 추가

### 정렬 드롭다운 클리핑 수정
- `GanttToolbar.tsx`: 정렬 드롭다운 `absolute` → `fixed` + `getBoundingClientRect()` 방식으로 변경
  - overflow 컨테이너 밖으로 벗어나 잘리는 문제 해결
  - 너비 `min-w-[140px]` → `min-w-[100px]` 축소

### Drawer 딤 처리 강화
- `src/components/ui/drawer.tsx`: 배경 `bg-black/30` → `bg-black/50`

### 폼 너비 조정
- `ProjectFormDialog.tsx`: `width={440}` → `width={340}`
- `TaskFormDialog.tsx`: `width={440}` → `width={360}`

---

## 최근 변경 (2026-05-28) — Inbox 행 음영 + 전역 스크롤바 숨김

- `task-row.tsx`: `status === 'inbox'` && 서브태스크 아닐 때 `var(--task-status-inbox-bg)` 배경 적용 (inline style)
- `globals.css`:
  - `*` 셀렉터 `scrollbar-width: thin` → `scrollbar-width: none` (+ `scrollbar-color` 제거)
  - `::-webkit-scrollbar` track/thumb/hover 규칙 전체 제거 → `display: none` 단일 규칙으로 교체
  - 앱 전체 스크롤바 완전 숨김 (html/body는 이미 `scrollbar-width: none` 적용 중이었음)

---

## 최근 변경 (2026-05-28) — Tasks Inbox 사이드바 필터 버그 수정

### 문제
사이드바 "Inbox" 클릭 → `quickFilter === 'inbox'` → `hasFilter = true`
→ Inbox 섹션이 `{!hasFilter && ...}` 조건으로 숨겨짐
→ `filtered`의 inbox 태스크는 `STATUS_GROUPS`에 inbox가 없어 어떤 그룹에도 렌더 안 됨 → 빈 화면

### 수정 (`normal-view.tsx`)
1. Inbox 섹션 노출 조건 `!hasFilter` → `!hasFilter || quickFilter === 'inbox'`
2. 상태 그룹 앞에 `quickFilter === 'inbox'` 분기 추가
   - inbox 태스크 있으면 위 섹션에서 이미 렌더 (null 반환)
   - inbox 태스크 없으면 "Inbox가 비어있어요 ✨" 빈 상태 표시

### 검증
- 변경 파일 `npx tsc --noEmit` 에러 없음

---

## 최근 변경 (2026-05-28) — 탭별 독립 날짜 + Weekly List 오늘 프리셋 제거

### 문제
`dateFrom`/`dateTo`가 단일 shared state → 탭 이동 시 이전 탭 날짜가 그대로 이월됨

### 변경 내용
- `summary-shell.tsx`: `getTabDefaultDates(view)` 헬퍼 추가 (컴포넌트 외부)
  - `dailylist` / `weeklylist` → 최근 7일
  - `dailyreport` → 오늘
  - 나머지 → 전체 (빈값)
- `handleViewChange(newView)` 추가: 탭 전환 시 탭별 기본 날짜로 리셋
- `tableInitRef` 방식 → 초기 마운트 `useEffect`로 교체 (mount-only, `!dateFrom && !dateTo` 조건)
- `SummaryToolbar`에 `onViewChange={handleViewChange}` 적용
- `sidebar-date-panels.tsx`: `DateRangePanel`에 `showToday?: boolean` prop 추가
  - `false`이면 presets 배열에서 'today' 제외
- `summary-sidebar.tsx`: Weekly List에 `showToday={false}` 전달

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## 최근 변경 (2026-05-28) — Daily List 사이드바 "오늘" 프리셋 추가

- `sidebar-date-panels.tsx` `DateRangePanel`: presets 배열 맨 앞에 `['today', '오늘']` 추가
- `applyPreset`: `'today'` → dateFrom/dateTo 모두 오늘 날짜로 설정
- `activePreset`: from === to === today이면 `'today'` 활성 반환
- (참고) `_sidebar-controls.tsx`는 미사용 경로로 해당 파일 수정은 효과 없었음

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## 최근 변경 (2026-05-28) — Daily List 전체보기 추가

### 변경 내용
- `daily-list-view.tsx`: 브랜드 사이드 패널 상단에 **"전체"** 버튼 추가 (카운트는 전체 합계)
- 기본 선택이 첫 번째 브랜드 → **전체**로 변경 (`selectedBrand = activeBrand ?? null`)
- 전체 선택 시 헤더 도트는 회색(`bg-ink-300`), 텍스트는 "전체 브랜드"
- `onSelectBrand` 타입 `string → string | null` 확장
- `summary-shell.tsx`: `onSelectBrand` 핸들러에서 `null`(전체) 처리 추가

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## 최근 변경 (2026-05-26) — Tasks 디자인 시스템 정합 수정

### 1. 하드코딩 색상 → 디자인 토큰 교체
- `TasksSidebar.tsx`: `bg-orange-400` → `bg-status-soon`, `bg-sky-400` → `bg-status-future`
- `TasksActionBar.tsx`: `bg-white` (토글 썸) → `bg-background`, `text-white` (전체 활성) → `text-background`
- 다크모드 대응 완성

### 2. 라벨 뱃지 `py-[3px]` 매직넘버 제거
- `TaskRow.tsx`, `KanbanView.tsx`, `ListView.tsx`, `CalendarView.tsx` 전수 교체 → `py-0.5`

---

## 최근 변경 (2026-05-26) — Tasks 페이지 버그 수정 및 리팩터링

### 1. `TaskDetailDrawer.tsx` 500줄 규칙 위반 해소 (632 → 368줄)
- `DrawerProjectSection.tsx` — 연결 프로젝트 검색 드롭다운 분리
- `DrawerLabelSection.tsx` — 라벨 입력/자동완성 분리
- `DrawerRecurrenceSection.tsx` — 반복 설정 분리
- `DrawerSubTaskSection.tsx` — 하위 태스크 목록+추가 분리
- 각 섹션의 내부 상태(projSearch, labelInput 등)를 해당 컴포넌트로 이동

### 2. `handleBulkStatusChange` 에러 롤백 누락 수정
- catch 블록에 `await load()` 추가 → 실패 시 낙관적 업데이트 롤백

### 3. KanbanView "완료 포함" 토글 노출
- `view !== 'kanban'` 조건 제거 → 모든 뷰에서 토글 표시
- hideDone 필터가 칸반에도 적용되고 있었으나 UI에서 제어 불가능했던 문제 해소

### 4. `listSubQuickCreate` 부모 속성 상속 수정
- `type/assignee/labels/priority/start_date/due_date` 하드코딩 → 부모 태스크 값 상속
- `commitQuickAddSub`와 동작 일치

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## 최근 변경 (2026-05-26) — 코드 품질 정리 2차 (unsafe assertion 제거 / 파일 명칭 정리 / 훅 분리)

### 1. `detail-drawer.tsx` unsafe `d!` non-null assertion 제거
- `setDraft(d => ({ ...d!, ... }))` 패턴 4곳 → `setDraft(d => d ? { ...d, ... } : d)` 로 교체
- `d`가 null인 상태에서 호출될 경우 런타임 에러 방지

### 2. `_lib/mock-data.ts` → `_lib/constants.ts` 이름 변경
- 파일명이 의미를 잘못 전달(mock 데이터가 아닌 상수/메타 정의)
- 10개 파일 import 일괄 업데이트: `badges`, `brand-daily-list-view`, `daily-report-view`, `detail-drawer`, `history-shell`, `history-sidebar`, `stacked-card-view`, `summary-view`, `table-view`, `action-detail-drawer`
- `page.tsx` import 누락분도 함께 수정

### 3. `_components` 내 파일명 언더스코어 접두어 제거
- `_action-detail-drawer.tsx` → `action-detail-drawer.tsx`
- `_sidebar-date-panels.tsx` → `sidebar-date-panels.tsx`
- `_raw-data-sidebar.tsx` → `raw-data-sidebar.tsx`
- 의존 파일(`daily-report-view`, `history-sidebar`) import 업데이트

### 4. `history-shell.tsx` 다이얼로그/워크스페이스 로직 훅 분리
- `use-create-dialogs.ts` 신규 훅 추출 (77줄)
- `history-shell.tsx` 461줄 → 398줄 (500줄 상한에 여유 확보)
- 태스크/프로젝트 생성 관련 상태 및 핸들러를 단일 훅으로 캡슐화

### 검증
- `npx tsc --noEmit` 통과 (에러 0건)

---

## 최근 변경 (2026-05-26) — 코드 품질 정리 (500줄 분리 / 마이그레이션 추적 / 에러 처리)

### 1. `daily-report-view.tsx` 500줄 분리
- `ActionDetailDrawer`, `RelatedItemCard`, `BodyBullets` 등 드로어 관련 코드 → `_action-detail-drawer.tsx` 신규 파일 추출
- `daily-report-view.tsx` 602줄 → 277줄 / `_action-detail-drawer.tsx` 273줄

### 2. 마이그레이션 미추적 DB 오브젝트 추가
- `supabase/migrations/20260526000001_add_missing_rpc_and_tables.sql` 신규
  - `client_history_summaries` 테이블: 재분류 시 이전 분류 결과 아카이브용
  - `get_raw_messages_by_date(p_workspace_id, p_date)` RPC: KST 날짜 기준 raw 메시지 조회
  - `get_thread_reply_raw_ids(p_workspace_id)` RPC: 스레드 답글 raw ID 목록 조회

### 3. `reclassify` 아카이브 에러 무시 수정
- `client_history_summaries` insert 결과를 체크하지 않던 버그 수정
- 실패 시 SSE로 경고 메시지 전송 후 계속 진행

### 4. `history-sidebar.tsx` 워트리 충돌 해결
- 다른 에이전트가 master에서 분리한 버전을 워트리에 반영

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-26) — Summary 타임존 처리 통일

### 1. KST 변환 `toKSTDate()` 유틸로 통일

- **문제**: Summary 컴포넌트 5개 파일에서 KST 변환 방식이 제각각 사용됨
  - `new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })` (3개 파일)
  - `new Date(utc).getTime() + 9 * 60 * 60 * 1000` (1개 파일)
  - 로컬 함수 중복 정의 (2개 파일)
- **수정**: 모두 `@/lib/history-query-utils`의 `toKSTDate()` import로 교체
  - `stacked-card-view.tsx` — 로컬 `kstDate()` 제거
  - `brand-daily-list-view.tsx` — 로컬 `toKstDate()` 제거
  - `history-sidebar.tsx` — `toLocaleDateString('sv-SE', ...)` 3곳 교체
  - `daily-report-view.tsx` — `kstDateLabel()` 내부 구현을 `toKSTDate()` 기반으로 교체 (출력 포맷 `YYYY/M/D` 유지)

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-25) — Summary 뷰 전면 리팩터 + 파이프라인 정렬

### 1. Raw Data UTC→KST 버그 수정 (`raw-data-view.tsx`)
- `client_history.occurred_at`을 UTC 그대로 `.slice(0,10)` 해서 `get_raw_message_stats` RPC의 `date_kst`와 날짜가 최대 -1일 어긋나던 문제 수정
- `toKSTDate()` 헬퍼 추가: `new Date(utc).getTime() + 9 * 3600_000`으로 KST 변환 후 날짜 추출

### 2. Weekly List 테이블 전환 (`timeline-view.tsx`)
- 아코디언 카드 → 완전한 flat 테이블로 교체
- 컬럼: 주차 | 브랜드 | 주제 | 요약 | 태그 | 중요도 | 건수
- 요약: `MarkdownBody` 인라인 렌더링 (불릿 + 문장별 개행)
- 정렬: 주차·브랜드·중요도·건수 — 클릭 토글 (asc/desc)
- 브랜드 필터 칩 바 유지
- `<tfoot sticky>` 로 "전체 N건 중 M건" 표시

### 3. Daily List 컬럼 구조 개편 (`table-view.tsx`)
- "내용" 단일 컬럼 → **제목** / **내용** 2컬럼 분리
- 컬럼 순서 Weekly List와 통일: 날짜 | 브랜드 | 제목 | 내용 | 태그 | 중요도 | 작성자 | 채널
- `<tfoot sticky>` 로 "전체 N건 중 M건" 표시
- 태그 불릿 제거, `line-clamp` 전부 해제
- 브랜드·날짜 텍스트 크기 `text-xs` 통일

### 4. 스타일 통일 (badges.tsx, table-view.tsx, timeline-view.tsx)
- `TagBadge`: 패딩 `px-2 py-[3px]` → `px-1.5 py-[1px]`, `font-semibold` → `font-medium`, 불릿 dot 제거
- `TagBadge` null guard 추가 (`key_tags`에 알 수 없는 값 있을 때 crash 방지)
- `PriorityBars` showLabel 제거 (bars only)
- 테이블 row: `px-5 py-2`, `border-t`, `hover:bg-muted/40` 로 raw-data-view 기준 통일

### 5. 마크다운 렌더링 개선 (daily-report-view.tsx, timeline-view.tsx)
- 고아 `*` (짝 없는 asterisk) 제거: `part.replace(/\*/g, '')` — 두 파일 모두 적용
- **헤드라인**: 문장별 번호 목록 (`HeadlineSentences` 컴포넌트)
- **카드·드로어 본문**: `BodyBullets` — 줄 분리 → 불릿 마커 제거 → 문장 부호 기준 개행 → `•` 불릿
- 대상: ActionGrid summary, DecisionGrid desc, Drawer summary, RelatedItemCard body, 과거 유사 내역 body
- SKILL.md에 볼드 마킹 규칙 추가: `**text**` 쌍 필수, 홀수 `*` 금지

### 6. 탭 이름·아이콘·순서·변수명 전면 영문화
- **순서** (파이프라인 순): Raw Data → Daily List → Daily Report → Weekly List → Timeline → Calendar
- **이름**: `데일리 리포트`→`Daily Report`, `테이블`→`Daily List`, `위클리 요약`→`Weekly List`, `타임라인`→`Timeline`, `일정`→`Calendar`
- **ViewKey 리네이밍**: `daily`→`dailyreport`, `table`→`dailylist`, `weekly`→`weeklylist`, `schedule`→`calendar`
- **아이콘**: Daily Report `Sparkles`→`Newspaper`, Weekly List `GitBranch`→`Table`
- Tasks 뷰도 동일 패턴: `normal`→`basic`(Basic View), `list`→`listview`(List View), 나머지 영문 레이블

---

## 최근 변경 (2026-05-25) — 액션 아이템 드로어 + 뷰 구조 개편 + SKILL thread_id 이월 규칙

### 1. 액션 아이템 클릭 드로어 (`daily-report-view.tsx`)
- **`ActionDetailDrawer`** 신규: 챙겨야 할 것 카드 클릭 시 우측 Drawer 오픈
  - 상단: 브랜드 뱃지 + 우선순위 바 + 제목
  - 상황 요약 + 필요한 액션(점선 박스)
  - **관련 내역**: 해당 날짜 · 브랜드의 `client_history` 조회 → AI 요약 + 원본 Slack 메시지(접기/펼치기)
  - **과거 유사 내역**: 같은 태그가 겹치는 과거 5건 (날짜 + 제목 + 태그)
  - 푸터: "태스크 생성" 버튼 (제목·메모 프리셋으로 `TaskFormDialog` 오픈)
- 카드 호버 시 우상단에 미니 "태스크" 버튼 노출 (드로어 없이 바로 태스크 생성)
- 섹션이 비어 있어도 항상 표시 (`—` 빈 상태 컴포넌트)
- `slackTextClean()`: Slack mrkdwn 링크·채널·사용자 태그 정리 함수 추가

### 2. 뷰 구조 개편 (`history-shell.tsx`, `history-sidebar.tsx`)
- 뷰 키 리네이밍:
  - `insight` → `daily` (데일리 리포트)
  - `timeline` → `weekly` (위클리 요약, 기존 TimelineView)
  - 신규 `timeline` — `ThreadTimelineView` (주차별 컬럼·카드·베지어 화살표)
  - 신규 `schedule` — `ScheduleCalendarView`
- 탭 추가: "일정(CalendarDays)", "타임라인(GitMerge)"
- 기본 뷰 변경: `insight` → `daily`
- `ThreadTimelineView`에 `dateFrom`, `dateTo`, `brandFilter` prop 연결
- `ScheduleCalendarView` 렌더 연결

### 3. 타임라인 사이드바 브랜드 필터 (`history-sidebar.tsx`)
- `view === 'timeline'` 사이드바 신규: 기간 선택 + 브랜드 필터 버튼 목록
- `clients` prop, `brandId`/`onBrandChange` prop 추가
- 모든 사이드바 패널에 스크롤바 숨김 클래스 통일

### 4. SKILL.md — thread_id 이월 규칙 + 참조 범위 확장
- 데일리 리포트 참조: "현재 주 타임라인" → "현재 주 + 직전 주 타임라인"
- 타임라인 생성 참조: "이전 1주" → "이전 2주 (thread_id 포함)"
- thread_id 이월 3케이스 문서화:
  - **이월**: 같은 브랜드 + 같은 주제 → 직전 주 `thread_id` 재사용
  - **신규**: 처음 등장 → thread_id 생략(DB 자동)
  - **분기**: 하나 이슈 → 여러 세부 이슈 → `parent_thread_ids` 배열 기록
- 각 케이스별 INSERT SQL 예시 추가

### 5. 전역 스크롤바 숨김 (`globals.css`)
- `html`, `body`에 `overflow: hidden`, `scrollbar-width: none`, `::-webkit-scrollbar { display: none }` 전역 적용

### 검증
- `npx tsc --noEmit` 통과 예정 (변경 중)

---

## 최근 변경 (2026-05-24) — 테이블 브랜드 카운트 고정 + Drawer 우측 그림자 버그 수정

### 1. 테이블 뷰 브랜드 카운트 안정화
- **문제**: 테이블 뷰 상단 브랜드 필터 배지의 숫자·순서가 무한스크롤로 데이터가 늘어날 때마다 바뀌는 문제
- **원인**: `brandCounts`를 로드된 `items` 배열 기준으로 매번 재계산
- **수정**:
  - `history-service.ts` — `HistoryPage`에 `brandCounts?: Record<string, number>` 추가. 첫 페이지(cursor 없을 때)에 동일 필터로 전체 브랜드별 카운트 쿼리를 병렬 실행해 반환
  - `history-shell.tsx` — `PageState`에 `brandCounts` 추가, `append: true`(추가 로드) 시 갱신하지 않음
  - `table-view.tsx` — `brandCounts` prop 수신 후 우선 사용, 없을 때만 items 기준 집계로 폴백

### 2. Drawer 우측 그림자 번짐 버그 수정
- **문제**: 화면 우측 가장자리에 반투명 그림자가 항상 표시됨 (스크롤바와 무관)
- **원인**: `Drawer` 컴포넌트가 `open=false`일 때도 DOM에 유지되며 `translate-x-full`로 뷰포트 밖으로 밀림. `shadow-2xl`의 blur(50px)가 패널 왼쪽 가장자리(= 뷰포트 우측)에서 안쪽으로 번짐
- **수정** (`drawer.tsx`): `open=false` 시 `boxShadow: 'none'`으로 전환, `transition: transform 300ms, box-shadow 300ms`으로 슬라이드 아웃과 함께 그림자도 서서히 사라지도록 처리

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-24) — 수집 기능 분리 + 1/19~2/5 분류·데일리 리포트 생성

### 1. 수집 기능 분리 (history-shell → collect-raw)
- **`history-shell.tsx`**: 슬랙 수집 UI/로직(SSE, 날짜 입력, 수집 버튼, 상태 표시) 전체 제거
- **`raw-data-view.tsx`**: "재수집" 버튼을 `/api/slack/collect` → `/api/slack/collect-raw` (`{from, to}`) 호출로 변경
- **`/api/slack/collect/route.ts`**: 더 이상 호출되지 않아 삭제
- 수집 UI는 `RawDataSidebarPanel`(history-sidebar.tsx 내)과 Raw Data 뷰에서 담당

### 2. 분류 + 데일리 리포트 생성 (1/19 ~ 2/5)
- **기존 상태**: 분류 ~1/21, 데일리 리포트 ~1/16
- **완료**: 15영업일(1/19~2/5) 분류 ~225건 + 데일리 리포트 15건
- **다음 이어할 지점**: 2/6부터
- 분류: `client_history` 테이블에 raw_message_id 연결하여 INSERT
- 데일리 리포트: `daily_reports` 테이블에 content JSONB (headline, action_items, upcoming, pending, decisions)

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-24) — Raw Data 날짜 범위 확장 + 탭 순서 고정

### 변경 내용
- **`raw-data-view.tsx`**: 미수집 날짜 채우기 시작일 `2026-03-01` → `2026-01-01`, 주말 제외 조건 제거
  - 2026-01-01부터 오늘까지 전체 날짜를 항상 표시 (수집 이력 없으면 수집·분류·채널 모두 0)
- **`history-shell.tsx`**: `VIEW_TABS` 순서 rawdata → 타임라인 → 인사이트로 확정 (이미 앞에 있었음 확인)

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-23) — 기간 Raw 수집 엔드포인트 + 사이드바 UI

### 배경
- 4월 전체 Slack 메시지를 AI 분류 없이 raw JSON만 빠르게 수집해야 하는 필요
- 기존 `collect` 엔드포인트는 AI 분류까지 포함되어 있어 날짜 범위 bulk 수집에 부적합

### 1. `/api/slack/collect-raw` 엔드포인트 신규 생성
- `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }` 입력, SSE 스트리밍 응답
- 기존 `collect` route의 1~6단계(검색 → 필터 → 스레드 fetch → `slack_raw_messages` upsert)만 수행, AI 분류(7단계) 생략
- 날짜 범위 전체를 순회하며 일별 진행 상황을 SSE로 전송
- 브랜드 매핑 + 사용자 디렉토리는 루프 밖에서 1회만 조회

### 2. Raw Data 사이드바 — `RawDataSidebarPanel` 컴포넌트 신규
- `history-sidebar.tsx`의 rawdata early-return을 별도 컴포넌트로 분리
- from/to 날짜 입력 + "Raw 수집" 버튼 (기본값: 2026-04-01 ~ 2026-04-30)
- SSE 진행 메시지를 패널 하단에 실시간 표시
- 수집 완료 후 `✓ 완료 — N일 / 총 M건 Raw 저장` 메시지

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-23) — Raw Data 뷰 개선 + 재분류 API

### 배경
- Summary Raw Data 탭에서 날짜별 수집/분류 현황을 확인하고 직접 재처리할 수 있는 뷰 필요
- `slack_raw_messages` 1,805건 이상 누적 시 Supabase JS 기본 1,000행 제한으로 최근 날짜(5.16~5.22)가 0으로 표시되는 버그 발생

### 1. `raw-data-view.tsx` 전면 재설계
- 컬럼: 날짜 (`yyyy.MM.dd (eee)`) / 채널 수 / 수집 / 분류 / 제외(수집-분류) / 마지막 수집
- 상단 요약 바: 전체 기간 합계 표시
- **월별 그룹핑 + 부분합 행**: `bg-amber-50 border-t-2 border-amber-200` 스타일로 헤더(`bg-muted`)와 구분
- 테이블 헤더: `sticky top-0 bg-muted` — 스크롤 시 고정

### 2. Supabase RPC 함수 2개 신규 생성 (1,000행 제한 우회)
- `get_raw_message_stats(p_workspace_id uuid)` → 날짜별 집계 (date_kst, raw_count, channel_count, last_collected)
- `get_raw_messages_by_date(p_workspace_id uuid, p_date date)` → 특정 날짜의 raw 행 전체 반환
- KST 변환: `(to_timestamp(parent_ts::float) AT TIME ZONE 'Asia/Seoul')::date`
  (`parent_ts`가 Slack Unix timestamp를 `text`로 저장하므로 `::float` 캐스팅 필요)

### 3. `/api/slack/reclassify` 엔드포인트 신규 생성
- 기존 `collect`(Slack API에서 새로 가져옴)와 달리 **기존 raw 데이터 기반 강제 재분류**
- `get_raw_messages_by_date` RPC → `isObviousNoise` 필터 → AI 분류 (배치 5건 병렬) → `client_history_summaries` 아카이브 → `client_history` upsert
- 전 과정 SSE 스트리밍, 완료 시 `완료 — 재분류 N건, 제외(노이즈 N, AI제외 N)` 결과 반환

### 4. 재수집 / 재분류 버튼
- 각 행 우측에 두 버튼 병렬 배치 (`RefreshCw` 재수집 / `Sparkles` 재분류)
- 재분류: `rawCount === 0`이면 비활성
- 진행 중: 두 버튼 모두 비활성, 상태 메시지를 "마지막 수집" 열에 표시
- SSE 완료 후 결과 다이얼로그 → 테이블 자동 갱신

### 5. SSE 공통 헬퍼 `runSSE()` 추출
- 수집·재분류 두 액션의 동일한 스트리밍 패턴을 `(url, date, setState, tag)` 파라미터 함수로 통합

### 검증
- `npx tsc --noEmit` 통과

---

## 최근 변경 (2026-05-23) — Slack 채널 → 브랜드 매핑 설정

### 배경
- Summary 화면에서 미분류 490건(전체 800건의 61%)이 DM 채널 등 자동 매칭 실패로 발생
- 채널 → 브랜드를 명시적으로 지정하는 설정 화면 추가

### 1. DB: `slack_channel_mappings` 테이블 신규 생성 (Supabase)
- `channel_id`, `channel_name`, `is_dm`, `dm_user_id`, `dm_user_name`, `client_id` (FK → clients)
- UNIQUE(workspace_id, channel_id), RLS 적용

### 2. `src/lib/slack-service.ts` 업데이트
- `ChannelMapping` 인터페이스 추가
- `matchBrand()` 시그니처 변경: `(channel, channelId, text, clients, channelMappings?)` — 채널 매핑 테이블 최우선 적용
- `fetchChannelMappings(sb, workspaceId)` 함수 추가

### 3. 수집 파이프라인 업데이트
- `collect/route.ts`: `fetchChannelMappings` 병렬 조회 추가, `matchBrand` 호출 시 `channel_id` + `channelMappings` 전달
- `update-threads/route.ts`: 동일 처리
- `debug-classify/route.ts`: `channel_id` 전달 (매핑 없이)

### 4. API 라우트 3개 신규
- `GET /api/slack/channels`: `conversations.list`로 전체 채널 조회, DM은 `fetchUserDirectory`로 이름 해석, 기존 매핑 포함 반환
- `POST /api/slack/channel-mappings`: 매핑 배열 upsert
- `POST /api/slack/remap-history`: 채널 매핑 기준으로 기존 `client_history.client_id` 즉시 업데이트 (AI 재분류 없음)

### 5. 설정 UI
- `settings-shell.tsx`: NAV에 "Slack 채널" 섹션 추가, 연동 탭의 "준비 중" 카드 제거
- `channel-mapping-section.tsx` 신규: 채널 목록 불러오기 → 브랜드 드롭다운 → 저장 → 기존 이력 재매핑 버튼

### 검증
- `npm.cmd run typecheck` 통과
- `npm.cmd run test` 통과 (3 files / 16 tests)

---

## 최근 변경 (2026-05-23) — Command Center 1차 퍼블리싱

### 배경
- 제품 정의 재정리: Wald는 회사 운영자가 조직 상태를 읽고, 고객/팀/프로젝트 이슈를 놓치지 않으며, 자신의 하루 업무까지 실행으로 연결하는 **개인-조직 통합 운영 OS**
- 기존 `/` 첫 화면이 Projects/Gantt였지만, 운영 OS 관점에서는 하루를 시작하는 **운영 브리핑 / Command Center**가 첫 화면에 더 적합

### 1. `/` — Command Center 서버 컴포넌트로 교체
- `src/app/(app)/page.tsx`
- Supabase 서버 클라이언트로 workspace 범위 데이터 조회:
  - `gantt_tasks`: 열린 태스크, 오늘/이번 주 마감, 지연, pending, scheduled task
  - `gantt_projects`: 2주 내 종료/지연 프로젝트 리스크
  - `client_history`: high priority 고객 신호, decision/mention 태그 항목
  - `clients`: 브랜드 도트/이름 매핑
  - `weekly_insights`: 최신 Weekly headline/stats/changes
- 화면 섹션:
  - 오늘 실행 / 지연 태스크 / 고객 이슈 / 이번 주 마감 metric cards
  - “지금 볼 것” focus queue
  - 오늘의 시간: scheduled task와 planned hours
  - 내 실행 큐
  - 고객 신호
  - 결정 대기
  - 프로젝트 리스크
  - 팀 워크로드
  - Weekly 인사이트
  - 나를 부른 일

### 2. 기존 Gantt 홈 보존
- 기존 `/` Gantt 화면을 `src/app/(app)/projects/page.tsx`로 복사
- `/projects`에서 기존 Projects/Gantt 기능 유지

### 3. AppNav 수정
- `src/components/AppNav.tsx`
- 좌측 내비게이션 분리:
  - `/` → `Home` (`Sparkles` 아이콘)
  - `/projects` → `Projects` (`BarChart2` 아이콘)

### 디자인 방향
- 기존 Wald 디자인 시스템 유지:
  - 48px 상단 바
  - 작은 운영형 타이포그래피
  - `bg-card`, `bg-muted`, `border-border`, `ink/lilac/status` 토큰 사용
  - 카드 중첩 없이 패널 단위로 정보 밀도 있게 구성
- 랜딩/마케팅 스타일이 아니라 실제 운영자가 스캔하는 업무 화면으로 구성

### 검증
- `npm.cmd run typecheck` 통과
- `npm.cmd run test` 통과 (3 files / 16 tests)
- `npm.cmd run build` 통과
- `npm.cmd run lint` 실패:
  - 이번 변경 파일 문제가 아니라 기존 Calendar/Tasks/Settings/Weekly 컴포넌트의 React 19 lint 규칙(`react-hooks/set-state-in-effect`, refs/immutability 등) 위반 다수
- 인앱 브라우저 실제 데이터 확인:
  - `/` → `Command Center - Wald` 정상 렌더링
  - 주요 섹션 표시 확인: metric cards, 지금 볼 것, 오늘의 시간, 내 실행 큐, 고객 신호, 결정 대기, 프로젝트 리스크, 팀 워크로드, Weekly 인사이트, 나를 부른 일
  - 브라우저 콘솔 error/warning 없음

### 실사용 검증 후 보정 (2026-05-23)
- `고객 이슈` metric이 표시용 5건 slice 기준으로 보이던 문제 수정 → 전체 high priority 개수 기준 표시
- `오늘 실행` metric에서 오늘 마감/오늘 배치 태스크 중복 가능성 제거 → task id Set 기준 count
- Weekly 인사이트의 `**bold**` 마크다운 문자가 그대로 보이던 문제 수정 → Command Center에서는 plain text로 정리해 표시
- Summary dev overlay 원인 수정:
  - `history-shell.tsx`의 Slack 수집 날짜 helper가 깨진 상태(`todayStr` 주변 문법 오류)였음
  - `handleCollect`가 오늘 날짜 helper를 사용하도록 복구
  - `npm.cmd run typecheck` 재통과

### 다음 후보
- Command Center 카드별 링크를 필터가 적용된 상세 화면으로 정교화
- Triage Inbox: Slack/Weekly/Notes 신호를 “검토 → 위임 → 태스크화 → 결정대기 → 무시”로 처리하는 큐
- Decision Log: decision 태그를 1급 객체로 승격
- People/Workload: 문자열 assignee를 조직/팀/구성원 모델로 확장

---

## 최근 변경 (2026-05-23) — Command Center 링크 정교화

### 배경
- Command Center 1차 퍼블리싱 후 실제 데이터 확인 결과, 화면은 정상 렌더링되지만 대부분의 링크가 `/tasks`, `/summary`, `/calendar` 같은 큰 화면으로만 이동
- 운영 브리핑 화면의 목적상 숫자/항목 클릭 시 바로 해당 문제 목록으로 이동해야 함

### 1. Tasks URL 필터 초기값 지원
- `src/app/(app)/tasks/_hooks/use-task-filters.ts`
- `useSearchParams`로 URL 파라미터를 초기 필터 state에 반영:
  - `quick`: `overdue`, `start-delayed`, `due-today`, `due-this-week`, `due-next-week`, `done`
  - `project`
  - `assignee`
  - `label`
  - `q`
- `/tasks?quick=overdue` 진입 시 지연 필터가 바로 적용되는 것 확인

### 2. `/tasks` Suspense boundary 추가
- `src/app/(app)/tasks/page.tsx`
- `useSearchParams` 사용으로 Next.js build에서 `missing-suspense-with-csr-bailout` 오류 발생
- 기존 TasksPage 본문을 `TasksPageContent`로 분리하고 default export에서 `<Suspense>`로 감쌈

### 3. Command Center 링크 교체
- `src/app/(app)/page.tsx`
- metric cards 클릭 가능하게 변경:
  - 오늘 실행 → `/tasks?quick=due-today`
  - 지연 태스크 → `/tasks?quick=overdue`
  - 고객 이슈 → `/summary?priority=high`
  - 이번 주 마감 → `/tasks?quick=due-this-week`
- 패널/행 링크 정교화:
  - 지금 볼 것 → 지연/이슈/오늘 항목별 필터 URL
  - 오늘의 시간 → `/calendar?date=YYYY-MM-DD`
  - scheduled task → `/calendar?date=YYYY-MM-DD&highlight=taskId`
  - 내 실행 큐 task → quick filter + `q` 검색어
  - 고객 신호 → `/summary?priority=...&q=...`
  - 결정 대기 → `/summary?tags=decision&q=...`
  - 나를 부른 일 → `/summary?tags=mention`
  - 팀 워크로드 담당자 → `/tasks?assignee=담당자명`

### 검증
- `npm.cmd run typecheck` 통과
- `npm.cmd run test` 통과 (3 files / 16 tests)
- 인앱 브라우저:
  - Command Center DOM snapshot에서 metric/row 링크 URL 확인
  - `지연 태스크` metric 클릭 → `/tasks?quick=overdue` 이동 확인
  - Tasks 화면에서 지연 필터 적용 확인
- `npm.cmd run build`:
  - 최초 시도에서 `/tasks` Suspense boundary 필요 오류 확인 후 수정
  - 네트워크 권한으로 재실행해 통과 (Google Fonts fetch 필요)
- 마감 재검증:
  - `/` Command Center에서 `고객 이슈` count 22건 표시 확인
  - `/summary?priority=high`에서 전체 800건 중 high priority 183건 표시 확인
  - `npm.cmd run typecheck` 통과
  - `npm.cmd run test` 통과 (3 files / 16 tests)

---

## 2026-05-22 — 슬랙 리마인더 (Vercel Cron)

### 개요
매일 09:00 KST에 Vercel Cron이 `/api/reminders/slack`을 호출 → 지연/오늘 마감/내일 마감 태스크를 슬랙 DM으로 발송

### 변경 파일
- `src/app/api/reminders/slack/route.ts` 신규: Supabase admin client로 태스크 조회, Slack Block Kit 메시지 작성, `chat.postMessage`로 DM 발송
- `vercel.json` 신규: `schedule: "0 0 * * *"` (UTC 00:00 = KST 09:00)

### 필요한 환경변수 (추가 필요)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 대시보드 → Settings → API → service_role key
- `CRON_SECRET`: Vercel 대시보드 자동 생성 (배포 시)
- Slack 봇에 `chat:write` 스코프 추가 필요

### 메시지 형식
- 지연 (N일 초과)
- 오늘 마감
- 내일 마감
- 높은 우선순위 태스크 플래그

---

## 2026-05-22 — 반복 태스크 기능 추가

### 개요
태스크를 완료하면 자동으로 다음 인스턴스를 생성하는 반복 기능 추가 (매일/매주/매월/매년, N단위 간격 지원)

### DB
- `gantt_tasks`에 컬럼 3개 추가 (Supabase migration)
  - `recurrence_rule`: 'daily' | 'weekly' | 'monthly' | 'yearly'
  - `recurrence_interval`: N일/N주/N개월마다 (기본 1)
  - `series_id`: uuid — 같은 반복 시리즈 인스턴스 연결

### 변경 파일
- `types/index.ts`: `RecurrenceRule` 타입 추가, `GanttTask`에 반복 필드 3개 추가
- `lib/gantt-service.ts`: `addTask`/`updateTask` 시그니처 확장, `createNextRecurringInstance()` 함수 신규 추가
- `components/tasks/TaskFormDialog.tsx`: info 탭 하단에 반복 설정 섹션 추가 (없음/매일/매주/매월/매년 + 간격 입력)
- `tasks/_components/TaskDetailDrawer.tsx`: 동일한 반복 설정 섹션 추가
- `tasks/_hooks/use-tasks-data.ts`: 완료 시 `createNextRecurringInstance` 호출 + 토스트 알림
- `tasks/_components/TaskRow.tsx`: 반복 아이콘(`RotateCw`) 뱃지 추가

### 동작 방식
1. 태스크 생성/수정 시 반복 규칙 설정
2. 완료(done) 클릭 → 다음 날짜 계산 → 동일 필드(제목/담당자/우선순위/라벨/프로젝트 등)로 신규 태스크 생성
3. 토스트: "반복 태스크 완료 — 다음 인스턴스를 생성했어요 (MM/DD)"
4. 간격 설정: daily/weekly는 N일/N주 단위, monthly는 N개월 단위, yearly는 1년 고정

---

## 최근 변경 (2026-05-22) — Summary 목록 단순화: burst 그룹 제거 + 스레드만 디테일에 표시

### 배경
- 사용자 정리: "본문글만 목록에 올라오고, 스레드는 본문글에 딸려서 관련 메시지로 나오는거야"
- burst 그룹화(같은 채널 ±30분 sliding window)는 추측 기반이라 부정확. 실제 Slack 스레드 관계만 사용하기로

### 1. `table-view.tsx` — burst grouping 완전 제거
- `groupByBurst`, `representatives`, `childrenByRep`, `burstMembers` 로직 제거
- `dateGroups`는 다시 `items`(client_history의 모든 본문/parent) 기준
- DetailPanel에서 burstMembers prop 제거 → `thread_replies`(raw_json.replies) 박스만 표시
- 카드 우측 도트: `thread_count > 0` 일 때만 (라일락 색)
- 미사용 import 제거 (`Layers`, `groupByBurst`)

### 2. 마이그레이션 UI 버튼 추가 (history-shell.tsx)
- DevTools console paste 제한(self-XSS 보호) 대응
- 새로고침 버튼 옆에 **`UserCog` 아이콘 + "이름 동기화"** 보조 버튼
- 클릭 → `POST /api/slack/migrate-user-names` 호출 → 토스트로 갱신 카운트 표시 → 페이지 새로고침
- `isMigrating` 로컬 state로 중복 클릭 방지

### 영향
- `ext-snowflake-etl` 같은 burst 채널은 다시 모든 메시지가 각각 목록에 표시 (Slack 데이터 그대로)
- 실제 thread_count > 0 본문만 우측에 스레드 답변 박스로 보임
- `_lib/related.ts`의 `groupByBurst`는 코드만 보존 (호출 안 함)

### 검증
- `npx tsc --noEmit` 통과

---

## 이전 변경 (2026-05-22) — 기존 데이터 작성자 표시 이름 마이그레이션 API

### 신규 라우트: `POST /api/slack/migrate-user-names`
- `fetchUserDirectory(slack)` 호출 → users.list 매핑 확보
- `slack_raw_messages` 전체 조회 (workspace 범위, limit 10000)
  - `raw_json.user_name` + `raw_json.replies[].user_name` 모두 `resolveUserName(userDir, user, fallback)` 으로 재계산
  - 메모리에서 변경 감지 후 실제 변경된 행만 UPDATE (배치 5건 병렬)
- `client_history` 전체 조회 (`raw_message_id` 있는 것, limit 20000)
  - raw_json의 user_id로 디렉토리 lookup → author 갱신
  - 변경된 행만 UPDATE
- 응답: `{ directory_size, raw_scanned, raw_updated, history_scanned, history_updated }`

### 호출 방법
브라우저 DevTools Console (로그인 세션 사용):
```js
fetch('/api/slack/migrate-user-names', { method: 'POST' })
  .then(r => r.json()).then(console.log)
```

### 검증
- `npx tsc --noEmit` 통과

---

## 이전 변경 (2026-05-22) — 작성자 표시 이름 디렉토리 매핑

### 배경
- AI 분류가 생성한 `author` 또는 search 결과의 `username`(영문 handle, e.g. `shindoohwa`)이 그대로 표시됨
- 사용자는 Slack에서 실제 보이는 한국어 표시 이름(예: `신두화`, `김형종`) 원함

### 1. `slack-service.ts` — `fetchUserDirectory()` + `resolveUserName()` 추가
- `users.list` paginated 호출 (200건씩, cursor 기반, max 20페이지)
- 우선순위: `profile.display_name` > `profile.real_name` > `name` > `user_id`
- `resolveUserName(dir, userId, fallback)` — 디렉토리 hit 우선, miss면 fallback chain

### 2. `collect/route.ts` 적용
- Step 1에서 `fetchClientsForWorkspace` + `fetchUserDirectory` 병렬 호출
- 부모/orphan 부모/replies 모두 `user_name` 채울 때 `resolveUserName(userDir, user, username)` 적용
- `client_history.author`도 `resolveUserName(userDir, rj.user, result.author || rj.user_name)` — AI 결과는 fallback으로 활용

### 3. `update-threads/route.ts` 동일 처리
- `fetchUserDirectory` 추가
- replies와 `client_history.author` lookup 적용

### 영향
- 신규 수집/업데이트되는 메시지부터 한국어 display_name으로 표시
- 기존 데이터는 다음 collect/update-threads 시 점진적 개선
- `users.list` 1회당 워크스페이스 멤버수에 따라 200/페이지 — 보통 200~400ms

### 검증
- `npx tsc --noEmit` 통과

---

## 이전 변경 (2026-05-22) — Summary burst 그룹 강제 묶기 + 도트 표시 + 일별 캘린더

### 배경
- 직전 변경(burst 토글)에서 좌측 목록에 burst 멤버가 모두 노출됨 → "스레드는 목록에 있으면 안 되고 본문에 하위로 있어야 한다"는 피드백
- 사이드바 캘린더가 월 그리드(4×3)였는데, 디자인은 일별 그리드(요일 헤더 + 6주)

### 1. `_lib/related.ts` — `groupByBurst()` 추가
- sliding window(±N분) 기반으로 같은 채널 인접 메시지를 한 그룹으로 묶음
- 그룹 "대표"는 시간상 가장 빠른 메시지
- 결과: `{ representative, members }[]` (대표 occurred_at 내림차순)

### 2. `table-view.tsx` — 강제 그룹화 + 도트
- `items`를 `groupByBurst(items, 30)` 통과시켜 **대표만 목록에 표시**
- 키보드 J/K 내비게이션도 대표 단위로 동작
- 카드 우측에 **`bg-lilac-500` 도트**: `thread_count + burst child count > 0` 인 항목 표시
- 디테일 패널에 **"관련 메시지 N" 박스 자동 노출** (토글 제거) — 각 멤버: 작성자·시간·제목·본문 카드
- `allItems` prop · `onSelectItem` · `onOpenItem` · `relatedOpen` 상태 제거
- `findRelatedItems` import 제거 (이제 `groupByBurst`만 사용)

### 3. `history-sidebar.tsx` — 일별 캘린더로 교체
- `MonthGridSection`: 12개 월 그리드 → **요일 헤더(일/월/화/수/목/금/토) + 6주 일별 그리드**
- 일요일 빨강(`text-rose-500`), 토요일 파랑(`text-blue-500`), 다른 달 dim
- 선택된 날: `bg-lilac-500 text-white`
- **이력 있는 날 하단에 작은 도트** (일별 `dayCounts` 카운트)
- 오늘 날짜에 작은 점(`text-lilac-500`) 표시
- 월 네비게이션: `< 2026년 5월 NOW >` 형태
- `history` prop 추가 (일별 카운트 계산용)

### 검증
- `npx tsc --noEmit` 통과
- ESLint: 새 코드 0 경고 (pre-existing `useEffect setState` 1건 제외)

---

## 이전 변경 (2026-05-22) — Summary 페이지 디자인 개편 + burst 대화 그룹화

### 배경
- 디자인 요청: 더 깔끔한 사이드바(브랜드 리스트 통합) + 상단 단순화(2 탭 + 새로고침) + 디테일 패널 강화
- UX 이슈: Slack 스레드 미사용 채널(예: `ext-snowflake-etl`)에서 사람들이 채널 본문에 줄줄이 답변 → DB엔 정확히 별도 행으로 저장되지만, 사용자는 한 흐름으로 보고 싶어 함 ("본문과 스레드가 분리돼 보임")

### 1. `_lib/related.ts` 신규 — `findRelatedItems()`
- 같은 채널 + occurred_at 윈도우(기본 ±30분) + 자기 제외
- 결과를 시간 오름차순 정렬

### 2. `table-view.tsx` 디테일 패널 개편
- 헤더: 채널 칩 제거 → 우선순위 칩 + 브랜드 칩, 날짜 `M/d HH:mm` 간결화
- 제목: `text-sm` → `text-base`
- 본문/스레드 답글: `text-[13px]`, leading 1.6 통일
- 스레드 박스 헤더에 `MessageSquare` 아이콘 추가
- 메타 푸터 작성자 표시: `[브랜드명] 이름` prefix
- **`+ 관련 이력 N` 액션 버튼 추가** — burst 대화 카드 토글 (브랜드 도트 + 작성자 + 시간 + 제목)
- TableView main에 `allItems` prop (필터 무관 전체 풀에서 관련 이력 검색)

### 3. `history-shell.tsx` 상단 바 개편
- 뷰 탭: `테이블/인사이트/요약` → `인사이트/타임라인` (요약 탭 제거, 테이블→타임라인 리네임. URL 'table' 키는 호환 유지)
- 우측: 상대 시간 표시 + dark 새로고침 버튼 (collect만 호출)
- `[스레드]` 버튼·`handleUpdateThreads`·`isUpdating` state 제거 (Phase 1-A 이후 거의 불필요)
- 상단 `BrandSelector` 칩 바 제거 → 사이드바로 이동

### 4. `history-sidebar.tsx` 사이드바 재구성
- "오늘" preset 빠른 버튼 (오늘 카운트 표시)
- **브랜드 섹션 신규**: 도트 + 이름 + 카운트, 활성 토글
- 태그/중요도 섹션 유지

### 검증
- `npx tsc --noEmit` 통과
- ESLint: 새 코드 0 경고 (기존 `useEffect setState` 1건은 pre-existing)

---

## 이전 변경 (2026-05-22) — 프로젝트 간트 오늘 날짜 선 위치 수정

### 문제
- 월/주/일 뷰 모두 오늘 날짜 선(보라색 세로선)이 헤더의 오늘 지표와 시각적으로 안 맞는 문제

### 원인 및 수정
1. **주 뷰** — `todayX = idx * colW + dayOfWeek / 7 * colW`: 월요일(dayOfWeek=0)이면 선이 컬럼 좌측 경계(전주 경계선 위)에 그려져 시각적으로 이 주 컬럼 안에 없는 것처럼 보임
   - 수정: `(dayOfWeek + 0.5) / 7 * colW` — 오늘 요일 슬롯의 **중앙**에 위치
2. **일 뷰** — `todayX = idx * colW`: 컬럼 좌측 경계(어제/오늘 경계선)에 그려져 헤더 날짜 숫자(컬럼 중앙)와 14px 어긋남
   - 수정: `idx * colW + colW / 2` — 오늘 컬럼 **중앙**
3. **`dayOffsetInWeeks` 타임존 버그** — `new Date(dateStr)`이 UTC 자정으로 파싱(KST에서 +9시간 오프셋)되어 바 위치가 ~2px 우측으로 밀림
   - 수정: `parseDateStr(dateStr)` 사용(로컬 자정 파싱)

### 변경 파일
- `src/components/gantt/GanttChart.tsx` — 주·일 뷰 `todayX` 계산 수정
- `src/lib/gantt-utils.ts` — `dayOffsetInWeeks` UTC 파싱 버그 수정

---

## 이전 변경 (2026-05-22) — Slack 수집 속도 최적화 (Phase 2)

### 배경 — 50건 기준 약 110초 → 목표 ~15초
- 가장 큰 병목: AI 분류 (Claude Haiku) 호출이 완전 sequential, 50건이면 ~100초
- 부차 병목: search delay 1200ms × 5페이지, 스레드 fetch delay 300ms × N

### 1. `slack-service.ts` — `isObviousNoise()` 사전 필터 추가
- AI 호출 전 명백한 노이즈 사전 차단:
  - 빈/공백 텍스트
  - 한 단어 답변 (네, 넵, 확인, 감사합니다, ok, thanks 등)
  - 이모지 only (Slack `:emoji:` 코드 또는 유니코드 이모지)
- **스레드가 있으면 항상 false** (짧은 부모라도 답글에 핵심 내용 있을 수 있음)
- `src/lib/slack-service.test.ts` 추가 — 5개 케이스 vitest 검증 (`@vitest-environment node`)

### 2. `collect/route.ts` — AI 분류 배치 병렬화 (Phase 2-A)
- 기존 `for` 루프 sequential → `BATCH_SIZE=5`로 `Promise.all` 병렬
- 각 배치 결과를 `UpsertRow[]`로 모은 뒤 한 번에 `client_history.upsert` (Phase 2-D 부분)
- 사전 필터 통과한 항목만 AI 호출, 통과 못 한 건 즉시 skipped++
- 배치 간 200ms delay (Anthropic rate limit 안전 마진)
- 기존 `await delay(120)` 메시지당 대기 제거

### 3. delay 단축 (Phase 2-C, 2-D)
- search 페이지 간 delay: 1200ms → 800ms
- 스레드 fetch delay: 300ms → 200ms (parent 루프 + orphan 루프 양쪽)

### 영향
- 예상: 50건 기준 ~110초 → ~15초 (약 7배)
- API 호출 패턴: Anthropic은 배치 5개 동시, Slack은 sequential 유지

### 검증
- `npx tsc --noEmit` 통과
- `npx vitest run src/lib/slack-service.test.ts` 통과 (5 tests)

---

## 최근 변경 (2026-05-21) — Slack 수집 로직 3차 수정 (Phase 1-C: update-threads SKIP 조건 개선)

### 배경 — 길이만 비교하던 SKIP의 빈틈
- 기존 `update-threads`는 `replies.length === prevRj.replies.length`로만 SKIP 판정
- 답글 5개 → 누군가 1개 삭제 후 1개 추가 → 여전히 5개지만 내용 달라짐 → SKIP되어 DB 갱신 안 됨
- 결과: client_history의 body와 raw_json의 replies가 부정합

### 1. `update-threads/route.ts` SKIP 조건 강화
- 길이 + 마지막 reply의 `ts` 둘 다 같을 때만 SKIP
- `prevLastTs = prevRj.replies[last]?.ts`, `newLastTs = replies[last]?.ts` 추출 후 비교
- 길이 같지만 마지막 ts 다르면 → 편집/삭제+추가 → UPDATE 실행

### 영향
- 답글 편집/대체 시 데이터 부정합 해소
- SKIP 빈도는 거의 그대로 (보통은 마지막 ts도 같음)

---

## 최근 변경 (2026-05-21) — Slack 수집 로직 2차 수정 (Phase 1-B: orphan 답글 부모 fetch)

### 배경 — search 범위 밖 부모로 인한 데이터 누락
- `search.messages` 결과는 메시지가 발생한 날짜 기준이라, 오늘 답글이 달렸어도 부모가 어제면 부모는 검색에 안 잡힘
- 기존 코드는 `thread_ts !== ts`인 답글을 그냥 필터로 버려서, 오늘 들어온 중요한 답글이 완전히 소실되는 케이스 발생

### 1. `collect/route.ts` — 노이즈 필터 분리 + orphan 부모 추출
- 기존 통합 필터를 `cleanMatches` (노이즈만 제거) → `parents` (search 부모) → `orphanParents` (orphan 답글의 부모 ts)로 3단계 분리
- `orphanParents`: search 결과에서 `thread_ts !== ts`인 답글들의 `thread_ts`를 unique하게 수집
- 이미 `parents`에 포함된 ts는 `seenKeys` 셋으로 중복 제거

### 2. orphan 부모 별도 fetch 루프 (6-b)
- 각 orphan parent에 대해 `conversations.replies(channel, ts: thread_ts)` 호출
- 결과의 `messages[0]`을 부모로 추출, `slice(1)`을 replies로 처리
- 부모가 봇/시스템 메시지면 스킵 (`bot_id`, `subtype === 'bot_message'`)
- permalink는 search 결과가 없으므로 `buildSourceRef(channelId, ts)`로 직접 생성
- fetch 실패 시 기존 `existingMap`의 데이터로 fallback

### 3. existingMap 조회 범위 확장
- `slack_raw_messages` 사전 조회 시 `parents + orphanParents`의 ts를 모두 포함

### 영향
- 어제 부모 + 오늘 답글 케이스의 데이터 누락 해결
- API 호출 증가: orphan parent 수 × 1회 (`conversations.replies`) — Tier 3 한도 50 req/min 내, delay 300ms

---

## 최근 변경 (2026-05-21) — Slack 수집 로직 1차 수정 (Phase 1-A: 스레드 fetch 통합)

### 배경 — 본문과 스레드가 분리되던 버그
- 기존 `collect` 단계는 `replies: []`로 raw_json 저장 → AI 분류가 부모 메시지만 보고 `body` 요약 작성
- `update-threads`로 스레드를 채워도 `body`는 이미 부모만 보고 작성된 상태로 남아 UI에서 분리되어 보임
- `collect` 재실행 시 raw_json 통째로 덮어써서 기존 replies 손실

### 1. `collect/route.ts` — 스레드 fetch를 collect 안으로 통합
- parents 루프에서 `m.reply_count > 0`인 경우 `conversations.replies` 즉시 호출
- 봇 메시지 필터 + `slice(1)`(부모 제외) 후 replies 배열에 채움
- AI 분류가 자동으로 스레드 컨텍스트 포함된 상태에서 동작 (`classifyMessage`의 `raw.replies` 사용)
- delay 300ms (Slack Tier 3 한도 50 req/min 안전 마진)
- 진행 상태 메시지 추가: "스레드 수집 중... (i/N)"

### 2. fetch 실패 시 기존 replies 보존 (재실행 시 데이터 손실 방지)
- 루프 전에 `slack_raw_messages`에서 동일한 `parent_ts` 기존 행을 미리 조회
- `existingMap`에 `${channel}:${parent_ts}` 키로 저장
- `conversations.replies` 호출 실패 시 fallback으로 기존 replies 사용
- `reply_count` 필드는 실제 fetch된 `replies.length`로 갱신

### 3. import 추가
- `RawReply` 타입을 `@/lib/slack-service`에서 import

### 영향
- `update-threads`는 여전히 동작 (오래된 스레드에 새 답글 달린 경우 수동 새로고침용)
- 다음 단계 Plan 1-B (어제 부모 + 오늘 답글 누락 처리), 1-C (SKIP 조건 개선), Phase 2 (병렬화) 대기

---

## 최근 변경 (2026-05-21) — Summary 테이블 뷰 → 스플릿 패널 스레드 뷰어로 재설계

### 1. `HistoryItem` 타입 확장 (`_lib/types.ts`)
- `ThreadReply` 인터페이스 추가: `{ author, occurred_at, text }`
- `HistoryItem.thread_replies?: ThreadReply[]` 옵셔널 필드 추가

### 2. `table-view.tsx` 완전 재작성 — 스플릿 패널 구조
- **왼쪽 패널 (380px 고정)**: 날짜별 그룹 헤더(오늘/어제/날짜) + 스레드 카드 목록
  - 카드: 브랜드 dot+이름, 채널, 시간, 제목(중요도 스타일), 태그 pill
  - 선택 항목: 보라 좌측 보더 + 배경 강조
- **오른쪽 패널 (flex-1)**: 인라인 디테일 (서랍 없음)
  - 헤더 바: 채널 칩, 중요도 배지, 브랜드, 날짜, 항목 카운터, 이전/다음 버튼
  - 본문: 대제목, 태그(클릭 시 필터), 본문 텍스트, 스레드 답글 섹션
  - 메타 푸터: 작성자/브랜드/채널 (클릭 시 필터)
  - 액션 버튼: Slack에서 열기, 할 일로 등록, 일정 만들기
  - 하단 키보드 힌트: ↑↓ 또는 J/K
- 키보드 내비게이션: ↑/K (이전), ↓/J (다음), input 포커스 중일 때 비활성
- 선택 아이템 변경 시 목록 scrollIntoView 자동 처리
- 기존 `onOpenItem` prop은 optional로 유지 (HistoryDetailDrawer와의 호환성)

---

## 최근 변경 (2026-05-20) — Weekly 대시보드 UI 확장 (변경사항 탭 + 집계 표시)

### 1. `ItemRow` 개선 (`weekly-dashboard.tsx`)
- change 배지 표시 (신규/계속/완료/중단) — `CHANGE_META` 색상 시스템 추가
- status 필드 표시 (회색 pill 형태)

### 2. `extractEntries` → `assignee` 필드 추가
- `item.assignee ?? r.author` (item-level 우선, fallback 보고자)

### 3. `DiffSummaryRow` 컴포넌트 신규
- 전주 대비 변경 집계 pill: 신규/계속/완료/중단/사라짐 (count > 0만 표시)

### 4. `ChangesView` 컴포넌트 신규 — "변경사항" 탭
- change 기준 그루핑: 신규 → 계속 → 중단 → 완료
- change 없는 항목 → "분류 없음"

### 5. 뷰별 assignee 반영
- AllView/BrandView: `e.assignee` 사용
- TeamView: `item.assignee` 있을 때만 표시
- AssigneeView: `e.assignee` 기준 그루핑

### 6. "변경사항" 탭 추가 — 탭 2번째 위치

---

## 최근 변경 (2026-05-20) — 태스크 상태 블릿 + 셀 음영 프로젝트 측과 통일

### 1. `STATUS_ABBR` 추가 + `STATUS_GROUPS`에 `abbr` 필드 (`_constants.tsx`)
- 각 상태 약자: B(Backlog) / T(To-Do) / I(In Progress) / D(Done) / P(Pending)

### 2. 상태 블릿 스타일 통일
- **NormalView** 그룹 헤더: `w-2 h-2` 점 → `w-3.5 h-3.5` 색상 원+약자 (`bg-muted` → 상태 bgColor 배경)
- **NormalView** 지연 그룹 헤더: 동일 스타일, 약자 `!`, `var(--task-status-overdue-bg)` 배경
- **ListView** 상태 컬럼: `w-2 h-2` 점 → `w-3.5 h-3.5` 색상 원+약자 (텍스트 라벨 유지)
- **KanbanView** 컬럼 헤더: `w-2.5 h-2.5` 점 → `w-3.5 h-3.5` 색상 원+약자
- Circle/CheckCircle2 완료 토글 버튼은 변경 없음

### 3. 셀 음영 추가
- **NormalView** 그룹 헤더 행: 상태 bgColor 적용 (개별 태스크 행은 유지)
- **ListView** 행: 완료·하위·선택 상태 제외 시 `STATUS_BG_COLOR` 배경 적용
- **KanbanView** 컬럼 본문: drag-over 아닐 때 `bgColor` CSS var 배경 적용

---

## 최근 변경 (2026-05-20) — Weekly 분석 로직 확장 (전주 비교 + 항목 추적)

### 1. `WeeklyReportItem` 스키마 확장 (`src/types/index.ts`)
- 추가 필드: `assignee`, `task_type`, `status`
- 비교 필드: `prev_status`, `change ('new'|'continued'|'completed'|'blocked')`, `prev_title`
- `WeeklyItemChange` 유니온 타입 추가
- `WeeklyDiffSummary` 인터페이스 추가: `{ new, completed, continued, blocked, dropped }`
- `WeeklyInsightContent`에 `diff_summary` 필드 추가

### 2. Phase 1 AI 프롬프트 개선 (`src/app/api/weekly/analyze/route.ts`)
- 전주 보고서를 `prevReportMap`(`source::team` 키)으로 빠르게 조회
- AI 프롬프트에 금주 + 전주 원문 동시 입력 → AI가 change/prev_status/prev_title 직접 채움
- 전주 보고서 없는 경우 모든 항목을 `change: "new"` 처리
- 스킵 조건: 기존 summary에 `change` 필드가 있으면 재분석 생략 (`hasComparisonFields()`)

### 3. diff_summary 집계 추가 (`computeDiffSummary()`)
- 금주 items의 change 값 집계 → new/completed/continued/blocked 카운트
- `dropped` = 전주 전체 항목 수 - (continued + completed + blocked)
- `weekly_insights.content`에 포함해서 저장

---

## 최근 변경 (2026-05-19) — Gantt 날짜 입력 UX 개선

### 1. 날짜 직접 타이핑 입력 (`ProjectFormDialog.tsx`)
- `DatePickerButton`을 텍스트 입력 + 달력 아이콘 병행 방식으로 재작성
- `MM/DD` 또는 `YYYY.MM.DD` 형식으로 직접 타이핑 가능
- blur / Enter 시 파싱 → 유효하면 반영, 잘못된 입력은 이전 값으로 복원
- 달력 선택 시 input 텍스트 자동 동기화

### 2. 그리드 클릭으로 바 즉시 생성 (`_GanttRows.tsx`, `GanttChart.tsx`)
- 날짜 없는 프로젝트 행에 마우스 올리면 crosshair 커서 + ghost bar 미리보기
- 클릭한 위치 기준으로 start/end 날짜 자동 계산 (월뷰 30일, 주/일뷰 7일 기본 범위)
- `EmptyBarHint` 서브 컴포넌트로 hover 상태 분리 (hooks-in-loops 방지)
- `colIndexToDate()` — 열 인덱스를 뷰 모드별로 날짜 문자열로 변환

---

## 최근 변경 (2026-05-19) — 캘린더 UX 개선 + Summary 버그 수정

### 1. 캘린더 그리드 시작 시각 06:00으로 확장 (`_constants.ts`)
- `START_H` 7 → 6 변경, 06:00 시간대 표시

### 2. 현재시각 빨간 선 헤더 뒤로 숨김 (`calendar-shell.tsx`)
- 날짜 헤더 / 업무가능 통계 / 올데이 sticky 행 z-index `z-20` → `z-30`
- 스크롤 시 현재시각 라인(`z-20`)이 헤더 위로 올라오던 버그 수정

### 3. Gantt 바 텍스트 색상 자동 전환 (`_GanttRows.tsx`, `gantt-utils.ts`)
- `isLightColor(hex)` 유틸을 `gantt-utils.ts`에 추가
- 밝은 배경(노란색 등)에서 흰 텍스트가 안 보이던 문제 수정
- 밝은 바 → `rgba(0,0,0,0.75)` / 어두운 바 → `#fff` 자동 선택

### 4. Summary — `SummaryView` 계산 useMemo 적용 (`summary-view.tsx`)
- `tagCounts`, `priorityCounts`, `brandStats`, `topAuthors`, `topChannels` 5개 계산에 `useMemo` 추가
- `items` / `clients` 변경 시에만 재계산

### 5. Summary — 한 달 프리셋 날짜 계산 오류 수정 (`history-shell.tsx`, `history-sidebar.tsx`)
- 29일 고정(`now - 29 * MS`) → `new Date(year, month-1, date)` 방식으로 정확한 1개월 전 계산
- 월별 일수(28~31일)에 관계없이 동일 일자 기준 정확히 1개월 전 반환

### 6. Summary — URL 파라미터 타입 검증 추가 (`history-shell.tsx`)
- `view` / `dateMode` / `priority` / `tags` 4개 파라미터에 파서 함수 적용
- 유효하지 않은 값은 기본값으로 폴백, `tags`는 개별 항목 단위로 검증

---

## 최근 변경 (2026-05-18) — 사이드바 카운트 개선 + 캘린더 딥링크

### 1. Tasks 사이드바 — done 태스크 카운트 제외 (`use-task-filters.ts`)
- 프로젝트·담당자·라벨 카운트 집계 시 `status === 'done'` 태스크 제외
- 완료된 항목이 카운트에 포함돼 실제 활성 작업량과 달랐던 문제 수정

### 2. Tasks 사이드바 — 완료 항목 눈 아이콘 제거 (`TasksSidebar.tsx`)
- '완료' 퀵필터 우측 Eye/EyeOff 버튼 제거 (액션바 토글로 충분)
- 미사용 `Eye`, `EyeOff` import 정리

### 3. 캘린더 뱃지 — from → to 시간 범위 표시 (`TaskRow.tsx`)
- `scheduled_at`만 표시하던 뱃지를 `M/D HH:MM → HH:MM` 형식으로 변경
- `duration_minutes` 없을 시 시작 시각만 표시
- 종일 태스크는 기존대로 `M/D 종일` 유지

### 4. 캘린더 딥링크 — 뱃지 클릭 시 이동 + 하이라이트 (`TaskRow.tsx`, `calendar-shell.tsx`, `time-grid.tsx`, `task-block.tsx`)
- 뱃지 클릭 → `/calendar?highlight=<id>&date=<YYYY-MM-DD>` 이동
- `date` 파라미터로 `weekStart` 초기값 설정 → 주차 이동 플래시 없음
- tasks 로드 후 `?highlight` 감지 → `highlightTaskId` 설정 + `router.replace('/calendar')` URL 클린업
- 해당 태스크 시각 기준으로 스크롤 컨테이너 자동 스크롤 (`smooth`)
- `TaskBlock`에 `highlight` prop 추가 → lilac glow `box-shadow` 번쩍 애니메이션 1.2s (`globals.css` `@keyframes block-flash`)
- `calendar/page.tsx` — `useSearchParams` 사용을 위해 `<Suspense>` 래핑 추가

---

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
