import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * workspace_api_keys 테이블에서 키 조회.
 * DB에 없으면 envFallback → null 순서로 반환.
 */
export async function getApiKey(
  sb: SupabaseClient,
  workspaceId: string,
  keyName: string,
  envFallback?: string,
): Promise<string | null> {
  const { data } = await sb
    .from('workspace_api_keys')
    .select('key_value')
    .eq('workspace_id', workspaceId)
    .eq('key_name', keyName)
    .maybeSingle()
  return data?.key_value ?? envFallback ?? null
}
