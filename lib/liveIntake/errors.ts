import { LIVE_INTAKE_FALLBACK_ROUTE, type LiveIntakeFallbackRoute } from '@/lib/liveIntake/types';

type MutationErrorPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  correlationId?: string;
};

type FunctionErrorContext = {
  status?: number;
  clone?: () => FunctionErrorContext;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type FunctionInvokeErrorLike = {
  message?: string;
  context?: FunctionErrorContext;
};

export type LiveWorkflowErrorContext = 'availability' | 'posting' | 'claim';

export type ClassifiedLiveWorkflowError = {
  code: string;
  message: string;
  retryable: boolean;
  unavailable: boolean;
  fallbackRoute?: LiveIntakeFallbackRoute;
  status: number | null;
};

type ClassifyLiveWorkflowErrorArgs = {
  context: LiveWorkflowErrorContext;
  fallbackMessage: string;
  error?: unknown;
  data?: MutationErrorPayload | null;
};

type NormalizedMutationError = {
  code?: string;
  message?: string;
  status: number | null;
};

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function isSessionOrJwtFailure(code: string, message: string, status: number | null) {
  return (
    status === 401
    || code === 'unauthorized'
    || code === 'invalid_jwt'
    || message.includes('invalid jwt')
    || message.includes('jwt')
    || message.includes('unauthorized')
    || message.includes('session expired')
  );
}

function isTransportFailure(code: string, message: string, status: number | null) {
  return (
    status === 502
    || status === 503
    || status === 504
    || message.includes('edge function returned a non-2xx status code')
    || message.includes('failed to send a request to the edge function')
    || message.includes('network request failed')
    || message.includes('fetch failed')
    || message.includes('load failed')
    || message.includes('internal error')
    || code === 'internal_error'
    || code === 'server_misconfigured'
  );
}

async function readFunctionErrorPayload(error: unknown): Promise<NormalizedMutationError> {
  const candidate = (error ?? {}) as FunctionInvokeErrorLike;
  const context = candidate.context;
  const status = typeof context?.status === 'number' ? context.status : null;
  const responseReader = typeof context?.clone === 'function' ? context.clone() : context;

  if (responseReader?.json) {
    const payload = (await responseReader.json().catch(() => null)) as MutationErrorPayload | null;
    if (payload && (payload.code || payload.message)) {
      return {
        code: payload.code,
        message: payload.message ?? candidate.message,
        status,
      };
    }
  }

  if (responseReader?.text) {
    const text = await responseReader.text().catch(() => '');
    if (text.trim().length > 0) {
      try {
        const payload = JSON.parse(text) as MutationErrorPayload;
        return {
          code: payload.code,
          message: payload.message ?? candidate.message,
          status,
        };
      } catch {
        return {
          code: undefined,
          message: text,
          status,
        };
      }
    }
  }

  return {
    code: undefined,
    message: candidate.message,
    status,
  };
}

export async function classifyLiveWorkflowError(
  args: ClassifyLiveWorkflowErrorArgs,
): Promise<ClassifiedLiveWorkflowError> {
  const normalized = args.data?.code || args.data?.message
    ? {
        code: args.data?.code,
        message: args.data?.message,
        status: null,
      }
    : await readFunctionErrorPayload(args.error);

  const code = normalizeText(normalized.code);
  const message = normalizeText(normalized.message);
  const status = normalized.status;

  if (args.context === 'claim') {
    if (isSessionOrJwtFailure(code, message, status)) {
      return {
        code: normalized.code ?? 'session_invalid',
        message: 'Your session expired. Sign in again and retry the claim.',
        retryable: true,
        unavailable: false,
        status,
      };
    }

    if (code === 'forbidden') {
      return {
        code: normalized.code ?? 'forbidden',
        message: 'This account cannot claim items. Sign in with an active broker account and retry.',
        retryable: false,
        unavailable: false,
        status,
      };
    }

    if (code === 'claim_unavailable') {
      return {
        code: normalized.code ?? 'claim_unavailable',
        message: 'This item is no longer available to claim. Refresh the broker queue and try another item.',
        retryable: false,
        unavailable: false,
        status,
      };
    }

    if (code === 'supplier_inactive') {
      return {
        code: normalized.code ?? 'supplier_inactive',
        message: 'This supplier is not active right now. Refresh the broker queue and choose a different item.',
        retryable: false,
        unavailable: false,
        status,
      };
    }

    if (isTransportFailure(code, message, status) || (status != null && status >= 500)) {
      return {
        code: normalized.code ?? 'claim_service_unavailable',
        message: 'Claiming is temporarily unavailable right now. Retry in a moment.',
        retryable: true,
        unavailable: true,
        status,
      };
    }

    return {
      code: normalized.code ?? 'claim_failed',
      message: normalized.message?.trim() || args.fallbackMessage,
      retryable: true,
      unavailable: false,
      status,
    };
  }

  if (code === 'missing_hub') {
    return {
      code: normalized.code ?? 'missing_hub',
      message: 'Live posting is unavailable until this supplier hub is active. Use photo capture instead.',
      retryable: false,
      unavailable: true,
      fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
      status,
    };
  }

  if (code === 'forbidden') {
    return {
      code: normalized.code ?? 'forbidden',
      message: 'Live posting is unavailable for this account right now. Use photo capture instead.',
      retryable: false,
      unavailable: true,
      fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
      status,
    };
  }

  if (isSessionOrJwtFailure(code, message, status)) {
    return {
      code: normalized.code ?? 'live_posting_unavailable',
      message: 'Live posting is temporarily unavailable right now. Use photo capture instead.',
      retryable: true,
      unavailable: true,
      fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
      status,
    };
  }

  if (isTransportFailure(code, message, status) || (status != null && status >= 500)) {
    return {
      code: normalized.code ?? 'live_posting_unavailable',
      message: 'Live posting is temporarily unavailable right now. Use photo capture instead.',
      retryable: true,
      unavailable: true,
      fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
      status,
    };
  }

  return {
    code: normalized.code ?? 'live_posting_failed',
    message: normalized.message?.trim() || args.fallbackMessage,
    retryable: true,
    unavailable: false,
    fallbackRoute: LIVE_INTAKE_FALLBACK_ROUTE,
    status,
  };
}
