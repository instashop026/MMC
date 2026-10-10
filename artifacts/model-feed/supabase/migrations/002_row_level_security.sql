-- Access control is enforced by PostgreSQL, not by the visibility of UI controls.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.get_post_stats(post_ids uuid[])
returns table (
  post_id uuid,
  like_count bigint,
  mmc_count bigint,
  comment_count bigint,
  liked_by_me boolean,
  mmc_by_me boolean
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
      select 1 from public.saved_posts s
      where s.post_id = p.id and s.user_id = auth.uid()
    ),
    exists (
      select 1 from public.likes l
      where l.post_id = p.id and l.user_id = auth.uid()
    ),
    exists (
      select 1 from public.mmcs m
      where m.post_id = p.id and m.user_id = auth.uid()
    )
  from public.posts p
  join public.models model on model.id = p.model_id
  where p.id = any(coalesce(post_ids, '{}'::uuid[]))
    and ((p.published and model.published) or public.is_admin());
end;
$$;

revoke all on function public.get_post_stats(uuid[]) from public;
grant execute on function public.get_post_stats(uuid[]) to anon, authenticated;

create or replace function public.get_post_comments(p_post_id uuid)
returns table (
  id uuid,
  user_id uuid,
  post_id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  display_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.user_id,
    c.post_id,
    c.body,
    c.created_at,
    c.updated_at,
    profile.display_name,
    profile.username,
    profile.avatar_url
  from public.comments c
  join public.profiles profile on profile.id = c.user_id
  join public.posts p on p.id = c.post_id
  join public.models model on model.id = p.model_id
  where c.post_id = p_post_id
    and ((p.published and model.published) or public.is_admin())
  order by c.created_at asc;
$$;

revoke all on function public.get_post_comments(uuid) from public;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.models enable row level security;
alter table public.styles enable row level security;
alter table public.model_styles enable row level security;
alter table public.content_sources enable row level security;
alter table public.posts enable row level security;
alter table public.post_styles enable row level security;
alter table public.follows enable row level security;
alter table public.style_follows enable row level security;
alter table public.likes enable row level security;
alter table public.mmcs enable row level security;
alter table public.comments enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Authenticated users can edit only these profile columns; role remains
-- server/database-owned and cannot be promoted from a browser request.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, username, avatar_url) on public.profiles to authenticated;
grant select on public.profiles to service_role;

drop policy if exists models_public_read on public.models;
create policy models_public_read on public.models
  for select to anon, authenticated
  using (published or public.is_admin());

drop policy if exists models_admin_insert on public.models;
create policy models_admin_insert on public.models
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists models_admin_update on public.models;
create policy models_admin_update on public.models
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists models_admin_delete on public.models;
create policy models_admin_delete on public.models
  for delete to authenticated
  using (public.is_admin());

drop policy if exists styles_public_read on public.styles;
create policy styles_public_read on public.styles
  for select to anon, authenticated
  using (true);

drop policy if exists styles_admin_insert on public.styles;
create policy styles_admin_insert on public.styles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists styles_admin_update on public.styles;
create policy styles_admin_update on public.styles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists styles_admin_delete on public.styles;
create policy styles_admin_delete on public.styles
  for delete to authenticated
  using (public.is_admin());

drop policy if exists model_styles_public_read on public.model_styles;
create policy model_styles_public_read on public.model_styles
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.models model
      where model.id = model_styles.model_id and model.published
    )
  );

drop policy if exists model_styles_admin_insert on public.model_styles;
create policy model_styles_admin_insert on public.model_styles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists model_styles_admin_delete on public.model_styles;
create policy model_styles_admin_delete on public.model_styles
  for delete to authenticated
  using (public.is_admin());

drop policy if exists content_sources_admin_all on public.content_sources;
create policy content_sources_admin_all on public.content_sources
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select to anon, authenticated
  using (
    (published and exists (
      select 1 from public.models model
      where model.id = posts.model_id and model.published
    ))
    or public.is_admin()
  );

drop policy if exists posts_admin_insert on public.posts;
create policy posts_admin_insert on public.posts
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update on public.posts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists posts_admin_delete on public.posts;
create policy posts_admin_delete on public.posts
  for delete to authenticated
  using (public.is_admin());

drop policy if exists post_styles_public_read on public.post_styles;
create policy post_styles_public_read on public.post_styles
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.posts p
      join public.models model on model.id = p.model_id
      where p.id = post_styles.post_id and p.published and model.published
    )
  );

drop policy if exists post_styles_admin_insert on public.post_styles;
create policy post_styles_admin_insert on public.post_styles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists post_styles_admin_delete on public.post_styles;
create policy post_styles_admin_delete on public.post_styles
  for delete to authenticated
  using (public.is_admin());

drop policy if exists follows_read_own on public.follows;
create policy follows_read_own on public.follows
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.models model
      where model.id = follows.model_id and model.published
    )
  );

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists style_follows_read_own on public.style_follows;
create policy style_follows_read_own on public.style_follows
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists style_follows_insert_own on public.style_follows;
create policy style_follows_insert_own on public.style_follows
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists style_follows_delete_own on public.style_follows;
create policy style_follows_delete_own on public.style_follows
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists likes_read_own on public.likes;
create policy likes_read_own on public.likes
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      join public.models model on model.id = p.model_id
      where p.id = likes.post_id and p.published and model.published
    )
  );

drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists mmcs_read_own on public.mmcs;
create policy mmcs_read_own on public.mmcs
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists mmcs_insert_own on public.mmcs;
create policy mmcs_insert_own on public.mmcs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      join public.models model on model.id = p.model_id
      where p.id = mmcs.post_id and p.published and model.published
    )
  );

drop policy if exists mmcs_delete_own on public.mmcs;
create policy mmcs_delete_own on public.mmcs
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists comments_public_read on public.comments;
create policy comments_public_read on public.comments
  for select to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.posts p
      join public.models model on model.id = p.model_id
      where p.id = comments.post_id and p.published and model.published
    )
  );

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.posts p
      join public.models model on model.id = p.model_id
      where p.id = comments.post_id and p.published and model.published
    )
  );

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists comments_delete_own_or_admin on public.comments;
create policy comments_delete_own_or_admin on public.comments
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.models, public.styles, public.model_styles, public.posts,
  public.post_styles to anon, authenticated;
grant insert, update, delete on public.models, public.styles, public.model_styles,
  public.content_sources, public.posts, public.post_styles to authenticated;
grant select, insert, delete on public.follows, public.style_follows, public.likes, public.mmcs to authenticated;
grant select, insert, delete on public.saved_posts to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select on public.comments to anon;
grant select, insert, update, delete on public.content_sources to authenticated;