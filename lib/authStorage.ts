export type AuthStorage = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
};

export function createMemoryAuthStorage(initialState?: Record<string, string>): AuthStorage {
  const store = new Map<string, string>(Object.entries(initialState ?? {}));

  return {
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

export function createResilientAuthStorage(args: {
  primary: AuthStorage;
  fallback?: AuthStorage;
  label?: string;
  startInFallback?: boolean;
  onFallback?: (error: unknown) => void;
}): AuthStorage {
  const fallback = args.fallback ?? createMemoryAuthStorage();
  const label = args.label ?? 'auth storage';
  let useFallback = args.startInFallback ?? false;
  let warned = false;

  const switchToFallback = (error: unknown) => {
    useFallback = true;

    if (!warned) {
      warned = true;
      args.onFallback?.(error);
      console.warn(`[${label}] Falling back to in-memory storage.`, error);
    }
  };

  return {
    async getItem(key) {
      if (useFallback) {
        return fallback.getItem(key);
      }

      try {
        return await args.primary.getItem(key);
      } catch (error) {
        switchToFallback(error);
        return fallback.getItem(key);
      }
    },
    async setItem(key, value) {
      if (useFallback) {
        await fallback.setItem(key, value);
        return;
      }

      try {
        await args.primary.setItem(key, value);
      } catch (error) {
        switchToFallback(error);
        await fallback.setItem(key, value);
      }
    },
    async removeItem(key) {
      if (useFallback) {
        await fallback.removeItem(key);
        return;
      }

      try {
        await args.primary.removeItem(key);
      } catch (error) {
        switchToFallback(error);
        await fallback.removeItem(key);
      }
    },
  };
}
