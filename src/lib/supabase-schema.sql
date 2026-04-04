-- The Van Guide — Supabase schema
-- Run this in the Supabase SQL editor after creating the `tvg-production` project.
-- The scraper session will populate this table.

create table if not exists public.builders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  state text not null,
  city text,
  website text,
  platforms text[] default '{}',
  services text[] default '{}',
  price_tier text check (price_tier in ('Basic', 'Standard', 'Premium', 'Custom')),
  year_founded int,
  description text,
  logo_url text,
  gallery_urls text[] default '{}',
  claimed boolean default false,
  verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (state, slug)
);

create index if not exists builders_state_idx on public.builders (state);
create index if not exists builders_slug_idx on public.builders (slug);
create index if not exists builders_name_trgm on public.builders using gin (name gin_trgm_ops);

-- Full-text search support
create extension if not exists pg_trgm;

-- Row-level security: public read-only access for the anon key.
alter table public.builders enable row level security;

create policy "builders_public_read"
  on public.builders for select
  to anon, authenticated
  using (true);

-- Only service_role can write. The scraper uses the service key server-side.
