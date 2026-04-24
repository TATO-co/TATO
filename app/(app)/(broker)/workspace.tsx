import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, usePathname } from 'expo-router';

import { BrokerFeedPanel } from '@/components/workspace/BrokerFeedPanel';
import type { BrokerDesktopControlEntry } from '@/components/workspace/BrokerDesktopControlsDrawer';
import { ModeShell } from '@/components/layout/ModeShell';
import { NextStep } from '@/components/ui/NextStep';
import { useViewportInfo } from '@/lib/constants';
import { brokerDesktopNav } from '@/lib/navigation';
import { cancelPendingClaimCheckout } from '@/lib/repositories/tato';
import { useWorkspaceUiStore } from '@/lib/stores/workspace-ui';
import {
  buildBrokerDeskRoute,
  getBrokerDeskRouteSignature,
  parseBrokerDeskRouteState,
} from '@/lib/workspace/broker-desk-route';

export default function WorkspaceScreen() {
  const { isPhone } = useViewportInfo();
  const pathname = usePathname();
  const params = useLocalSearchParams<{
    claim_checkout?: string;
    claim_payment?: string;
    desk_city?: string;
    desk_focus?: string;
    desk_q?: string;
    desk_sort?: string;
    transaction_id?: string;
  }>();
  const [desktopControlsOpen, setDesktopControlsOpen] = useState(false);
  const [desktopControlsEntry, setDesktopControlsEntry] = useState<BrokerDesktopControlEntry>('filters');
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);
  const hydratingDeskRouteRef = useRef(false);
  const lastObservedRouteSignatureRef = useRef<string | null>(null);
  const processedReturnRef = useRef<string | null>(null);
  const syncedDeskRouteSignatureRef = useRef<string | null>(null);
  const phoneControlsRef = useRef<{ open: (mode: 'search' | 'filters') => void } | null>(null);
  const brokerSearchQuery = useWorkspaceUiStore((state) => state.broker.searchQuery);
  const brokerSelectedCities = useWorkspaceUiStore((state) => state.broker.selectedCities);
  const brokerDesktopFocusFilters = useWorkspaceUiStore((state) => state.broker.desktopFocusFilters);
  const brokerDesktopSort = useWorkspaceUiStore((state) => state.broker.desktopSort);
  const replaceBrokerRouteState = useWorkspaceUiStore((state) => state.replaceBrokerRouteState);
  const brokerDeskRouteState = useMemo(
    () => parseBrokerDeskRouteState(params),
    [params.desk_city, params.desk_focus, params.desk_q, params.desk_sort],
  );
  const liveBrokerDeskState = useMemo(
    () => ({
      desktopFocusFilters: brokerDesktopFocusFilters,
      desktopSort: brokerDesktopSort,
      searchQuery: brokerSearchQuery,
      selectedCities: brokerSelectedCities,
    }),
    [brokerDesktopFocusFilters, brokerDesktopSort, brokerSearchQuery, brokerSelectedCities],
  );
  const liveBrokerDeskSignature = useMemo(
    () => getBrokerDeskRouteSignature(liveBrokerDeskState),
    [liveBrokerDeskState],
  );
  const routeBrokerDeskSignature = useMemo(
    () => getBrokerDeskRouteSignature(brokerDeskRouteState),
    [brokerDeskRouteState],
  );

  useEffect(() => {
    const checkoutState = typeof params.claim_checkout === 'string'
      ? params.claim_checkout
      : typeof params.claim_payment === 'string'
        ? params.claim_payment
        : null;
    const transactionId = typeof params.transaction_id === 'string' ? params.transaction_id : null;

    if (!checkoutState) {
      return;
    }

    const signature = `${checkoutState}:${transactionId ?? 'none'}`;
    if (processedReturnRef.current === signature) {
      return;
    }

    processedReturnRef.current = signature;

    if (checkoutState === 'success') {
      setCheckoutNotice('Claim deposit paid. Your claim is syncing into the desk now.');
      return;
    }

    if (checkoutState === 'cancel' && transactionId) {
      setCheckoutNotice('Claim payment cancelled. Releasing the item back to the feed...');
      void cancelPendingClaimCheckout(transactionId).then((result) => {
        setCheckoutNotice(
          result.ok
            ? 'Claim payment cancelled. The item is available to claim again.'
            : result.message,
        );
      });
    }
  }, [params.claim_checkout, params.claim_payment, params.transaction_id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const routeChanged = lastObservedRouteSignatureRef.current !== routeBrokerDeskSignature;
    lastObservedRouteSignatureRef.current = routeBrokerDeskSignature;

    if (!routeChanged && syncedDeskRouteSignatureRef.current !== null) {
      return;
    }

    syncedDeskRouteSignatureRef.current = routeBrokerDeskSignature;

    if (liveBrokerDeskSignature !== routeBrokerDeskSignature) {
      hydratingDeskRouteRef.current = true;
      replaceBrokerRouteState(brokerDeskRouteState);
      return;
    }

    hydratingDeskRouteRef.current = false;
  }, [
    brokerDeskRouteState,
    liveBrokerDeskSignature,
    replaceBrokerRouteState,
    routeBrokerDeskSignature,
  ]);

  useEffect(() => {
    if (!hydratingDeskRouteRef.current) {
      return;
    }

    if (liveBrokerDeskSignature === routeBrokerDeskSignature) {
      hydratingDeskRouteRef.current = false;
    }
  }, [liveBrokerDeskSignature, routeBrokerDeskSignature]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (hydratingDeskRouteRef.current) {
      return;
    }

    if (syncedDeskRouteSignatureRef.current === liveBrokerDeskSignature) {
      return;
    }

    const currentSearchParams = new URLSearchParams(window.location.search);
    const nextHref = buildBrokerDeskRoute(pathname, currentSearchParams, liveBrokerDeskState);
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (currentHref !== nextHref) {
      window.history.replaceState(window.history.state, '', nextHref);
    }

    syncedDeskRouteSignatureRef.current = liveBrokerDeskSignature;
  }, [liveBrokerDeskSignature, liveBrokerDeskState, pathname]);

  const openDesktopControls = (entry: BrokerDesktopControlEntry) => {
    setDesktopControlsEntry(entry);
    setDesktopControlsOpen(true);
  };

  return (
    <ModeShell
      actions={
        !isPhone
          ? [
            {
              key: 'search',
              icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
              accessibilityLabel: 'Open broker search drawer',
              onPress: () => openDesktopControls('search'),
            },
            {
              key: 'filters',
              icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
              accessibilityLabel: 'Open broker filters drawer',
              onPress: () => openDesktopControls('filters'),
            },
          ]
          : [
            {
              key: 'search',
              icon: { ios: 'magnifyingglass', android: 'search', web: 'search' },
              accessibilityLabel: 'Open search',
              onPress: () => phoneControlsRef.current?.open('search'),
            },
            {
              key: 'filters',
              icon: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
              accessibilityLabel: 'Open filters',
              onPress: () => phoneControlsRef.current?.open('filters'),
            },
          ]
      }
      avatarEmoji="🧑"
      desktopNavActiveKey="explore"
      desktopNavItems={brokerDesktopNav}
      modeLabel="Broker Mode"
      title="The Hunt">
      {checkoutNotice && (params.claim_checkout === 'success' || params.claim_payment === 'success') ? (
        <View className="mb-4">
          <NextStep
            description="The supplier can see the claim status. Create the resale listing from your claim desk to start selling."
            headline="You've claimed this item."
            primaryAction={{ label: 'Create Listing', href: '/(app)/(broker)/claims' }}
            secondaryAction={{ label: 'Keep Browsing', onPress: () => setCheckoutNotice(null), tone: 'secondary' }}
            testID="claim-checkout-next-step"
          />
        </View>
      ) : checkoutNotice ? (
        <View className="mb-4 rounded-[18px] border border-tato-accent/30 bg-[#102443] px-4 py-3">
          <Text className="text-sm text-tato-text">{checkoutNotice}</Text>
        </View>
      ) : null}
      <BrokerFeedPanel
        desktopControlsEntry={desktopControlsEntry}
        desktopControlsOpen={desktopControlsOpen}
        onCloseDesktopControls={() => setDesktopControlsOpen(false)}
        onOpenDesktopControls={openDesktopControls}
        phoneControlsRef={phoneControlsRef}
      />
    </ModeShell>
  );
}
