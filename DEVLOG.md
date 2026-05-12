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

gantt_boards            ← 추가됨
  id, workspace_id, name, sort_order, created_at, updated_at

gantt_categories
  id, workspace_id, board_id, name, color, sort_order, created_at, updated_at

gantt_projects
  id, workspace_id, board_id, category_id, parent_id
  name, status, start_date(YYYY-MM-DD), end_date(YYYY-MM-DD)   ← 일 단위로 변경
  sort_order, team, pm, created_at, updated_at

gantt_project_history  ← DB 트리거 자동 기록
  id, project_id, field_name, old_value, new_value, changed_at

* gantt_projects.deleted_at TIMESTAMPTZ  ← 소프트 삭제용
* gantt_projects.memo TEXT               ← 프로젝트 메모
```

---

## 주요 기능

### 보드(파일) 관리
- 워크스페이스 내 여러 보드 생성 가능
- 왼쪽 사이드바에서 보드 전환 (PanelLeft 버튼으로 열기/닫기, 200px ↔ 0 transition)
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
- 카테고리 내 드래그앤드롭으로 순서 변경 / 다른 카테고리로 이동
- 상태 배지 클릭으로 사이클 변경: `to-do → in-progress → pending → backlog → done → to-do`
- **Done 자동 이동**: 상태를 `done`으로 변경하면 "Done" 카테고리 자동 생성 후 이동
- 팀 필터, 시작일/종료일 정렬
- **일 단위 날짜 입력**: shadcn Calendar Popover로 시작일/종료일 선택 (YYYY-MM-DD)
- **간트 바 내 날짜 표시**: 바 두께 14px, 날짜 텍스트를 바 안에 표시
- **수정 이력 패널**: Clock 버튼 클릭 → 우측 슬라이드 패널, DB 트리거로 자동 기록
- **이전 일정 비교**: 툴바 "비교" 버튼 → ghost 바(점선 테두리)를 현재 바 아래에 오버레이
  - ghost 모드 ON 시 행 높이 36→56px 확장, 현재 바 위치는 고정
- **Undo**: 간트 차트 툴바 좌측 버튼 + Ctrl+Z(⌘Z), 최대 20단계
  - 대상: 날짜 드래그, 상태 변경, 이름 수정, 프로젝트 편집 다이얼로그, 순서 이동
- **휴지통(소프트 삭제)**: 삭제 시 `deleted_at` 설정, BoardSidebar 하단 휴지통 버튼(건수 배지)
  - TrashPanel: 삭제된 프로젝트 목록, 복원(RotateCcw) / 영구 삭제 / 전체 비우기
- **Done 자동 이동 제거**: 상태를 `done`으로 변경해도 카테고리 이동 없이 상태만 변경
- **메모**: 프로젝트별 메모 입력 기능
  - 간트 행 hover 시 StickyNote 아이콘 표시, 메모가 있으면 항상 인디고색 아이콘 고정 표시
  - 클릭 시 우측 슬라이드 패널(MemoPanel) — textarea 편집, 저장 버튼 + Ctrl+S 단축키
  - 저장 시 기존 상태 즉시 반영 (projects 배열 업데이트)

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
│   ├── page.tsx              # 메인 페이지 — 보드/카테고리/프로젝트 상태 관리
│   └── login/page.tsx
├── components/gantt/
│   ├── GanttChart.tsx        # 간트 차트 본체 (월/주 뷰, 드래그, 헤더)
│   ├── BoardSidebar.tsx      # 보드 목록 사이드바
│   ├── ProjectFormDialog.tsx # 프로젝트 추가/수정 다이얼로그
│   ├── InviteDialog.tsx      # 멤버 초대
│   └── StatusBadge.tsx
├── lib/
│   ├── gantt-service.ts      # Supabase CRUD (board/category/project)
│   ├── gantt-utils.ts        # 날짜 유틸 (월 범위, 주 범위, offset 계산)
│   └── supabase/
└── types/index.ts            # GanttBoard, GanttCategory, GanttProject, GanttStatus
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

- **반응형(모바일) 미지원**: 간트 차트 특성상 데스크탑 전용으로 유지 결정.  
  모바일 대응이 필요하면 별도 리스트 뷰 컴포넌트 추가 후 `md` 미만에서 자동 전환하는 방향 논의됨.
- **소스 파일 1,000줄 제한** 준수 중.
- **빌드 검증**: 코드 변경 후 항상 `vite build` (여기서는 `npm run build`) 까지 확인.
