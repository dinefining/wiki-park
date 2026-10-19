-- Wiki Park: everything the shared park needs in Supabase.
-- Paste all of this into Supabase → SQL Editor → New query, and click Run.
-- Running it once is enough. It's safe to run again: it skips what already exists.

-- ------------------------------------------------------------------ lanterns --

create table if not exists public.lanterns (
  id bigint generated always as identity primary key,
  article_title text not null check (char_length(article_title) between 1 and 300),
  x integer not null check (x between 0 and 4096),
  y integer not null check (y between 0 and 4096),
  secret_hash text, -- sha-256 of a secret only the walker who left it knows
  created_at timestamptz not null default now()
);
alter table public.lanterns add column if not exists secret_hash text;
create index if not exists lanterns_created_at on public.lanterns (created_at);

alter table public.lanterns enable row level security;
grant select, insert on public.lanterns to anon;

drop policy if exists "anyone can see lanterns" on public.lanterns;
create policy "anyone can see lanterns"
  on public.lanterns for select to anon using (true);

-- Walkers can only add lanterns stamped "now"; they can't edit or delete them directly.
drop policy if exists "anyone can leave a lantern" on public.lanterns;
create policy "anyone can leave a lantern"
  on public.lanterns for insert to anon
  with check (created_at > now() - interval '1 minute' and created_at < now() + interval '1 minute');

-- Taking a lantern back: only with the secret the walker's browser kept.
create or replace function public.remove_lantern(lantern_id bigint, secret text)
returns boolean language sql security definer set search_path = public as $$
  with d as (
    delete from lanterns
    where id = lantern_id
      and secret_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex')
    returning 1
  )
  select exists (select 1 from d);
$$;
grant execute on function public.remove_lantern(bigint, text) to anon;

-- ----------------------------------------------------------------- plantings --

create table if not exists public.plantings (
  id bigint generated always as identity primary key,
  article_title text not null unique check (char_length(article_title) between 1 and 300),
  x integer not null check (x between 0 and 4096), -- the plant's centre
  y integer not null check (y between 0 and 4096),
  n smallint not null check (n between 0 and 4), -- nature, in quarters
  t smallint not null check (t between 0 and 4), -- technology
  h smallint not null check (h between 0 and 4), -- being human
  size smallint not null default 0 check (size between 0 and 2), -- flower, bush, tree
  tint smallint not null default 0 check (tint between 0 and 7),
  created_at timestamptz not null default now(),
  unique (x, y),
  check (n + t + h = 4)
);

alter table public.plantings enable row level security;
grant select, insert on public.plantings to anon;

drop policy if exists "anyone can see plantings" on public.plantings;
create policy "anyone can see plantings"
  on public.plantings for select to anon using (true);

drop policy if exists "anyone can plant" on public.plantings;
create policy "anyone can plant"
  on public.plantings for insert to anon
  with check (created_at > now() - interval '1 minute' and created_at < now() + interval '1 minute');

-- ------------------------------------------------------------------ realtime --
-- New and removed lanterns, and new plantings, appear for everyone straight away.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'lanterns') then
    alter publication supabase_realtime add table public.lanterns;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'plantings') then
    alter publication supabase_realtime add table public.plantings;
  end if;
end $$;
