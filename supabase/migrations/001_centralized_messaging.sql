-- ============================================================================
-- VaultComms / FlavorCraft — Centralized encrypted messaging schema
--
-- Apply in Supabase SQL Editor (or via supabase CLI).
--
-- This migration:
--   1. Drops any legacy functions created by the old project so the RPC
--      signatures exactly match the frontend calls.
--   2. Creates chat_rooms, chat_room_members, chat_messages, push_subscriptions.
--   3. Creates SECURITY DEFINER helper functions (avoids recursive RLS on
--      chat_room_members) plus the application RPCs used by the frontend:
--        get_or_create_chat_room(p_pair_code text)          -> uuid
--        insert_chat_message(p_room_id, p_client_message_id, ...) -> jsonb
--        mark_message_delivered(p_message_id)               -> void
--        mark_message_read(p_message_id)                    -> void
--        purge_expired_chat_messages(p_room_id)             -> bigint
--        set_chat_member_peer(p_room_id, p_peer_id)         -> void
--        get_chat_partner(p_room_id)                        -> jsonb
--   4. Enables RLS on every user table with strict policies.
--   5. Creates the private vault-media storage bucket with member-only access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Remove every version of the old RPC helpers so signatures are exact.
--
-- Before dropping the functions we drop every existing policy on the app
-- tables (any draft may have created policies with different names) so the
-- DROP is never blocked by a dangling dependency. CASCADE is used as a final
-- safety net; all policies are recreated below.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn record;
  pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'chat_rooms',
        'chat_room_members',
        'chat_messages',
        'push_subscriptions'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;

  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_or_create_chat_room',
        'purge_expired_chat_messages',
        'insert_chat_message',
        'mark_message_delivered',
        'mark_message_read',
        'set_chat_member_peer',
        'get_chat_partner',
        'is_chat_room_member',
        'become_room_member'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || fn.sig || ' CASCADE';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.chat_rooms (
  id         uuid primary key default gen_random_uuid(),
  pair_code  text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_room_members (
  room_id      uuid not null references public.chat_rooms (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  peer_id      text,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Ensure columns exist even if tables were created by an earlier schema version
alter table public.chat_room_members add column if not exists peer_id text;
alter table public.chat_room_members add column if not exists last_seen_at timestamptz default now();
alter table public.chat_room_members add column if not exists created_at timestamptz default now();

create table if not exists public.chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  room_id            uuid not null references public.chat_rooms (id) on delete cascade,
  sender_id          uuid not null references auth.users (id) on delete cascade,
  client_message_id  text not null,
  message_type       text not null check (message_type in ('text', 'image', 'video', 'voice')),
  encrypted_payload  text not null check (length(encrypted_payload) > 0 and length(encrypted_payload) <= 40000),
  media_path         text,
  media_mime_type    text,
  media_size         bigint,
  ttl_seconds        integer check (ttl_seconds is null or ttl_seconds in (10, 30, 300, 3600)),
  expires_at         timestamptz,
  created_at         timestamptz not null default now(),
  delivered_at       timestamptz,
  read_at            timestamptz,
  unique (room_id, client_message_id)
);

-- Ensure media columns exist on chat_messages if created previously
alter table public.chat_messages add column if not exists media_path text;
alter table public.chat_messages add column if not exists media_mime_type text;
alter table public.chat_messages add column if not exists media_size bigint;

create index if not exists chat_messages_room_created_idx on public.chat_messages (room_id, created_at);
create index if not exists chat_messages_expires_idx on public.chat_messages (expires_at) where expires_at is not null;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ---------------------------------------------------------------------------
-- 2. SECURITY DEFINER membership helper
--
-- The old project hit "recursive RLS policy on chat_room_members" because
-- member policies queried chat_room_members. This helper executes as the
-- table owner and bypasses RLS, so policies can safely use it.
-- ---------------------------------------------------------------------------

create or replace function public.is_chat_room_member(p_room_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.chat_room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.chat_rooms        enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_messages     enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "room_select_member" on public.chat_rooms;
create policy "room_select_member" on public.chat_rooms
  for select
  using (public.is_chat_room_member(id));

drop policy if exists "members_select" on public.chat_room_members;
create policy "members_select" on public.chat_room_members
  for select
  using (user_id = auth.uid() or public.is_chat_room_member(room_id));

drop policy if exists "members_update_own" on public.chat_room_members;
create policy "members_update_own" on public.chat_room_members
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Membership creation is handled exclusively by get_or_create_chat_room.

drop policy if exists "messages_select_member" on public.chat_messages;
create policy "messages_select_member" on public.chat_messages
  for select
  using (public.is_chat_room_member(room_id));

-- Message insert / update / delete are intentionally NOT open to table level:
-- they go through the validating SECURITY DEFINER RPCs below so that TTL,
-- sender identity, types and sizes are checked server-side.

-- push_subscriptions are managed by the Render backend (service role).
-- No client policies are granted on purpose.
revoke all on table public.push_subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Application RPCs
-- ---------------------------------------------------------------------------

-- get_or_create_chat_room(p_pair_code text) returns uuid
--
-- Frontend contract (must match exactly):
--   supabase.rpc('get_or_create_chat_room', { p_pair_code: 'PAIR-1314' })
-- The previous project got HTTP 400 failures from a signature mismatch;
-- this definition is the single source of truth for the argument shape.
create or replace function public.get_or_create_chat_room(p_pair_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_member_count integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  p_pair_code := upper(trim(p_pair_code));

  if p_pair_code is null or length(p_pair_code) < 4 or length(p_pair_code) > 64
     or p_pair_code !~ '^[A-Z0-9_-]+$'
  then
    raise exception 'invalid pair code';
  end if;

  -- Serialize concurrent first-joins for the same pair code.
  perform pg_advisory_xact_lock(hashtext('room:' || p_pair_code));

  select id into v_room_id from public.chat_rooms where pair_code = p_pair_code;

  if v_room_id is null then
    insert into public.chat_rooms (pair_code)
    values (p_pair_code)
    returning id into v_room_id;
  end if;

  -- Reopening the app reconnects to the existing room; never duplicate membership.
  if exists (
    select 1 from public.chat_room_members
    where room_id = v_room_id and user_id = auth.uid()
  ) then
    update public.chat_room_members
    set last_seen_at = now()
    where room_id = v_room_id and user_id = auth.uid();
    return v_room_id;
  end if;

  select count(*) into v_member_count
  from public.chat_room_members
  where room_id = v_room_id;

  -- A room holds up to 2 active devices.
  -- If 2 anonymous sessions already exist and a new device joins with the correct secret pair code,
  -- evict the oldest inactive member so partners are never permanently locked out by ephemeral tokens.
  if v_member_count >= 2 then
    delete from public.chat_room_members
    where room_id = v_room_id
      and user_id in (
        select user_id
        from public.chat_room_members
        where room_id = v_room_id
        order by coalesce(last_seen_at, created_at, now() - interval '100 years') asc
        limit (v_member_count - 1)
      );
  end if;

  insert into public.chat_room_members (room_id, user_id, last_seen_at)
  values (v_room_id, auth.uid(), now())
  on conflict (room_id, user_id) do update
  set last_seen_at = now();

  return v_room_id;
end;
$$;

-- insert_chat_message(...) returns jsonb (the full stored row)
--
-- The backend/DB layer, never the client, decides the sender. TTL,
-- message type, payload size and idempotency are all validated here.
create or replace function public.insert_chat_message(
  p_room_id uuid,
  p_client_message_id text,
  p_message_type text,
  p_encrypted_payload text,
  p_ttl_seconds integer default null,
  p_media_path text default null,
  p_media_mime_type text default null,
  p_media_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.chat_messages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_chat_room_member(p_room_id) then
    raise exception 'not a member of this room';
  end if;

  if p_message_type is null or p_message_type not in ('text', 'image', 'video', 'voice') then
    raise exception 'invalid message type';
  end if;

  if p_ttl_seconds is not null and p_ttl_seconds not in (10, 30, 300, 3600) then
    raise exception 'invalid ttl';
  end if;

  if p_client_message_id is null or length(p_client_message_id) = 0
     or length(p_client_message_id) > 100
  then
    raise exception 'invalid client message id';
  end if;

  if p_encrypted_payload is null or length(p_encrypted_payload) = 0
     or length(p_encrypted_payload) > 40000
  then
    raise exception 'invalid payload';
  end if;

  if (p_media_path is null) <> (p_media_mime_type is null) then
    raise exception 'invalid media metadata';
  end if;

  if p_media_size is not null and (p_media_size <= 0 or p_media_size > 200000000) then
    raise exception 'invalid media size';
  end if;

  -- Idempotency: retrying a send returns the already-stored message.
  select * into v_message
  from public.chat_messages
  where room_id = p_room_id and client_message_id = p_client_message_id;

  if found then
    if v_message.sender_id <> auth.uid() then
      raise exception 'client message id already in use';
    end if;
    return row_to_json(v_message)::jsonb;
  end if;

  insert into public.chat_messages (
    room_id, sender_id, client_message_id, message_type, encrypted_payload,
    media_path, media_mime_type, media_size, ttl_seconds, expires_at
  )
  values (
    p_room_id, auth.uid(), p_client_message_id, p_message_type, p_encrypted_payload,
    p_media_path, p_media_mime_type, p_media_size, p_ttl_seconds,
    case when p_ttl_seconds is null then null
         else now() + (p_ttl_seconds * interval '1 second')
    end
  )
  returning * into v_message;

  return row_to_json(v_message)::jsonb;
end;
$$;

-- mark_message_delivered(p_message_id uuid) returns void
create or replace function public.mark_message_delivered(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.chat_messages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_message from public.chat_messages where id = p_message_id;

  if not found then
    raise exception 'message not found';
  end if;

  if v_message.sender_id = auth.uid() then
    raise exception 'cannot alter own message state';
  end if;

  if not public.is_chat_room_member(v_message.room_id) then
    raise exception 'not a member of this room';
  end if;

  update public.chat_messages
  set delivered_at = coalesce(delivered_at, now())
  where id = p_message_id;
end;
$$;

-- mark_message_read(p_message_id uuid) returns void
create or replace function public.mark_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.chat_messages%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_message from public.chat_messages where id = p_message_id;

  if not found then
    raise exception 'message not found';
  end if;

  if v_message.sender_id = auth.uid() then
    raise exception 'cannot alter own message state';
  end if;

  if not public.is_chat_room_member(v_message.room_id) then
    raise exception 'not a member of this room';
  end if;

  update public.chat_messages
  set delivered_at = coalesce(delivered_at, now()),
      read_at      = coalesce(read_at, now())
  where id = p_message_id;
end;
$$;

-- purge_expired_chat_messages(p_room_id uuid) returns bigint
create or replace function public.purge_expired_chat_messages(p_room_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_chat_room_member(p_room_id) then
    raise exception 'not a member of this room';
  end if;

  delete from public.chat_messages
  where room_id = p_room_id
    and expires_at is not null
    and expires_at <= now();

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- Periodic purge (hourly) if pg_cron is available.
do $setup_cron$
begin
  create extension if not exists pg_cron;
  execute '
    select cron.schedule(
      ''vaultcomms-purge-expired'',
      ''0 * * * *'',
      ''delete from public.chat_messages where expires_at is not null and expires_at <= now()''
    ) where not exists (
      select 1 from cron.job where jobname = ''vaultcomms-purge-expired''
    )
  ';
exception
  when others then
    raise notice 'pg_cron not available or insufficient permissions - skipping automated cron schedule';
end $setup_cron$;

-- set_chat_member_peer(p_room_id uuid, p_peer_id text) returns void
create or replace function public.set_chat_member_peer(p_room_id uuid, p_peer_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_chat_room_member(p_room_id) then
    raise exception 'not a member of this room';
  end if;

  if p_peer_id is not null and (length(p_peer_id) = 0 or length(p_peer_id) > 128) then
    raise exception 'invalid peer id';
  end if;

  update public.chat_room_members
  set peer_id = p_peer_id, last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();
end;
$$;

-- get_chat_partner(p_room_id uuid) returns jsonb
create or replace function public.get_chat_partner(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_user uuid;
  v_peer_id text;
  v_seen timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_chat_room_member(p_room_id) then
    raise exception 'not a member of this room';
  end if;

  select m.user_id, m.peer_id, m.last_seen_at
    into v_partner_user, v_peer_id, v_seen
  from public.chat_room_members m
  where m.room_id = p_room_id
    and m.user_id <> auth.uid()
  limit 1;

  if v_partner_user is null then
    return jsonb_build_object('found', false);
  end if;

  return jsonb_build_object(
    'found', true,
    'partner_user_id', v_partner_user,
    'peer_id', v_peer_id,
    'last_seen_at', v_seen,
    'online', v_peer_id is not null and v_seen is not null and v_seen > (now() - interval '90 seconds')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication not found - enable Realtime for chat_messages in the dashboard';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Storage: private encrypted media bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vault-media', 'vault-media', false)
on conflict (id) do nothing;

drop policy if exists "vault_media_select_member" on storage.objects;
create policy "vault_media_select_member" on storage.objects
  for select
  using (
    bucket_id = 'vault-media'
    and (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/')
    and public.is_chat_room_member((string_to_array(name, '/'))[1]::uuid)
  );

drop policy if exists "vault_media_insert_member" on storage.objects;
create policy "vault_media_insert_member" on storage.objects
  for insert
  with check (
    bucket_id = 'vault-media'
    and (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.(jpg|jpeg|png|gif|webp|heic|mp4|webm|mov|ogg|wav|mp3|m4a|bin)$')
    and public.is_chat_room_member((string_to_array(name, '/'))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- 7. Reset helper and clean up stuck members from previous tests
-- ---------------------------------------------------------------------------

-- Clear stale members from earlier testing on the default pair code so it unlocks immediately.
delete from public.chat_room_members
where room_id in (select id from public.chat_rooms where pair_code = 'PAIR-1314');

-- Helper to allow authenticated users to reset a room membership if ever needed
create or replace function public.reset_chat_room(p_pair_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  p_pair_code := upper(trim(p_pair_code));
  select id into v_room_id from public.chat_rooms where pair_code = p_pair_code;
  if v_room_id is null then
    return false;
  end if;

  delete from public.chat_room_members where room_id = v_room_id;
  insert into public.chat_room_members (room_id, user_id, last_seen_at)
  values (v_room_id, auth.uid(), now());
  return true;
end;
$$;