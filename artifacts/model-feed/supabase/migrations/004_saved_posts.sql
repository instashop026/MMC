-- Saved posts feature
create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists saved_posts_post_idx on public.saved_posts (post_id);
create index if not exists saved_posts_user_idx on public.saved_posts (user_id);

-- Extend get_post_stats to include saved_by_me
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
  where p.id = any(coalesce(post_ids, '{}'::uuid[]))
    and ((p.published and model.published) or public.is_admin());
end;
$$;

revoke all on function public.get_post_stats(uuid[]) from public;
grant execute on function public.get_post_stats(uuid[]) to anon, authenticated;

-- RLS for saved_posts
alter table public.saved_posts enable row level security;

drop policy if exists saved_posts_read_own on public.saved_posts;
create policy saved_posts_read_own on public.saved_posts
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists saved_posts_insert_own on public.saved_posts;
create policy saved_posts_insert_own on public.saved_posts
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      join public.models model on model.id = p.model_id
      where p.id = saved_posts.post_id and p.published and model.published
    )
  );

drop policy if exists saved_posts_delete_own on public.saved_posts;
create policy saved_posts_delete_own on public.saved_posts
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.saved_posts to authenticated;
