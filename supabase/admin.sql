-- Мэшапер: админ-панель. Выполните целиком в Supabase: SQL Editor -> New query -> Run.
-- Пароль здесь НЕ хранится: он задаётся отдельным запросом (см. admin_password.sql, в репозиторий его не кладём)
-- и лежит в базе только в виде bcrypt-хеша в таблице, к которой нет доступа из браузера.
-- Скрипт можно запускать повторно.

create extension if not exists pgcrypto;

-- Хеш пароля: единственная строка, никаких политик доступа, то есть из сайта её не прочитать.
create table if not exists public.admin_secret (
  id int primary key default 1 check (id = 1),
  pw_hash text not null
);
alter table public.admin_secret enable row level security;
revoke all on public.admin_secret from anon, authenticated;

-- Кто сейчас вошёл в админ-панель (вход действует 1 час).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until timestamptz not null
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- Неудачные попытки входа (защита от подбора пароля).
create table if not exists public.admin_attempts (
  id bigserial primary key,
  user_id uuid,
  at timestamptz not null default now()
);
alter table public.admin_attempts enable row level security;
revoke all on public.admin_attempts from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid() and a.until > now());
$$;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon;

-- Вход: true, если пароль верный. Не больше 5 неудачных попыток за 15 минут с одного аккаунта
-- и не больше 30 за 15 минут со всех аккаунтов вместе.
create or replace function public.admin_login(pw text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  h text;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  delete from public.admin_attempts where at < now() - interval '1 day';
  if (select count(*) from public.admin_attempts where user_id = uid and at > now() - interval '15 minutes') >= 5
     or (select count(*) from public.admin_attempts where at > now() - interval '15 minutes') >= 30 then
    raise exception 'too_many';
  end if;
  select pw_hash into h from public.admin_secret where id = 1;
  if h is null or pw is null or crypt(pw, h) <> h then
    insert into public.admin_attempts (user_id) values (uid);
    return false;
  end if;
  insert into public.admins (user_id, until) values (uid, now() + interval '1 hour')
    on conflict (user_id) do update set until = excluded.until;
  delete from public.admin_attempts where user_id = uid;
  return true;
end $$;
grant execute on function public.admin_login(text) to authenticated;
revoke execute on function public.admin_login(text) from anon;

create or replace function public.admin_logout() returns void
language sql security definer set search_path = public as $$
  delete from public.admins where user_id = auth.uid();
$$;
grant execute on function public.admin_logout() to authenticated;
revoke execute on function public.admin_logout() from anon;

-- Сводка для панели.
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'mashups', (select count(*) from public.mashups),
    'comments', (select count(*) from public.comments),
    'likes', (select count(*) from public.likes)
  );
end $$;
grant execute on function public.admin_stats() to authenticated;
revoke execute on function public.admin_stats() from anon;

-- Список последних комментариев с авторами и названием мэшапа.
create or replace function public.admin_comments(lim int default 50) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return coalesce((select json_agg(x) from (
    select c.id, c.body, c.created_at, p.nickname, m.title as mashup_title
    from public.comments c
    join public.profiles p on p.id = c.user_id
    join public.mashups m on m.id = c.mashup_id
    order by c.created_at desc limit least(greatest(lim, 1), 200)
  ) x), '[]'::json);
end $$;
grant execute on function public.admin_comments(int) to authenticated;
revoke execute on function public.admin_comments(int) from anon;

-- Админ может удалять любые мэшапы, комментарии и их файлы.
drop policy if exists "mashups: админ удаляет любые" on public.mashups;
create policy "mashups: админ удаляет любые" on public.mashups for delete to authenticated
  using (public.is_admin());
drop policy if exists "comments: админ удаляет любые" on public.comments;
create policy "comments: админ удаляет любые" on public.comments for delete to authenticated
  using (public.is_admin());
drop policy if exists "files: админ удаляет любые" on storage.objects;
create policy "files: админ удаляет любые" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'mashups') and public.is_admin());
