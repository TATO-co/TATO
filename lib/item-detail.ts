export type SupplierItemUpdateDraft = {
  title: string;
  description: string;
  conditionSummary: string;
  floorPriceInput: string;
  suggestedListPriceInput: string;
};

export type SupplierItemUpdatePayload = {
  title: string;
  description: string | null;
  conditionSummary: string;
  floorPriceCents: number;
  suggestedListPriceCents: number;
};

export function canSupplierEditItem(digitalStatus: string | null | undefined) {
  return digitalStatus === 'supplier_draft' || digitalStatus === 'ready_for_claim';
}

export function formatEditablePriceInput(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

export function parseEditablePriceInput(value: string) {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!normalized) {
    return null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function validateSupplierItemUpdateDraft(draft: SupplierItemUpdateDraft):
  | { ok: true; payload: SupplierItemUpdatePayload }
  | { ok: false; message: string } {
  const title = draft.title.trim();
  if (!title) {
    return { ok: false, message: 'Enter a supplier-facing item title before saving.' };
  }

  const conditionSummary = draft.conditionSummary.trim();
  if (!conditionSummary) {
    return { ok: false, message: 'Add a condition summary before saving.' };
  }

  const floorPriceCents = parseEditablePriceInput(draft.floorPriceInput);
  if (floorPriceCents == null) {
    return { ok: false, message: 'Enter a valid floor price.' };
  }

  const suggestedListPriceCents = parseEditablePriceInput(draft.suggestedListPriceInput);
  if (suggestedListPriceCents == null) {
    return { ok: false, message: 'Enter a valid suggested list price.' };
  }

  if (suggestedListPriceCents < floorPriceCents) {
    return { ok: false, message: 'Suggested list price should be at or above the floor price.' };
  }

  return {
    ok: true,
    payload: {
      title,
      description: draft.description.trim() || null,
      conditionSummary,
      floorPriceCents,
      suggestedListPriceCents,
    },
  };
}
