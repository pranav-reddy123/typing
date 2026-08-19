# Database

Postgres (Supabase). Every table has RLS enabled. The local IndexedDB provider
mirrors this shape exactly (same field names, same ids) so the two are swappable.

## Tables

### profiles
One row per user, keyed to `auth.users`. Public-readable.

```sql
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     citext unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 40),
  bio          text check (char_length(bio) <= 160),
  avatar_seed  text not null default gen_random_uuid()::text,
  created_at   timestamptz not null default now()
);
create index profiles_username_trgm on profiles using gin (username gin_trgm_ops);
```

`avatar_seed` drives a deterministic generated avatar - no image uploads, no storage
bucket, no moderation surface.

### user_settings

```sql
create table user_settings (
  user_id    uuid primary key references profiles on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

Preferences are a single JSONB blob: they are read and written whole, never queried
by field. One column beats fourteen.

### typing_tests

The immutable record of one completed test.

```sql
create table typing_tests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles on delete cascade,
  mode            text not null check (mode in ('time','words','quote','custom','zen')),
  duration_s      integer not null check (duration_s between 1 and 3600),
  target          integer,
  language        text not null default 'english',
  punctuation     boolean not null default false,
  numbers         boolean not null default false,
  difficulty      text not null default 'normal',
  wpm             numeric(6,2) not null check (wpm >= 0 and wpm <= 400),
  raw_wpm         numeric(6,2) not null check (raw_wpm >= 0 and raw_wpm <= 400),
  accuracy        numeric(5,2) not null check (accuracy between 0 and 100),
  consistency     numeric(5,2) not null check (consistency between 0 and 100),
  chars_correct   integer not null check (chars_correct >= 0),
  chars_incorrect integer not null check (chars_incorrect >= 0),
  chars_extra     integer not null default 0,
  chars_missed    integer not null default 0,
  keystrokes      integer not null,
  race_id         uuid references races on delete set null,
  created_at      timestamptz not null default now()
);
create index typing_tests_user_created on typing_tests (user_id, created_at desc);
create index typing_tests_leaderboard on typing_tests (mode, target, wpm desc)
  where user_id is not null;
```

The check constraints are the first line of defence against a client posting
`wpm = 9999`.

### typing_samples

Per-second series for one test, used for the results graph and consistency.

```sql
create table typing_samples (
  test_id uuid primary key references typing_tests on delete cascade,
  wpm     smallint[] not null,
  raw     smallint[] not null,
  errors  smallint[] not null
);
```

Arrays rather than a row-per-second table: a 120 s test is 3 arrays in 1 row instead
of 120 rows, and it is always read whole.

### typing_events

Aggregated keystroke outcomes per test - the source of the keyboard heatmap.
Raw keylogging is never stored.

```sql
create table typing_events (
  test_id  uuid references typing_tests on delete cascade,
  expected char not null,
  typed    char,
  count    integer not null,
  primary key (test_id, expected, typed)
);
create index typing_events_expected on typing_events (expected);
```

This stores "you hit `k` when `l` was expected, 4 times" - enough for every error
analysis in the product, and nothing that could reconstruct what was typed.

### friendships

One row per relationship, canonically ordered so a pair can only exist once.

```sql
create table friendships (
  user_a     uuid references profiles on delete cascade,
  user_b     uuid references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
```

### friend_requests

```sql
create table friend_requests (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references profiles on delete cascade,
  to_user    uuid not null references profiles on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);
create index friend_requests_inbox on friend_requests (to_user, status);
```

### races

```sql
create table races (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null check (code ~ '^[A-Z0-9]{4}$'),
  host_id    uuid not null references profiles on delete cascade,
  text_seed  text not null,
  word_count integer not null default 40,
  status     text not null default 'lobby'
             check (status in ('lobby','countdown','running','finished','expired')),
  starts_at  timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);
create index races_open on races (status, created_at desc) where status = 'lobby';
```

`text_seed` rather than the text itself: every client runs the same seeded PRNG and
produces identical words, so the payload is 8 bytes instead of 2 kB and no player
can be served a different (easier) passage.

### race_participants

```sql
create table race_participants (
  race_id     uuid references races on delete cascade,
  user_id     uuid references profiles on delete cascade,
  ready       boolean not null default false,
  progress    smallint not null default 0 check (progress between 0 and 100),
  wpm         numeric(6,2) not null default 0,
  accuracy    numeric(5,2) not null default 0,
  finished_at timestamptz,
  place       smallint,
  left_at     timestamptz,
  joined_at   timestamptz not null default now(),
  primary key (race_id, user_id)
);
create index race_participants_by_user on race_participants (user_id, joined_at desc);
```

The composite primary key makes duplicate joins structurally impossible - a second
join is an upsert, not a second player.

### achievements / user_achievements

```sql
create table achievements (
  key         text primary key,
  title       text not null,
  description text not null,
  tier        smallint not null default 1
);
create table user_achievements (
  user_id   uuid references profiles on delete cascade,
  key       text references achievements,
  earned_at timestamptz not null default now(),
  primary key (user_id, key)
);
```

### leaderboard_entries

A materialised view, not a table - leaderboards are derived data and must never
drift from `typing_tests`. Refreshed concurrently every five minutes.

```sql
create materialized view leaderboard_entries as
select distinct on (user_id, mode, target, period)
       user_id, mode, target, period, wpm, accuracy, tests, created_at
from  ...
order by user_id, mode, target, period, wpm desc;
create unique index on leaderboard_entries (user_id, mode, target, period);
```

## Row-level security

The pattern, applied to every table:

```sql
alter table typing_tests enable row level security;

create policy "read own tests" on typing_tests
  for select using (auth.uid() = user_id);

create policy "read friends tests" on typing_tests
  for select using (exists (
    select 1 from friendships f
    where (f.user_a = auth.uid() and f.user_b = typing_tests.user_id)
       or (f.user_b = auth.uid() and f.user_a = typing_tests.user_id)));

create policy "insert own tests" on typing_tests
  for insert with check (auth.uid() = user_id);
-- no update policy, no delete policy: results are immutable by construction
```

Races: participants may read the race row and all participant rows; a participant
may update **only their own row**, and only `ready`, `progress`, `wpm`, `accuracy`.
`status` and `starts_at` are writable solely by a `security definer` function, so no
client can start a race early or declare itself the winner.

## Result integrity

Client-reported numbers are accepted for the user's own history - that history is
theirs, and lying to yourself is not an attack. They are **not** trusted for
leaderboards or race placement.

Before a result becomes leaderboard-eligible, an edge function re-derives WPM from
`typing_samples` and `typing_events` and rejects the row when:

- derived WPM disagrees with reported WPM by more than 2%
- keystroke count is inconsistent with the character counts
- per-second variance is implausibly low (a bot types exactly 140.00 every second)
- the submission arrived sooner after test start than the test's own duration
- the user has submitted more than 30 tests in the last 5 minutes (rate limit)

Race placement is set from `finished_at` timestamps written server-side, never from
a client claiming it won.

## Local provider parity

`LocalProvider` stores the same records in IndexedDB object stores with the same
names and key paths (`profiles`, `typing_tests`, `typing_samples`, `typing_events`,
`friendships`, `friend_requests`, `races`, `race_participants`, `user_achievements`,
`user_settings`). Indexes mirror the Postgres ones (`typing_tests.by_user_created`,
`friend_requests.by_inbox`). Passwords are stored as PBKDF2-SHA256, 210 000
iterations, 16-byte random salt, via WebCrypto - never in plaintext, even locally.
