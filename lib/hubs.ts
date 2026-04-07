export type SupplierHubStatus = 'active' | 'paused' | 'closed';

export type SupplierHub = {
  id: string;
  supplierId: string;
  name: string;
  status: SupplierHubStatus;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  pickupInstructions: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierHubDraft = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  pickupInstructions: string;
};

export function createBlankSupplierHubDraft(args: {
  countryCode?: string | null;
} = {}): SupplierHubDraft {
  return {
    name: 'Main Pickup Hub',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    countryCode: args.countryCode ?? 'US',
    pickupInstructions: 'Pickup by appointment.',
  };
}

export function createTestingSupplierHubDraft(args: {
  countryCode?: string | null;
  name?: string | null;
} = {}): SupplierHubDraft {
  return {
    name: args.name?.trim() || 'Development Hub',
    addressLine1: '100 Dev Loop',
    addressLine2: '',
    city: 'Chicago',
    state: 'IL',
    postalCode: '60601',
    countryCode: args.countryCode ?? 'US',
    pickupInstructions: 'Development-only pickup hub.',
  };
}

export function hasActiveSupplierHub(hubs: SupplierHub[]) {
  return hubs.some((hub) => hub.status === 'active');
}
