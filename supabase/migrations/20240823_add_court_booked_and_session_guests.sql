-- Ensure booking flag column exists
alter table events
add column if not exists court_booked boolean not null default false;

-- Guests without app accounts per event
create table if not exists event_guests (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table event_guests enable row level security;

-- Allow authenticated users to read guests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_guests' AND policyname = 'Guests readable for authenticated users'
  ) THEN
    CREATE POLICY "Guests readable for authenticated users" ON event_guests
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
  END IF;
END $$;

-- Hosts (or service role) can insert guests for their own events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_guests' AND policyname = 'Host can insert guests for own event'
  ) THEN
    CREATE POLICY "Host can insert guests for own event" ON event_guests
    FOR INSERT
    WITH CHECK (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND EXISTS (
          SELECT 1
          FROM events e
          WHERE e.id = event_guests.event_id
            AND lower(coalesce(e.created_by_email, '')) = lower(coalesce(auth.email(), ''))
        )
      )
    );
  END IF;
END $$;

-- Hosts (or service role) can update guests for their own events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_guests' AND policyname = 'Host can update guests for own event'
  ) THEN
    CREATE POLICY "Host can update guests for own event" ON event_guests
    FOR UPDATE
    USING (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND EXISTS (
          SELECT 1
          FROM events e
          WHERE e.id = event_guests.event_id
            AND lower(coalesce(e.created_by_email, '')) = lower(coalesce(auth.email(), ''))
        )
      )
    )
    WITH CHECK (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND EXISTS (
          SELECT 1
          FROM events e
          WHERE e.id = event_guests.event_id
            AND lower(coalesce(e.created_by_email, '')) = lower(coalesce(auth.email(), ''))
        )
      )
    );
  END IF;
END $$;

-- Hosts (or service role) can delete guests for their own events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'event_guests' AND policyname = 'Host can delete guests for own event'
  ) THEN
    CREATE POLICY "Host can delete guests for own event" ON event_guests
    FOR DELETE
    USING (
      auth.role() = 'service_role'
      OR (
        auth.role() = 'authenticated'
        AND EXISTS (
          SELECT 1
          FROM events e
          WHERE e.id = event_guests.event_id
            AND lower(coalesce(e.created_by_email, '')) = lower(coalesce(auth.email(), ''))
        )
      )
    );
  END IF;
END $$;
