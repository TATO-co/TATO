import { afterEach, describe, expect, it, vi } from 'vitest';

type InvokeResult = {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
};

type UpdateCall = {
  values: Record<string, unknown>;
  id: string;
};

function createSupabaseHarness(args: {
  invokeResults: InvokeResult[];
  uploadBehaviors?: Array<{ error: { message: string } | null }>;
}) {
  const invokeQueue = [...args.invokeResults];
  const uploadQueue = [...(args.uploadBehaviors ?? [])];
  const updateCalls: UpdateCall[] = [];
  const removeCalls: string[][] = [];
  const uploadCalls: Array<{ storageKey: string; contentType?: string }> = [];

  const supabase = {
    functions: {
      invoke: vi.fn(async () => invokeQueue.shift() ?? { data: null, error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (storageKey: string, _blob: Blob, options: { contentType?: string }) => {
          uploadCalls.push({ storageKey, contentType: options.contentType });
          return uploadQueue.shift() ?? { error: null };
        }),
        remove: vi.fn(async (paths: string[]) => {
          removeCalls.push(paths);
          return { error: null };
        }),
      })),
    },
    from: vi.fn(() => ({
      update: vi.fn((values: Record<string, unknown>) => ({
        eq: vi.fn(async (_column: string, id: string) => {
          updateCalls.push({ values, id });
          return { error: null };
        }),
      })),
    })),
  };

  return {
    supabase,
    updateCalls,
    removeCalls,
    uploadCalls,
  };
}

const originalFetch = global.fetch;

describe('runIngestionPipeline', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('uploads every requested photo and persists the full photo set', async () => {
    const harness = createSupabaseHarness({
      invokeResults: [
        {
          data: {
            ok: true,
            itemId: 'item-123',
            hubId: 'hub-123',
            storageKey: 'supplier/item-123/primary-1.jpg',
            storageBucket: 'items',
            storagePath: 'items/supplier/item-123/primary-1.jpg',
          },
          error: null,
        },
        {
          data: {
            ok: true,
            analysis: {
              itemTitle: 'Game Console',
              description: 'Draft ready.',
              conditionSummary: 'Good',
              floorPriceCents: 12000,
              suggestedListPriceCents: 15000,
              confidence: 0.92,
              attributes: {},
              marketSnapshot: {},
            },
          },
          error: null,
        },
      ],
    });

    vi.doMock('@/lib/supabase', () => ({ supabase: harness.supabase }));
    vi.doMock('@/lib/analytics', () => ({ captureException: vi.fn() }));
    global.fetch = vi.fn(async () => new Response('image-bytes', {
      headers: { 'Content-Type': 'image/jpeg' },
    })) as typeof global.fetch;

    const { runIngestionPipeline } = await import('@/lib/repositories/tato');
    const result = await runIngestionPipeline({
      supplierId: 'supplier',
      photos: [
        { uri: 'file:///primary.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///detail.png', mimeType: 'image/png' },
      ],
    });

    expect(result).toEqual({
      ok: true,
      itemId: 'item-123',
      hubId: 'hub-123',
      storagePath: 'items/supplier/item-123/primary-1.jpg',
      analysis: expect.objectContaining({
        itemTitle: 'Game Console',
      }),
    });
    expect(harness.uploadCalls).toHaveLength(2);
    expect(harness.uploadCalls[0]).toMatchObject({
      storageKey: 'supplier/item-123/primary-1.jpg',
      contentType: 'image/jpeg',
    });
    expect(harness.uploadCalls[1]?.storageKey).toContain('supplier/item-123/detail-');
    expect(harness.updateCalls[0]).toEqual({
      id: 'item-123',
      values: {
        primary_photo_path: 'items/supplier/item-123/primary-1.jpg',
        photo_paths: [
          'items/supplier/item-123/primary-1.jpg',
          expect.stringMatching(/^items\/supplier\/item-123\/detail-/),
        ],
      },
    });
  });

  it('aborts the run and cleans up earlier uploads if a later photo upload fails', async () => {
    const harness = createSupabaseHarness({
      invokeResults: [
        {
          data: {
            ok: true,
            itemId: 'item-456',
            hubId: 'hub-456',
            storageKey: 'supplier/item-456/primary-1.jpg',
            storageBucket: 'items',
            storagePath: 'items/supplier/item-456/primary-1.jpg',
          },
          error: null,
        },
      ],
      uploadBehaviors: [
        { error: null },
        { error: { message: 'upload failed' } },
      ],
    });

    vi.doMock('@/lib/supabase', () => ({ supabase: harness.supabase }));
    vi.doMock('@/lib/analytics', () => ({ captureException: vi.fn() }));
    global.fetch = vi.fn(async () => new Response('image-bytes', {
      headers: { 'Content-Type': 'image/jpeg' },
    })) as typeof global.fetch;

    const { runIngestionPipeline } = await import('@/lib/repositories/tato');
    const result = await runIngestionPipeline({
      supplierId: 'supplier',
      photos: [
        { uri: 'file:///primary.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///detail.png', mimeType: 'image/png' },
      ],
    });

    expect(result).toEqual({
      ok: false,
      message: 'upload failed',
    });
    expect(harness.uploadCalls).toHaveLength(2);
    expect(harness.removeCalls).toEqual([['supplier/item-456/primary-1.jpg']]);
    expect(harness.updateCalls).toContainEqual({
      id: 'item-456',
      values: {
        ingestion_ai_status: 'failed',
      },
    });
    expect(harness.supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
