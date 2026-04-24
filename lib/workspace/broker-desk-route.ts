import {
  defaultBrokerFocusFilters,
  type BrokerWorkspaceFocus,
  type BrokerWorkspaceSort,
} from '@/lib/stores/workspace-ui';

type QueryParamValue = string | string[] | undefined;
type BrokerDeskRouteSort = BrokerWorkspaceSort;

const brokerDeskRouteFocusOrder: BrokerWorkspaceFocus[] = ['Nearby', 'Best Payout', 'Electronics', 'Shippable'];
const brokerDeskRouteSortOrder: BrokerDeskRouteSort[] = ['Newest', 'Best Payout', 'Best AI'];

export type BrokerDeskRouteState = {
  desktopFocusFilters: Record<BrokerWorkspaceFocus, boolean>;
  desktopSort: BrokerWorkspaceSort;
  searchQuery: string;
  selectedCities: string[];
};

export const brokerDeskRouteQueryKeys = {
  cities: 'desk_city',
  focus: 'desk_focus',
  search: 'desk_q',
  sort: 'desk_sort',
} as const;

function getSingleParam(value: QueryParamValue) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null;
  }

  return typeof value === 'string' ? value : null;
}

function getUniqueEntries(values: string[]) {
  return Array.from(new Set(values));
}

function parseCsvParam(value: QueryParamValue) {
  const raw = getSingleParam(value);
  if (!raw) {
    return [];
  }

  return getUniqueEntries(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function isKnownSort(value: string): value is BrokerDeskRouteSort {
  return brokerDeskRouteSortOrder.includes(value as BrokerDeskRouteSort);
}

function createFocusFilters(enabledFilters: BrokerWorkspaceFocus[]) {
  return brokerDeskRouteFocusOrder.reduce<Record<BrokerWorkspaceFocus, boolean>>((current, filter) => {
    current[filter] = enabledFilters.includes(filter);
    return current;
  }, {
    Nearby: false,
    'Best Payout': false,
    Electronics: false,
    Shippable: false,
  });
}

function getEnabledFocusFilters(focusFilters: Record<BrokerWorkspaceFocus, boolean>) {
  return brokerDeskRouteFocusOrder.filter((filter) => focusFilters[filter]);
}

function focusMatchesDefault(focusFilters: Record<BrokerWorkspaceFocus, boolean>) {
  return brokerDeskRouteFocusOrder.every((filter) => focusFilters[filter] === defaultBrokerFocusFilters[filter]);
}

function createSearchParams(baseParams: URLSearchParams | Record<string, QueryParamValue>) {
  if (baseParams instanceof URLSearchParams) {
    return new URLSearchParams(baseParams);
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(baseParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') {
          searchParams.append(key, entry);
        }
      }
      continue;
    }

    if (typeof value === 'string') {
      searchParams.set(key, value);
    }
  }

  return searchParams;
}

export function parseBrokerDeskRouteState(params: Record<string, QueryParamValue>): BrokerDeskRouteState {
  const searchQuery = getSingleParam(params[brokerDeskRouteQueryKeys.search])?.trim() ?? '';
  const selectedCities = parseCsvParam(params[brokerDeskRouteQueryKeys.cities]);
  const rawSort = getSingleParam(params[brokerDeskRouteQueryKeys.sort]);
  const desktopSort = rawSort && isKnownSort(rawSort) ? rawSort : 'Newest';
  const rawFocus = getSingleParam(params[brokerDeskRouteQueryKeys.focus]);

  let desktopFocusFilters = { ...defaultBrokerFocusFilters };
  if (rawFocus === 'none') {
    desktopFocusFilters = createFocusFilters([]);
  } else if (rawFocus) {
    const enabledFilters = parseCsvParam(rawFocus)
      .filter((value): value is BrokerWorkspaceFocus => brokerDeskRouteFocusOrder.includes(value as BrokerWorkspaceFocus));
    desktopFocusFilters = createFocusFilters(enabledFilters);
  }

  return {
    desktopFocusFilters,
    desktopSort,
    searchQuery,
    selectedCities,
  };
}

export function getBrokerDeskRouteSignature(state: BrokerDeskRouteState) {
  return JSON.stringify({
    desktopFocusFilters: brokerDeskRouteFocusOrder.map((filter) => [filter, state.desktopFocusFilters[filter]]),
    desktopSort: state.desktopSort,
    searchQuery: state.searchQuery.trim(),
    selectedCities: getUniqueEntries([...state.selectedCities]).sort((left, right) => left.localeCompare(right)),
  });
}

export function buildBrokerDeskRoute(
  pathname: string,
  baseParams: URLSearchParams | Record<string, QueryParamValue>,
  state: BrokerDeskRouteState,
) {
  const searchParams = createSearchParams(baseParams);

  searchParams.delete(brokerDeskRouteQueryKeys.search);
  searchParams.delete(brokerDeskRouteQueryKeys.cities);
  searchParams.delete(brokerDeskRouteQueryKeys.focus);
  searchParams.delete(brokerDeskRouteQueryKeys.sort);

  const trimmedSearchQuery = state.searchQuery.trim();
  if (trimmedSearchQuery) {
    searchParams.set(brokerDeskRouteQueryKeys.search, trimmedSearchQuery);
  }

  if (state.selectedCities.length) {
    searchParams.set(
      brokerDeskRouteQueryKeys.cities,
      getUniqueEntries([...state.selectedCities]).sort((left, right) => left.localeCompare(right)).join(','),
    );
  }

  if (state.desktopSort !== 'Newest') {
    searchParams.set(brokerDeskRouteQueryKeys.sort, state.desktopSort);
  }

  if (!focusMatchesDefault(state.desktopFocusFilters)) {
    const enabledFilters = getEnabledFocusFilters(state.desktopFocusFilters);
    searchParams.set(
      brokerDeskRouteQueryKeys.focus,
      enabledFilters.length ? enabledFilters.join(',') : 'none',
    );
  }

  const queryString = searchParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
