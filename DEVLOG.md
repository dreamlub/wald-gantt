# Wald Gantt — 개발 로그

## 프로젝트 개요

Next.js 16 + Supabase 기반 간트 차트 웹앱.  
워크스페이스 단위로 여러 보드(파일)를 만들고, 카테고리/프로젝트를 관리한다.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | Next.js 16.2.6 (App Router, Turbopack) |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui |
| 백엔드 | Supabase (Auth + PostgreSQL + RLS) |
| 언어 | TypeScript |
| 아이콘 | lucide-react |

---

## DB 스키마

```
workspaces
  id, name, created_at

workspace_members
  workspace_id, user_id, role

gantt_boards
  id, workspace_id, name, sort_order, created_at, updated_at

gantt_categories
  id, workspace_id, board_id, name, color, sort_order, created_at, updated_at

gantt_projects
  id, workspace_id, board_id, category_id, parent_id
  name, status, start_date(YYYY-MM-DD), end_date(YYYY-MM-DD)
  sort_order, team, pm, memo, created_at, updated_at
  deleted_at TIMESTAMPTZ   ← 소프트 삭제

gantt_project_history  ← DB 트리거 자동 기록
  id, project_id, field_name, old_value, new_value, changed_at

gantt_tasks
  id, workspace_id, title
  status: 'backlog' | 'to-do' | 'in-progress' | 'done'
  type: 'mine' | 'delegated'
  assignee TEXT, start_date DATE, due_date DATE, memo TEXT
  sort_order, created_at, updated_at

gantt_task_projects    ← M:N 연결 테이블
  task_id, project_id
```

---

## 주요 기능

### 멀티 페이지 네비게이션
- 앱 좌측 56px 고정 다크 아이콘 레일 (`AppNav`)
- 페이지: 간트(`/`), 태스크(`/tasks`), 주간보고(`/weekly`, 플레이스홀더)
- Next.js `(app)` route group — URL에 영향 없이 레이아웃 공유
- `usePathname`으로 현재 페이지 활성 표시

### 태스크 관리 (`/tasks`)

**레이아웃**: 왼쪽 사이드바(240px) + 오른쪽 메인 영역

**왼쪽 사이드바**
- 전체 태스크 수 (클릭 시 필터 초기화)
- 프로젝트별 목록 — 컬러 도트 + 태스크 수, 클릭 시 해당 프로젝트 필터
- 담당자별 목록 — `나` 뱃지(내 할일) / 2자 약어 뱃지(업무지시), 클릭 시 필터
- 미니 캘린더 — 오늘 인디고 원형 강조, 마감일 있는 날짜에 빨간 점

**오른쪽 메인**
- 탭 바: 전체 / 내 할일 / 업무지시 (하단 인디고 언더라인 활성 표시)
- 우측: `+ 태스크 추가` 버튼
- 테이블 헤더: 제목·프로젝트 | 담당자 | 시작일 | 마감일 | 등록일
- 상태 그룹(To-Do / In Progress / Backlog / Done) — Done은 기본 접힘
- 각 그룹 하단 인라인 `+ 태스크 추가` 버튼 → 해당 상태로 폼 오픈

**TaskRow**
- 체크박스 클릭 → 상태 사이클 변경 (Done이면 초록 체크 아이콘)
- 제목 아래 연결 프로젝트 배지 (Paperclip 아이콘 + 프로젝트명)
- 담당자: `나 내 할일` / `유장 유장성` 형식 (2자 약어 + 이름)
- 마감일 초과 시 빨간 강조

**TaskFormDialog**
- 제목, 상태, 구분(내 할일/업무지시), 담당자(업무지시 시만 표시)
- 시작일 / 마감일 나란히
- 연결 프로젝트: 전체 보드 통합 검색 (200ms debounce, M:N)
- 메모

### 보드(파일) 관리
- 워크스페이스 내 여러 보드 생성 가능
- 왼쪽 사이드바에서 보드 전환, `@dnd-kit`으로 보드 순서 드래그 재정렬
- 사이드바 열기/닫기: "보드" 헤더 우측 `PanelLeftClose` 버튼 / 상단 툴바 `PanelLeftOpen` 버튼
- 더블클릭 → 이름 인라인 편집, 호버 → 삭제 버튼

### 간트 차트 뷰
- **월 뷰** (기본): 컬럼 72px, 시작~종료 월 단위 바
- **주 뷰**: 컬럼 44px, 연도 → 월 그룹 → W1/W2… 3단 헤더
  - 바는 start_month의 첫 주 ~ end_month의 마지막 주에 걸쳐 표시
  - 월/주 뷰 모두 바 드래그(이동) + 리사이즈(좌우) 가능
  - 뷰 전환 시 today 위치로 자동 스크롤

### 카테고리 관리
- 왼쪽 패널 하단 고정 `+ 카테고리 추가` 버튼
- 왼쪽 패널 빈 영역 더블클릭으로도 추가 가능
- 인라인 이름 편집 (클릭), 색상 자동 배정

### 프로젝트 관리
- 카테고리 내 드래그앤드롭으로 순서 변경 / 다른 카테고리로 이동 (`@dnd-kit`, `liveItems` 실시간 미리보기)
- 상태 배지 클릭으로 사이클 변경: `to-do → in-progress → pending → backlog → done → to-do`
- 팀 필터, PM 필터, 시작일/종료일 정렬
- **일 단위 날짜 입력**: shadcn Calendar Popover로 시작일/종료일 선택 (YYYY-MM-DD)
- **간트 바 내 날짜 표시**: 날짜 텍스트를 바 안에 표시
- **수정 이력 패널**: Clock 버튼 클릭 → 우측 슬라이드 패널, DB 트리거로 자동 기록
- **이전 일정 비교**: 툴바 "비교" 버튼 → ghost 바(점선 테두리)를 현재 바 아래에 오버레이
  - ghost 모드 ON 시 행 높이 36→56px 확장
- **Undo**: 간트 차트 툴바 좌측 버튼 + Ctrl+Z(⌘Z), 최대 20단계
  - 대상: 날짜 드래그, 상태 변경, 이름 수정, 프로젝트 편집 다이얼로그, 순서 이동
- **휴지통(소프트 삭제)**: 삭제 시 `deleted_at` 설정, BoardSidebar 하단 휴지통 버튼(건수 배지)
  - TrashPanel: 삭제된 프로젝트 목록, 복원(RotateCcw) / 영구 삭제 / 전체 비우기
- **메모**: 프로젝트별 메모 입력 기능
  - 간트 행 hover 시 StickyNote 아이콘 표시, 메모가 있으면 항상 인디고색 아이콘 고정 표시
  - 클릭 시 우측 슬라이드 패널(MemoPanel) — textarea 편집, 저장 버튼 + Ctrl+S 단축키

### 프로젝트 상태
| 상태 | 색상 |
|------|------|
| To-Do | 보라 `#ede9fe` |
| In Progress | 파랑 `#dbeafe` |
| Pending | 노랑 `#fef3c7` |
| Backlog | 회색 `#f3f4f6` |
| Done | 초록 `#dcfce7` |

---

## 파일 구조

```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx        # AppNav 공유 레이아웃
│   │   ├── page.tsx          # 간트 메인 페이지 (보드/카테고리/프로젝트 상태 관리)
│   │   ├── tasks/page.tsx    # 태스크 관리 페이지
│   │   └── weekly/page.tsx   # 주간보고 (플레이스홀더)
│   └── login/page.tsx
├── components/
│   ├── AppNav.tsx            # 좌측 아이콘 레일 네비게이션
│   ├── gantt/
│   │   ├── GanttChart.tsx        # 간트 차트 본체 (월/주 뷰, 드래그, 헤더)
│   │   ├── GanttToolbar.tsx      # 툴바 (검색/필터/정렬/비교/추가) — GanttChart에서 추출
│   │   ├── BoardSidebar.tsx      # 보드 목록 사이드바 (dnd-kit 순서 변경)
│   │   └── ProjectFormDialog.tsx # 프로젝트 추가/수정 다이얼로그
│   └── tasks/
│       └── TaskFormDialog.tsx    # 태스크 추가/수정 다이얼로그
├── lib/
│   ├── gantt-service.ts      # Supabase CRUD (board/category/project/task)
│   ├── gantt-utils.ts        # 날짜 유틸 (월 범위, 주 범위, offset 계산)
│   └── supabase/
└── types/index.ts            # GanttBoard, GanttCategory, GanttProject, GanttTask, GanttStatus
```

---

## 주요 상수 (GanttChart)

```ts
COL_WIDTH       = 72   // 월 뷰 컬럼 너비
WEEK_COL_WIDTH  = 44   // 주 뷰 컬럼 너비
LEFT_WIDTH      = 260  // 좌측 패널 너비
HEADER_H        = 80   // 헤더 높이 (연도 34 + 월 28 + today/주 18)
CAT_ROW_H       = 32   // 카테고리 행 높이
PROJ_ROW_H      = 36   // 프로젝트 행 높이 (기본)
PROJ_ROW_H_CMP  = 56   // 비교 모드 행 높이
```

---

## 결정 사항 / 보류 사항

- **협업 기능 배제**: 개인 업무 정리 용도로 사용 — 멤버 초대 등 협업 기능은 구현하지 않음.
- **반응형(모바일) 미지원**: 간트 차트 특성상 데스크탑 전용으로 유지 결정.
- **소스 파일 1,000줄 제한** 준수 중. (GanttChart: 983줄, GanttToolbar 추출 후)
- **빌드 검증**: 코드 변경 후 `npx tsc --noEmit` 으로 타입 체크.

## Supabase 프로젝트

- Project ID: `eytonzxeogdfeuvxtuwh`
- Region: ap-northeast-2 (서울)
- Auth: 이메일/비밀번호, Google OAuth

## Vercel 배포

- Project ID: `prj_YumDJtKv90Kdbsd4DRclJvWUOoQP`
- Team ID: `team_Bz6jHioMJrz5bNuaCk1yBfaK`
- GitHub 푸시 → Vercel 자동 배포 (git integration 연동됨)
- Vercel CLI 미설치 — 배포는 git push로만 진행

## 미구현 / 예정

- **주간보고** (`/weekly`): 플레이스홀더만 있음, 구현 예정
- **태스크 드래그 정렬**: 현재 상태 그룹 고정, 순서 변경 미구현
- **태스크 우선순위**: 현재 없음
