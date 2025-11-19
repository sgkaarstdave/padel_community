import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getSupabaseClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Supabase credentials are not configured for the Edge Function.');
  }
  return createClient(url, key);
};

type SubscriptionPayload = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type RequestBody = {
  action?: 'subscribe' | 'unsubscribe';
  userId?: string;
  subscription?: SubscriptionPayload;
  userAgent?: string | null;
};

const normalizeSubscription = (subscription: SubscriptionPayload | undefined) => {
  if (!subscription?.endpoint) {
    return null;
  }
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!p256dh || !auth) {
    return null;
  }
  return {
    endpoint: subscription.endpoint,
    p256dh,
    auth,
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const action = body.action ?? 'subscribe';
    const userId = body.userId;
    const subscription = normalizeSubscription(body.subscription);

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseClient();

    if (action === 'unsubscribe') {
      if (!body.subscription?.endpoint) {
        return new Response(JSON.stringify({ error: 'endpoint is required for unsubscribe.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase
        .from('web_push_subscriptions')
        .delete()
        .match({ user_id: userId, endpoint: body.subscription.endpoint });

      return new Response(
        JSON.stringify({ success: true, action: 'unsubscribe', endpoint: body.subscription.endpoint }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscription) {
      return new Response(JSON.stringify({ error: 'A valid subscription (endpoint, keys) is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      user_agent: body.userAgent ?? null,
    };

    const { data, error } = await supabase
      .from('web_push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' })
      .select('id, endpoint')
      .single();

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, id: data?.id, endpoint: data?.endpoint }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('register-push-subscription error', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
