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

  // Strategy 1: clone the context and read JSON (preserves original for other consumers).
  if (context) {
    let jsonReader: FunctionErrorContext | null = null;

    try {
      jsonReader = typeof context.clone === 'function' ? context.clone() : context;
    } catch {
      jsonReader = context;
    }

    if (jsonReader?.json) {
      const payload = normalizePayload(await jsonReader.json().catch(() => null));
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

    // Strategy 2: clone and read as text, then parse as JSON.
    let textReader: FunctionErrorContext | null = null;

    try {
      textReader = typeof context.clone === 'function' ? context.clone() : context;
    } catch {
      textReader = context;
    }

    if (textReader?.text) {
      const text = await textReader.text().catch(() => '');
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
  }

  // Strategy 3: try to parse the error message itself as JSON (some Supabase
  // client versions embed the structured response in the error message).
  if (candidate.message && candidate.message.trim().startsWith('{')) {
    try {
      const payload = normalizePayload(JSON.parse(candidate.message));
      if (payload && (payload.code || payload.message || payload.correlationId)) {
        return {
          code: payload.code,
          message: payload.message,
          status,
          details: payload.details,
          correlationId: payload.correlationId,
        };
      }
    } catch {
      // Not parseable JSON — continue to fallback.
    }
  }

  return {
    code: undefined,
    message: candidate.message,
    status,
  };
}
