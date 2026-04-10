import { create } from 'zustand';

import type { BrokerCategory } from '@/lib/models';

export type BrokerWorkspaceFocus = 'Nearby' | 'Best Payout' | 'Electronics' | 'Shippable';
export type BrokerWorkspaceSort = 'Newest' | 'Best Payout' | 'Best AI';
export type BrokerWorkspaceShippingMode = 'all' | 'local' | 'shippable';
export type SupplierWorkspaceFilter = 'all' | 'available' | 'claimed' | 'pending';

export const defaultBrokerFocusFilters: Record<BrokerWorkspaceFocus, boolean> = {
  Nearby: true,
  'Best Payout': false,
  Electronics: false,
  Shippable: false,
};

type BrokerWorkspaceUiState = {
  activeCategory: BrokerCategory;
  searchQuery: string;
  selectedCities: string[];
  desktopFocusFilters: Record<BrokerWorkspaceFocus, boolean>;
  desktopSort: BrokerWorkspaceSort;
  shippingMode: BrokerWorkspaceShippingMode;
  minBrokerPayoutCents: number;
  minAiConfidence: number;
};

type SupplierWorkspaceUiState = {
  activeFilter: SupplierWorkspaceFilter;
};

type WorkspaceUiStore = {
  broker: BrokerWorkspaceUiState;
  supplier: SupplierWorkspaceUiState;
  resetBrokerDesktopControls: () => void;
  setBrokerActiveCategory: (category: BrokerCategory) => void;
  setBrokerMinAiConfidence: (value: number) => void;
  setBrokerMinBrokerPayoutCents: (value: number) => void;
  setBrokerSearchQuery: (value: string) => void;
  setBrokerShippingMode: (mode: BrokerWorkspaceShippingMode) => void;
  setBrokerSort: (sort: BrokerWorkspaceSort) => void;
  setSupplierActiveFilter: (filter: SupplierWorkspaceFilter) => void;
  toggleBrokerCity: (city: string) => void;
  toggleBrokerFocusFilter: (filter: BrokerWorkspaceFocus) => void;
};

const initialBrokerState: BrokerWorkspaceUiState = {
  activeCategory: 'Nearby',
  searchQuery: '',
  selectedCities: [],
  desktopFocusFilters: { ...defaultBrokerFocusFilters },
  desktopSort: 'Newest',
  shippingMode: 'all',
  minBrokerPayoutCents: 0,
  minAiConfidence: 0,
};

export const useWorkspaceUiStore = create<WorkspaceUiStore>((set) => ({
  broker: initialBrokerState,
  supplier: {
    activeFilter: 'all',
  },
  setBrokerActiveCategory: (activeCategory) =>
    set((state) => ({
      broker: {
        ...state.broker,
        activeCategory,
      },
    })),
  setBrokerSearchQuery: (searchQuery) =>
    set((state) => ({
      broker: {
        ...state.broker,
        searchQuery,
      },
    })),
  toggleBrokerCity: (city) =>
    set((state) => ({
      broker: {
        ...state.broker,
        selectedCities: state.broker.selectedCities.includes(city)
          ? state.broker.selectedCities.filter((value) => value !== city)
          : [...state.broker.selectedCities, city],
      },
    })),
  toggleBrokerFocusFilter: (filter) =>
    set((state) => ({
      broker: {
        ...state.broker,
        desktopFocusFilters: {
          ...state.broker.desktopFocusFilters,
          [filter]: !state.broker.desktopFocusFilters[filter],
        },
      },
    })),
  setBrokerShippingMode: (shippingMode) =>
    set((state) => ({
      broker: {
        ...state.broker,
        shippingMode,
      },
    })),
  setBrokerMinBrokerPayoutCents: (minBrokerPayoutCents) =>
    set((state) => ({
      broker: {
        ...state.broker,
        minBrokerPayoutCents,
      },
    })),
  setBrokerMinAiConfidence: (minAiConfidence) =>
    set((state) => ({
      broker: {
        ...state.broker,
        minAiConfidence,
      },
    })),
  setBrokerSort: (desktopSort) =>
    set((state) => ({
      broker: {
        ...state.broker,
        desktopSort,
      },
    })),
  resetBrokerDesktopControls: () =>
    set((state) => ({
      broker: {
        ...state.broker,
        searchQuery: '',
        selectedCities: [],
        desktopFocusFilters: { ...defaultBrokerFocusFilters },
        desktopSort: 'Newest',
        shippingMode: 'all',
        minBrokerPayoutCents: 0,
        minAiConfidence: 0,
      },
    })),
  setSupplierActiveFilter: (activeFilter) =>
    set((state) => ({
      supplier: {
        ...state.supplier,
        activeFilter,
      },
    })),
}));
