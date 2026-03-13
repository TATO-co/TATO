import { captureException } from '@/lib/analytics';
import { runtimeConfig } from '@/lib/config';
import { supabase } from '@/lib/supabase';

type LiveAgentBootstrapPayload = {
  sessionId?: string;
  model?: string;
  ephemeralToken?: {
    name?: string;
    value?: string;
    expireTime?: string | null;
    newSessionExpireTime?: string | null;
  };
  responseModalities?: string[] | null;
  mediaResolution?: string | null;
  instructions?: string | null;
  googleCloudRegion?: string | null;
  agentName?: string | null;
  serviceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  message?: string;
};

export type LiveIntakeBootstrap = {
  sessionId: string;
  model: string;
  ephemeralToken: {
    name: string | null;
    value: string;
    expireTime: string | null;
    newSessionExpireTime: string | null;
  };
  responseModalities: string[];
  mediaResolution: string | null;
  instructions: string | null;
  googleCloudRegion: string | null;
  agentName: string | null;
  serviceUrl: string | null;
  metadata: Record<string, unknown>;
};

export type LiveIntakeBootstrapResult =
  | {
      ok: true;
      bootstrap: LiveIntakeBootstrap;
    }
  | {
      ok: false;
      message: string;
    };

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

async function getAccessToken() {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    captureException(error, { flow: 'liveIntake.getAccessToken' });
    return null;
  }

  return data.session?.access_token ?? null;
}

function toBootstrap(payload: LiveAgentBootstrapPayload): LiveIntakeBootstrap | null {
  const tokenValue = payload.ephemeralToken?.value?.trim();
  const sessionId = payload.sessionId?.trim();
  const model = payload.model?.trim();

  if (!tokenValue || !sessionId || !model) {
    return null;
  }

  return {
    sessionId,
    model,
    ephemeralToken: {
      name: payload.ephemeralToken?.name?.trim() || null,
      value: tokenValue,
      expireTime: payload.ephemeralToken?.expireTime ?? null,
      newSessionExpireTime: payload.ephemeralToken?.newSessionExpireTime ?? null,
    },
    responseModalities: (payload.responseModalities ?? []).filter(Boolean),
    mediaResolution: payload.mediaResolution ?? null,
    instructions: payload.instructions ?? null,
    googleCloudRegion: payload.googleCloudRegion ?? null,
    agentName: payload.agentName ?? null,
    serviceUrl: payload.serviceUrl ?? null,
    metadata: payload.metadata ?? {},
  };
}

export function isLiveIntakeConfigured() {
  return Boolean(runtimeConfig.liveAgentServiceUrl);
}

export async function requestLiveIntakeBootstrap(args: {
  supplierId: string;
  preferredLanguage?: string;
}): Promise<LiveIntakeBootstrapResult> {
  if (!args.supplierId) {
    return { ok: false, message: 'Supplier identity is required to start live intake.' };
  }

  if (!runtimeConfig.liveAgentServiceUrl) {
    return {
      ok: false,
      message:
        'Live intake is not configured for this build. Set EXPO_PUBLIC_LIVE_AGENT_SERVICE_URL to your Google Cloud live agent service.',
    };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { ok: false, message: 'Sign in again before starting a live intake session.' };
  }

  try {
    const response = await fetch(`${normalizeBaseUrl(runtimeConfig.liveAgentServiceUrl)}/sessions/live-intake`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        supplierId: args.supplierId,
        preferredLanguage: args.preferredLanguage ?? 'en-US',
        mode: 'supplier_live_intake',
      }),
    });

    const payload = (await response.json().catch(() => null)) as LiveAgentBootstrapPayload | null;

    if (!response.ok) {
      return {
        ok: false,
        message: payload?.message ?? 'Unable to start a live intake session.',
      };
    }

    const bootstrap = payload ? toBootstrap(payload) : null;
    if (!bootstrap) {
      return {
        ok: false,
        message: 'Live agent service returned an incomplete bootstrap payload.',
      };
    }

    return { ok: true, bootstrap };
  } catch (error) {
    captureException(error, { flow: 'liveIntake.requestLiveIntakeBootstrap' });
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to reach the live intake service.',
    };
  }
}
