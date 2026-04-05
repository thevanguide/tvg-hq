-- TVG newsletter subscribers table
-- Run this in Supabase SQL editor once.

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  list text not null default 'newsletter',
  source text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

-- One row per (email, list) pair.
create unique index if not exists subscribers_email_list_idx
  on public.subscribers (lower(email), list);

-- Enable Row Level Security.
alter table public.subscribers enable row level security;

-- Allow anonymous inserts from the site (signup form).
-- Anon role cannot select, update, or delete.
drop policy if exists "anon can subscribe" on public.subscribers;
create policy "anon can subscribe"
  on public.subscribers
  for insert
  to anon
  with check (true);
