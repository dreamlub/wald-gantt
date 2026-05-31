-- slack_raw_messages 충돌키를 channel(이름) → channel_id로 교체.
-- channel(resolved 이름)은 DM/채널 표시명 변경 시 같은 글을 새 row로 중복 저장하는 문제가 있어
-- 조회·upsert 기준인 channel_id로 통일.
--
-- 주: 이 마이그레이션은 원래 운영 DB에서 MCP로 직접 적용되었고(version 20260530163411),
-- 사후에 git 정합을 위해 역기록함. 운영 적용 시 동반된 1회성 중복 정리(215건 삭제 +
-- client_history.raw_message_id 재지정)는 신규 환경에는 중복이 없으므로 생략한다.

-- 기존 제약 제거 (이름 기반) — 신규 환경엔 없을 수 있으므로 가드
ALTER TABLE slack_raw_messages
  DROP CONSTRAINT IF EXISTS slack_raw_messages_workspace_id_channel_parent_ts_key;

-- channel_id 기반 유니크 제약 추가
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'slack_raw_messages'::regclass
      AND conname = 'slack_raw_messages_workspace_id_channel_id_parent_ts_key'
  ) THEN
    ALTER TABLE slack_raw_messages
      ADD CONSTRAINT slack_raw_messages_workspace_id_channel_id_parent_ts_key
      UNIQUE (workspace_id, channel_id, parent_ts);
  END IF;
END $$;
