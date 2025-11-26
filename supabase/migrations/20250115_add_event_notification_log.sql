create table if not exists event_notification_log (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  actor_user_id uuid not null,
  change_type text not null,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists event_notification_log_unique
  on event_notification_log (event_id, actor_user_id, change_type);
