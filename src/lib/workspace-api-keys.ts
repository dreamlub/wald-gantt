import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * workspace_api_keys 테이블에서 키 조회.
 * DB에 없으면 envFallback → null 순서로 반환.
 * 내부적으로 service-role 클라이언트를 사용해 RLS를 우회한다 (호출 전 인가 확인 필수).
 */
export async function getApiKey(
  _sb: SupabaseClient, // 하위 호환성 유지 — 내부에서 사용하지 않음
  workspaceId: string,
  keyName: string,
  envFallback?: string,
): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('workspace_api_keys')
    .select('key_value')
    .eq('workspace_id', workspaceId)
    .eq('key_name', keyName)
    .maybeSingle()
  return data?.key_value ?? envFallback ?? null
}
