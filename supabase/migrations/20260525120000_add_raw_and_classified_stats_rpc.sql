create or replace function public.get_raw_message_stats(p_workspace_id uuid)
returns table (
  date_kst text,
  raw_count bigint,
  channel_count bigint,
  last_collected text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_char(
      to_timestamp(r.parent_ts::double precision) at time zone 'Asia/Seoul',
      'YYYY-MM-DD'
    ) as date_kst,
    count(*)::bigint as raw_count,
    count(distinct r.channel)::bigint as channel_count,
    max(r.collected_at)::text as last_collected
  from public.slack_raw_messages as r
  where r.workspace_id = p_workspace_id
  group by date_kst
  order by date_kst desc;
$$;

revoke all on function public.get_raw_message_stats(uuid) from public;
grant execute on function public.get_raw_message_stats(uuid) to authenticated;

-- ---

create or replace function public.get_classified_stats(p_workspace_id uuid)
returns table (
  date_kst text,
  classified_count bigint,
  last_updated text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_char(
      ch.occurred_at at time zone 'Asia/Seoul',
      'YYYY-MM-DD'
    ) as date_kst,
    count(*)::bigint as classified_count,
    max(coalesce(ch.updated_at, ch.created_at))::text as last_updated
  from public.client_history as ch
  where ch.workspace_id = p_workspace_id
    and ch.deleted_at is null
  group by date_kst
  order by date_kst desc;
$$;

revoke all on function public.get_classified_stats(uuid) from public;
grant execute on function public.get_classified_stats(uuid) to authenticated;
