-- workspace_api_keys 테이블에서 인증된 사용자의 직접 SELECT를 차단.
-- Next.js API 라우트는 service-role 클라이언트로 조회 후 마스킹해 반환한다.
-- 쓰기(INSERT/UPDATE/DELETE)는 세션 클라이언트 + RLS로 계속 허용.

drop policy "workspace members can manage api keys" on workspace_api_keys;

create policy "workspace members insert api keys"
  on workspace_api_keys for insert
  with check (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "workspace members update api keys"
  on workspace_api_keys for update
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create policy "workspace members delete api keys"
  on workspace_api_keys for delete
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
