import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import webpush from 'npm:web-push@3.6.11';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY =
  'BJNAvvUUBpijYcgnLtGHwk2lGQ9fzbRlGiZgXbg8AgyfOFLpb-PscbudWEd5JeCmskmiKpfxVtf7xqrX6ksscYg';

const getSupabaseClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Supabase credentials are not configured.');
  }
  return createClient(url, key);
};

type Actor = {
  id: string;
  name?: string;
  email?: string;
};

type EventSummary = {
  id?: string;
  title?: string;
  location?: string;
  date?: string;
  time?: string;
  owner?: string;
  city?: string;
  createdByUserId?: string | null;
};

type Audience = {
  userIds?: string[];
  excludeUserIds?: string[];
};

type PushRequest = {
  type: 'event.created' | 'event.cancelled' | 'event.joined' | 'event.left';
  actor: Actor;
  event?: EventSummary | null;
  audience?: Audience;
  appUrl?: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const defaultAppUrl = 'https://padel.community';

const buildNotificationCopy = (type: PushRequest['type'], event?: EventSummary | null, actor?: Actor) => {
  const dateLabel = (() => {
    if (!event?.date) {
      return '';
    }
    try {
      const base = `${event.date}${event.time ? `T${event.time}` : 'T00:00'}`;
      const formatted = new Date(base);
      if (Number.isNaN(formatted.getTime())) {
        return '';
      }
      return new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: event.time ? '2-digit' : undefined,
        minute: event.time ? '2-digit' : undefined,
      }).format(formatted);
    } catch (_error) {
      return '';
    }
  })();

  const eventLabel = event?.title ?? 'Padel Session';
  const location = event?.location ? ` @ ${event.location}` : '';
  const actorName = actor?.name || actor?.email || 'Ein Community-Mitglied';

  switch (type) {
    case 'event.created':
      return {
        title: `Neue Session: ${eventLabel}`,
        body: `${actorName} hostet${location} am ${dateLabel || 'bald'}.`,
      };
    case 'event.cancelled':
      return {
        title: `Session abgesagt`,
        body: `${eventLabel}${location} wurde von ${actorName} abgesagt.`,
      };
    case 'event.joined':
      return {
        title: `Neue Zusage für ${eventLabel}`,
        body: `${actorName} nimmt jetzt teil.`,
      };
    case 'event.left':
    default:
      return {
        title: `Absage für ${eventLabel}`,
        body: `${actorName} hat seine Teilnahme zurückgezogen.`,
      };
  }
};

const fetchRecipients = async (client: ReturnType<typeof createClient>, request: PushRequest) => {
  const requestedIds = request.audience?.userIds;
  const exclude = new Set(request.audience?.excludeUserIds ?? []);

  let query = client.from('web_push_subscriptions').select('*');
  if (Array.isArray(requestedIds) && requestedIds.length > 0) {
    query = query.in('user_id', requestedIds);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as SubscriptionRow[];
  return rows.filter((row) => !exclude.has(row.user_id));
};

const resolveAudience = async (
  client: ReturnType<typeof createClient>,
  request: PushRequest
): Promise<SubscriptionRow[]> => {
  if (request.audience?.userIds?.length) {
    return fetchRecipients(client, request);
  }

  if (request.type === 'event.joined' || request.type === 'event.left') {
    const hostId = request.event?.createdByUserId;
    if (hostId) {
      return fetchRecipients(client, {
        ...request,
        audience: { userIds: [hostId] },
      });
    }
    return [];
  }

  // Broadcast to everyone except the actor for create/cancel events.
  return fetchRecipients(client, {
    ...request,
    audience: { excludeUserIds: [request.actor.id] },
  });
};

const removeInvalidSubscription = async (
  client: ReturnType<typeof createClient>,
  id: string
) => {
  await client.from('web_push_subscriptions').delete().eq('id', id);
};

const sendNotifications = async (
  recipients: SubscriptionRow[],
  request: PushRequest,
  client: ReturnType<typeof createClient>
) => {
  const payload = buildNotificationCopy(request.type, request.event, request.actor);
  const targetUrl = request.appUrl || defaultAppUrl;
  const body = {
    title: payload.title,
    body: payload.body,
    icon: `${targetUrl}/assets/icons/icon-192.svg`,
    badge: `${targetUrl}/assets/icons/icon-192.svg`,
    data: {
      url: targetUrl,
      eventId: request.event?.id ?? null,
      type: request.type,
    },
  };

  const results = await Promise.allSettled(
    recipients.map(async (recipient) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: recipient.endpoint,
            keys: { p256dh: recipient.p256dh, auth: recipient.auth },
          },
          JSON.stringify(body),
          { TTL: 60 }
        );
        return { id: recipient.id, status: 'sent' };
      } catch (error) {
        const err = error as webpush.WebPushError;
        if (err.statusCode === 404 || err.statusCode === 410) {
          await removeInvalidSubscription(client, recipient.id);
        }
        return { id: recipient.id, status: 'failed', message: err.message };
      }
    })
  );

  const summary = results.reduce(
    (acc, result) => {
      if (result.status === 'fulfilled') {
        acc.sent += 1;
      } else {
        acc.failed += 1;
      }
      return acc;
    },
    { sent: 0, failed: 0 }
  );

  return summary;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPrivateKey) {
      throw new Error('VAPID_PRIVATE_KEY is not configured.');
    }

    const body = (await req.json()) as PushRequest;
    if (!body?.type || !body?.actor?.id) {
      return new Response(JSON.stringify({ error: 'Invalid payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const client = getSupabaseClient();

    webpush.setVapidDetails('mailto:push@padel.community', VAPID_PUBLIC_KEY, vapidPrivateKey);

    const recipients = await resolveAudience(client, body);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ delivered: 0, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const summary = await sendNotifications(recipients, body, client);

    return new Response(JSON.stringify({ delivered: summary.sent, failed: summary.failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-web-push error', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
