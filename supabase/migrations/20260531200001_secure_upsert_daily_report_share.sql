-- upsert_daily_report_share에 워크스페이스 멤버 확인 추가.
-- SECURITY DEFINER 함수는 RPC를 직접 호출할 수 있으므로
-- 함수 내부에서 auth.uid()가 해당 워크스페이스 멤버인지 검증한다.

create or replace function upsert_daily_report_share(p_date date, p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  insert into daily_report_shares (report_date, workspace_id)
  values (p_date, p_workspace_id)
  on conflict (report_date, workspace_id) do nothing;

  select token into v_token
    from daily_report_shares
   where report_date = p_date
     and workspace_id = p_workspace_id;

  return v_token;
end;
$$;
