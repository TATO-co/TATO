import { captureException } from '@/lib/analytics';
import { runtimeConfig } from '@/lib/config';
import {
  buildLiveDraftPersistencePayload,
  createEmptyLiveDraftState,
} from '@/lib/liveIntake/state';
import type {
  LiveDraftPersistencePayload,
  LiveDraftState,
} from '@/lib/liveIntake/types';
import { createRequestKey, type CurrencyCode } from '@/lib/models';
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

type MutationErrorResponse = {
  ok?: false;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type StartLiveIntakeDraftResult =
  | {
      ok: true;
      itemId: string;
      hubId: string;
      storageBucket: string;
      storageKey: string;
      storagePath: string;
      currencyCode: CurrencyCode;
    }
  | {
      ok: false;
      message: string;
    };

export type CompleteLiveIntakeDraftResult =
  | {
      ok: true;
      itemId: string;
      storagePath: string;
      digitalStatus: string | null;
    }
  | {
      ok: false;
      message: string;
    };

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured for this build.');
  }

  return supabase;
}

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

function toMutationMessage(data: MutationErrorResponse | null | undefined, fallback: string) {
  return data?.message ?? fallback;
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

export function createInitialLiveDraftState(currencyCode: CurrencyCode = 'USD') {
  return createEmptyLiveDraftState(currencyCode);
}

export function createLiveDraftPayload(args: {
  itemId: string;
  storagePath: string;
  state: LiveDraftState;
  description: string;
}): LiveDraftPersistencePayload {
  return buildLiveDraftPersistencePayload(args);
}

export async function startLiveIntakeDraft(args: {
  hubId?: string | null;
  currencyCode?: CurrencyCode;
  mimeType?: string;
  fileExtension?: string;
  requestKey?: string;
}): Promise<StartLiveIntakeDraftResult> {
  try {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke('start-live-intake-draft', {
      body: {
        hubId: args.hubId ?? undefined,
        mimeType: args.mimeType ?? 'image/jpeg',
        fileExtension: args.fileExtension ?? 'jpg',
        currencyCode: args.currencyCode ?? 'USD',
        requestKey: args.requestKey ?? createRequestKey('live_intake_draft'),
      },
    });

    if (error) {
      captureException(error, { flow: 'liveIntake.startDraft' });
      return { ok: false, message: error.message };
    }

    if (
      !data?.ok
      || !data?.itemId
      || !data?.hubId
      || !data?.storageBucket
      || !data?.storageKey
      || !data?.storagePath
    ) {
      return {
        ok: false,
        message: toMutationMessage(data as MutationErrorResponse, 'Unable to start the live intake draft.'),
      };
    }

    return {
      ok: true,
      itemId: data.itemId as string,
      hubId: data.hubId as string,
      storageBucket: data.storageBucket as string,
      storageKey: data.storageKey as string,
      storagePath: data.storagePath as string,
      currencyCode: ((data.currencyCode as CurrencyCode | undefined) ?? args.currencyCode ?? 'USD'),
    };
  } catch (error) {
    captureException(error, { flow: 'liveIntake.startDraft.unhandled' });
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to start the live intake draft.',
    };
  }
}

export async function uploadLiveIntakeSnapshot(args: {
  storageBucket: string;
  storageKey: string;
  snapshot: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
}) {
  try {
    const client = requireSupabase();
    const { error } = await client.storage.from(args.storageBucket).upload(args.storageKey, args.snapshot, {
      upsert: true,
      contentType: args.contentType ?? 'image/jpeg',
    });

    if (error) {
      captureException(error, { flow: 'liveIntake.uploadSnapshot' });
      return { ok: false as const, message: error.message };
    }

    return { ok: true as const };
  } catch (error) {
    captureException(error, { flow: 'liveIntake.uploadSnapshot.unhandled' });
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : 'Unable to upload the live intake snapshot.',
    };
  }
}

export async function completeLiveIntakeDraft(args: {
  payload: LiveDraftPersistencePayload;
  requestKey?: string;
}): Promise<CompleteLiveIntakeDraftResult> {
  try {
    const client = requireSupabase();
    const { data, error } = await client.functions.invoke('complete-live-intake-draft', {
      body: {
        ...args.payload,
        requestKey: args.requestKey ?? createRequestKey('live_intake_complete'),
      },
    });

    if (error) {
      captureException(error, { flow: 'liveIntake.completeDraft' });
      return { ok: false, message: error.message };
    }

    if (!data?.ok || !data?.itemId || !data?.storagePath) {
      return {
        ok: false,
        message: toMutationMessage(data as MutationErrorResponse, 'Unable to complete the live intake draft.'),
      };
    }

    return {
      ok: true,
      itemId: data.itemId as string,
      storagePath: data.storagePath as string,
      digitalStatus: (data.digitalStatus ?? null) as string | null,
    };
  } catch (error) {
    captureException(error, { flow: 'liveIntake.completeDraft.unhandled' });
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to complete the live intake draft.',
    };
  }
}
