-- Migration 005: Public visibility for all models and posts
-- Makes all models and posts visible to anonymous visitors
-- (removes the published filter from read policies and get_post_stats)

-- Step 1: Update get_post_stats to remove the published filter
drop function if exists public.get_post_stats(uuid[]);

create or replace function public.get_post_stats(post_ids uuid[])
returns table (
  post_id uuid,
  like_count bigint,
  mmc_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  mmc_by_me boolean,
  saved_by_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(cardinality(post_ids), 0) > 100 then
    raise exception 'At most 100 posts can be requested at once.';
  end if;

  return query
  select
    p.id,
    (select count(*) from public.likes l where l.post_id = p.id),
    (select count(*) from public.mmcs m where m.post_id = p.id),
    (select count(*) from public.comments c where c.post_id = p.id),
    exists (
      select 1 from public.likes l
      where l.post_id = p.id and l.user_id = auth.uid()
    ),
    exists (
      select 1 from public.mmcs m
      where m.post_id = p.id and m.user_id = auth.uid()
    ),
    exists (
      select 1 from public.saved_posts s
      where s.post_id = p.id and s.user_id = auth.uid()
    )
  from public.posts p
  join public.models model on model.id = p.model_id
  where p.id = any(coalesce(post_ids, '{}'::uuid[]));
end;
$$;

revoke all on function public.get_post_stats(uuid[]) from public;
grant execute on function public.get_post_stats(uuid[]) to anon, authenticated;

-- Step 2: Update models_public_read policy to allow all visitors to read models
drop policy if exists models_public_read on public.models;
create policy models_public_read on public.models
  for select to anon, authenticated
  using (true);

-- Step 3: Update posts_public_read policy to allow all visitors to read posts
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select to anon, authenticated
  using (true);

-- Step 4: Update model_styles_public_read to allow all visitors to read model styles
drop policy if exists model_styles_public_read on public.model_styles;
create policy model_styles_public_read on public.model_styles
  for select to anon, authenticated
  using (true);

-- Step 5: Update post_styles read access similarly (check existing policy name first)
-- Allow anonymous to read post_styles for public posts
drop policy if exists post_styles_public_read on public.post_styles;
create policy post_styles_public_read on public.post_styles
  for select to anon, authenticated
  using (true);
