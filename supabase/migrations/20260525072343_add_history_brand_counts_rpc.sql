create or replace function public.get_history_brand_counts(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_brand text default null,
  p_priority text default null,
  p_tags text[] default null,
  p_author text default null,
  p_q text default null
)
returns table (
  brand_name text,
  count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ch.brand_name,
    count(*)::bigint as count
  from public.client_history as ch
  where ch.deleted_at is null
    and (p_from is null or ch.occurred_at >= p_from)
    and (p_to is null or ch.occurred_at <= p_to)
    and (p_brand is null or ch.brand_name = p_brand)
    and (p_priority is null or ch.priority = p_priority)
    and (p_tags is null or cardinality(p_tags) = 0 or ch.tags @> p_tags)
    and (p_author is null or ch.author = p_author)
    and (
      p_q is null
      or p_q = ''
      or ch.title ilike '%' || p_q || '%'
      or coalesce(ch.body, '') ilike '%' || p_q || '%'
      or ch.channel ilike '%' || p_q || '%'
      or coalesce(ch.author, '') ilike '%' || p_q || '%'
    )
  group by ch.brand_name
  order by count(*) desc, ch.brand_name nulls last;
$$;

comment on function public.get_history_brand_counts(
  timestamptz,
  timestamptz,
  text,
  text,
  text[],
  text,
  text
) is 'Aggregates client_history brand counts using the same filters as the paginated history API. SECURITY INVOKER keeps table RLS in force.';

revoke all on function public.get_history_brand_counts(
  timestamptz,
  timestamptz,
  text,
  text,
  text[],
  text,
  text
) from public;

grant execute on function public.get_history_brand_counts(
  timestamptz,
  timestamptz,
  text,
  text,
  text[],
  text,
  text
) to authenticated;
