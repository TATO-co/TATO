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

export type ParsedFunctionError = {
  code?: string;
  message?: string;
  status: number | null;
  details?: Record<string, unknown>;
  correlationId?: string;
};

function normalizePayload(value: unknown): MutationErrorPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as MutationErrorPayload;
}

export async function readFunctionErrorPayload(error: unknown): Promise<ParsedFunctionError> {
  const candidate = (error ?? {}) as FunctionInvokeErrorLike;
  const context = candidate.context;
  const status = typeof context?.status === 'number' ? context.status : null;
  const responseReader = typeof context?.clone === 'function' ? context.clone() : context;

  if (responseReader?.json) {
    const payload = normalizePayload(await responseReader.json().catch(() => null));
    if (payload && (payload.code || payload.message || payload.correlationId)) {
      return {
        code: payload.code,
        message: payload.message ?? candidate.message,
        status,
        details: payload.details,
        correlationId: payload.correlationId,
      };
    }
  }

  if (responseReader?.text) {
    const text = await responseReader.text().catch(() => '');
    if (text.trim().length > 0) {
      try {
        const payload = normalizePayload(JSON.parse(text));
        if (payload && (payload.code || payload.message || payload.correlationId)) {
          return {
            code: payload.code,
            message: payload.message ?? candidate.message,
            status,
            details: payload.details,
            correlationId: payload.correlationId,
          };
        }
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
