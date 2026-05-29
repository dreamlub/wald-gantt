-- daily_report_shares 보안 보정
--
-- 원래 생성 마이그레이션(20260528000004)이 RLS 활성화와 anon/authenticated 직접
-- 권한 회수를 누락했다. 그 결과 anon 키(PostgREST 공개)로 테이블을 직접
-- SELECT/UPDATE/DELETE 할 수 있어, 전 워크스페이스의 공유 토큰을 덤프·변조할 수
-- 있는 상태였다. 의도된 접근 경로는 SECURITY DEFINER 함수
-- get_shared_daily_report / upsert_daily_report_share 뿐이다.
--
-- 두 RPC는 owner(postgres)=테이블 owner 이고 테이블에 FORCE RLS가 걸려있지 않으므로
-- RLS를 켜고 직접 권한을 회수해도 그대로 동작한다(공유 링크 영향 없음).
-- board_share_tokens 와 동일한 보호 패턴을 따른다.

alter table daily_report_shares enable row level security;

-- PostgREST 직접 접근 차단 — 공유는 오직 SECURITY DEFINER RPC를 통해서만
revoke all on daily_report_shares from anon, authenticated;

-- 워크스페이스 멤버는 자신의 공유 토큰을 직접 조회/관리 가능 (board_share_tokens 패턴)
-- anon 은 auth.uid()가 null 이라 이 정책을 통과하지 못한다.
create policy "workspace members manage daily report shares" on daily_report_shares
  for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
