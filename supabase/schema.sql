-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- It creates everything the predictor app needs.

create extension if not exists "pgcrypto";

-- One row per friend who has joined the league
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text generated always as (lower(trim(name))) stored,
  token text not null unique,           -- secret identity token stored in the player's browser
  created_at timestamptz not null default now()
);
create unique index if not exists players_name_key_unique on players (name_key);

-- One row per fixture, kept in sync from footballwebpages.co.uk
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  source_match_id text not null unique,   -- the numeric id footballwebpages.co.uk uses in match URLs
  matchweek text,                         -- e.g. the fixture date's Saturday, used to group the UI
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled', -- 'scheduled' | 'postponed' | 'finished'
  home_score int,
  away_score int,
  source_url text,
  updated_at timestamptz not null default now()
);
create index if not exists matches_kickoff_idx on matches (kickoff_at);

-- One row per player per match. Points are (re)computed whenever a result comes in.
create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  home_pred int not null,
  away_pred int not null,
  points numeric,
  updated_at timestamptz not null default now(),
  unique (player_id, match_id)
);
create index if not exists predictions_match_idx on predictions (match_id);
create index if not exists predictions_player_idx on predictions (player_id);

-- Nothing else to add: the app's server-side API routes use the Supabase
-- service-role key, so no Row Level Security policies are required (the
-- database is never reached directly from a friend's browser).
