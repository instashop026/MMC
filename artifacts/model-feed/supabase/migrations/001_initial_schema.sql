-- Core catalog schema. Run with the Supabase CLI (`supabase db push`).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Member',
  username text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin', 'models')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_normalized_unique
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  username text,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  profile_image_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists models_published_created_idx
  on public.models (published, created_at desc);

create table if not exists public.styles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create or replace function public.normalize_style_name(value text)
returns text
language sql
immutable
strict
as $$
  select trim(regexp_replace(lower(value), '[^[:alnum:]]+', ' ', 'g'));
$$;

create unique index if not exists styles_normalized_name_unique
  on public.styles (public.normalize_style_name(name));

create table if not exists public.model_styles (
  model_id uuid not null references public.models (id) on delete cascade,
  style_id uuid not null references public.styles (id) on delete cascade,
  primary key (model_id, style_id)
);

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ctele', 'eb', 'wt')),
  external_id text not null,
  model_id uuid references public.models (id) on delete set null,
  album_title text,
  source_url text,
  source_path text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists content_sources_model_idx
  on public.content_sources (model_id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (id) on delete cascade,
  content_source_id uuid references public.content_sources (id) on delete set null,
  type text not null check (type in ('image', 'video')),
  zerostorage_file_id text not null unique
    check (length(trim(zerostorage_file_id)) between 1 and 255),
  filename text,
  caption text,
  source text not null check (source in ('ctele', 'eb', 'wt')),
  source_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_source_media_type_check check (
    (source in ('ctele', 'eb') and type = 'image')
    or (source = 'wt' and type = 'video')
  )
);

create index if not exists posts_feed_idx
  on public.posts (published, created_at desc);
create index if not exists posts_model_feed_idx
  on public.posts (model_id, published, created_at desc);
create index if not exists posts_source_path_idx
  on public.posts (source, source_path);

create table if not exists public.post_styles (
  post_id uuid not null references public.posts (id) on delete cascade,
  style_id uuid not null references public.styles (id) on delete cascade,
  primary key (post_id, style_id)
);

create table if not exists public.follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  model_id uuid not null references public.models (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, model_id)
);

create index if not exists follows_model_idx on public.follows (model_id);

create table if not exists public.style_follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  style_id uuid not null references public.styles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, style_id)
);

create index if not exists style_follows_style_idx on public.style_follows (style_id);

create table if not exists public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists likes_post_idx on public.likes (post_id);

create table if not exists public.mmcs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists mmcs_post_idx on public.mmcs (post_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at asc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists models_set_updated_at on public.models;
create trigger models_set_updated_at
  before update on public.models
  for each row execute function public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
  before update on public.comments
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, username, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();