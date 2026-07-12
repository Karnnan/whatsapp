-- =====================================================================
-- WhatsApp Auto-Reply & Broadcast Bot — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- The backend connects with the SERVICE ROLE key, which bypasses RLS,
-- so no additional policies are required for the bot to work.
-- =====================================================================

-- 1. Keyword -> reply pairs used by the auto-reply engine.
create table if not exists public.keywords (
  id          bigint generated always as identity primary key,
  keyword     text not null,
  reply       text not null,
  created_at  timestamptz not null default now()
);

-- 2. Single-row settings table (feature toggles).
create table if not exists public.settings (
  id                 bigint generated always as identity primary key,
  auto_reply_enabled boolean not null default false,
  updated_at         timestamptz not null default now()
);

-- Seed exactly one settings row if the table is empty.
insert into public.settings (auto_reply_enabled)
select false
where not exists (select 1 from public.settings);

-- 3. Extracted contacts. Unique per (phone_number, group_id) so re-extracting
--    a group updates existing rows instead of duplicating them.
create table if not exists public.contacts (
  id           bigint generated always as identity primary key,
  phone_number text not null,
  name         text,          -- saved contact name (if the number is in your address book)
  pushname     text,          -- public WhatsApp display name
  about_text   text,          -- the "About" / status text
  group_id     text,
  group_name   text,
  created_at   timestamptz not null default now(),
  unique (phone_number, group_id)
);

create index if not exists contacts_group_id_idx on public.contacts (group_id);
create index if not exists contacts_phone_idx on public.contacts (phone_number);
