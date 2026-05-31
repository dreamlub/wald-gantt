-- P0 보안 구멍 2건 수정 (Supabase 보안 어드바이저 ERROR/WARN)
--
-- 1) task_completions: public 스키마인데 RLS 미활성 → Data API로 워크스페이스 간
--    완료-태스크 스냅샷(title/assignee/projects 등)이 노출될 수 있음.
-- 2) workspace_members: INSERT 정책이 WITH CHECK (true) → 인증 사용자가 임의
--    워크스페이스에 자기 자신을 멤버로 삽입 가능 → membership 기반 격리 전체 우회.
--    정상 멤버십 생성은 create_workspace_for_user(SECURITY DEFINER) RPC로만 이뤄지고,
--    앱 코드의 workspace_members 접근은 전부 SELECT뿐이라 정책 제거가 안전함.

-- ── 1. task_completions RLS 활성화 + 워크스페이스 멤버 정책 ──────────────
alter table task_completions enable row level security;

create policy "workspace members can access task_completions"
  on task_completions
  for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  )
  with check (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- ── 2. workspace_members 무제한 INSERT 정책 제거 ─────────────────────────
-- 일반 인증 사용자의 자가 INSERT를 차단. 워크스페이스 생성은 SECURITY DEFINER
-- 함수(create_workspace_for_user)가 RLS를 우회해 처리하므로 영향 없음.
drop policy if exists "insert membership" on workspace_members;
