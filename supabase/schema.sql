-- Мэшапер: схема для Supabase.
-- Выполните этот файл целиком: Dashboard -> SQL Editor -> New query -> вставить -> Run.
-- Скрипт можно запускать повторно, ничего не сломается.

create extension if not exists pgcrypto;

-- ---------- профили ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 24),
  avatar_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- Профиль создаётся автоматически при регистрации. Ник берётся из метаданных,
-- при совпадении к нему добавляется число.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  nick text;
  n int := 0;
begin
  base := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), 'user'), 20);
  if char_length(base) < 2 then base := 'user'; end if;
  nick := base;
  while exists (select 1 from public.profiles where lower(nickname) = lower(nick)) loop
    n := n + 1;
    nick := base || n::text;
  end loop;
  insert into public.profiles (id, nickname) values (new.id, nick);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Проверка, свободен ли ник (регистр не важен, свой собственный ник считается свободным).
create or replace function public.nickname_available(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles where lower(nickname) = lower(n) and id is distinct from auth.uid()
  );
$$;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- ---------- мэшапы, лайки, комментарии ----------
create table if not exists public.mashups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  gd_song text not null check (char_length(gd_song) between 1 and 80),
  regular_song text not null check (char_length(regular_song) between 1 and 80),
  description text check (description is null or char_length(description) <= 300),
  audio_path text not null,
  audio_name text,
  duration_sec integer,
  created_at timestamptz not null default now()
);
create index if not exists mashups_created_idx on public.mashups (created_at desc);

create table if not exists public.likes (
  mashup_id uuid not null references public.mashups (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mashup_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  mashup_id uuid not null references public.mashups (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_mashup_idx on public.comments (mashup_id, created_at);

-- Лента: мэшап + автор + счётчики.
create or replace view public.mashup_feed with (security_invoker = true) as
select
  m.id, m.user_id, m.title, m.gd_song, m.regular_song, m.description,
  m.audio_path, m.audio_name, m.duration_sec, m.created_at,
  p.nickname, p.avatar_url,
  (select count(*) from public.likes l where l.mashup_id = m.id)::int as likes_count,
  (select count(*) from public.comments c where c.mashup_id = m.id)::int as comments_count
from public.mashups m
join public.profiles p on p.id = m.user_id;
grant select on public.mashup_feed to anon, authenticated;

-- ---------- права доступа (RLS) ----------
alter table public.profiles enable row level security;
alter table public.mashups enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles: читать всем" on public.profiles;
create policy "profiles: читать всем" on public.profiles for select using (true);
drop policy if exists "profiles: менять свой" on public.profiles;
create policy "profiles: менять свой" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "mashups: читать всем" on public.mashups;
create policy "mashups: читать всем" on public.mashups for select using (true);
drop policy if exists "mashups: добавлять свои" on public.mashups;
create policy "mashups: добавлять свои" on public.mashups for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "mashups: удалять свои" on public.mashups;
create policy "mashups: удалять свои" on public.mashups for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "likes: читать всем" on public.likes;
create policy "likes: читать всем" on public.likes for select using (true);
drop policy if exists "likes: ставить свои" on public.likes;
create policy "likes: ставить свои" on public.likes for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "likes: убирать свои" on public.likes;
create policy "likes: убирать свои" on public.likes for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "comments: читать всем" on public.comments;
create policy "comments: читать всем" on public.comments for select using (true);
drop policy if exists "comments: писать свои" on public.comments;
create policy "comments: писать свои" on public.comments for insert to authenticated
  with check (auth.uid() = user_id);
-- Удалить комментарий может его автор или автор мэшапа.
drop policy if exists "comments: удалять свои или под своим мэшапом" on public.comments;
create policy "comments: удалять свои или под своим мэшапом" on public.comments for delete to authenticated
  using (auth.uid() = user_id or auth.uid() = (select m.user_id from public.mashups m where m.id = mashup_id));

-- ---------- хранилище файлов ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('mashups', 'mashups', true, 52428800, array[
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg',
    'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/webm'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Каждый пользователь работает только в своей папке: <id пользователя>/файл.
drop policy if exists "files: загрузка в свою папку" on storage.objects;
create policy "files: загрузка в свою папку" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars', 'mashups') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "files: чтение своей папки" on storage.objects;
create policy "files: чтение своей папки" on storage.objects for select to authenticated
  using (bucket_id in ('avatars', 'mashups') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "files: замена в своей папке" on storage.objects;
create policy "files: замена в своей папке" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'mashups') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "files: удаление из своей папки" on storage.objects;
create policy "files: удаление из своей папки" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'mashups') and (storage.foldername(name))[1] = auth.uid()::text);
