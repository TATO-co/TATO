/**
 * Centralized selector map for TATO mobile UI elements.
 *
 * React Native exposes `testID` differently by platform:
 * - Android: bare `resource-id`, queried through UiSelector.
 * - iOS: accessibility id, queried with Appium's `~` strategy.
 */

const ids = {
  // Welcome screen
  welcomeBrandMark: 'welcome-brand-mark',
  welcomeSignInButton: 'welcome-sign-in-button',
  welcomeEnterCta: 'welcome-enter-cta',
  welcomeSupportButton: 'welcome-support-button',
  welcomeRoleSupplier: 'welcome-role-supplier',
  welcomeRoleBroker: 'welcome-role-broker',
  welcomeHeading: 'welcome-heading',
  welcomeSubheading: 'welcome-subheading',
  welcomeSignalListings: 'welcome-signal-listings',
  welcomeSignalClaims: 'welcome-signal-claims',
  welcomeSignalPayout: 'welcome-signal-payout',

  // Sign-in screen
  signinBackButton: 'signin-back-button',
  signinRouteTag: 'signin-route-tag',

  // Auth access card
  authEmailInput: 'auth-email-input',
  authCodeInput: 'auth-code-input',
  authPrimaryAction: 'auth-primary-action',
  authEditEmail: 'auth-edit-email',
  authStepEmail: 'auth-step-1',
  authStepCode: 'auth-step-2',
  authError: 'auth-error-message',
  authDevToolsToggle: 'auth-dev-tools-toggle',
  authDevBypassButton: 'auth-dev-bypass-button',
  authConfigWarning: 'auth-config-warning',

  // ModeShell
  modeShellHeader: 'mode-shell-header',
  modeShellTitle: 'mode-shell-title',
  modeShellModeLabel: 'mode-shell-mode-label',
  modeShellAvatar: 'mode-shell-avatar',

  // Tab bar
  tabExplore: 'tab-explore',
  tabClaims: 'tab-claims',
  tabWallet: 'tab-wallet',
  tabProfile: 'tab-profile',
  tabHome: 'tab-home',
  tabStock: 'tab-stock',
  tabIntake: 'tab-intake',
  tabStats: 'tab-stats',
  tabMe: 'tab-me',

  // Profile mode switching
  profileSwitchBroker: 'profile-switch-broker',
  profileSwitchSupplier: 'profile-switch-supplier',

  // Broker feed
  brokerFeedLoading: 'broker-feed-loading',
  brokerFeedEmpty: 'broker-feed-empty',
  brokerFeedError: 'broker-feed-error',
  brokerOpenControls: 'broker-open-controls',
  brokerPendingCheckouts: 'broker-pending-checkouts',

  // Swipe claim card
  swipeCardPrefix: 'swipe-card-',
  swipeClaimButtonPrefix: 'swipe-claim-',

  // Grid card
  gridCardPrefix: 'broker-card-',
  gridClaimButtonPrefix: 'broker-claim-',

  // Phone controls sheet
  phoneControlsSheet: 'broker-phone-controls',
  phoneControlsClose: 'broker-phone-controls-close',
  phoneControlsSearch: 'broker-phone-controls-search',

  // Feed state
  feedStateContainer: 'feed-state-container',
  feedStateRetry: 'feed-state-retry',

  // Status filter bar
  filterAll: 'status-filter-all',
  filterAvailable: 'status-filter-available',
  filterClaimed: 'status-filter-claimed',
  filterPending: 'status-filter-pending',

  // Screen header
  screenHeaderBack: 'screen-header-back',
  screenHeaderTitle: 'screen-header-title',

  // Claims screen
  claimItemPrefix: 'claim-item-',
  claimDetailImage: 'claim-detail-image',
  claimGenerateListing: 'claim-generate-listing',
  claimSaveListing: 'claim-save-listing',
  claimBuyerCommitted: 'claim-buyer-committed',
  claimAwaitingPickup: 'claim-awaiting-pickup',

  // Wallet screen
  walletBalance: 'wallet-balance',
  walletRefresh: 'wallet-refresh',
  walletManageStripe: 'wallet-manage-stripe',
  walletEntryPrefix: 'wallet-entry-',

  // Supplier intake
  intakePhotoUpload: 'intake-photo-upload',
  intakeCameraCapture: 'intake-camera-capture',
  intakeLiveIntake: 'intake-live-intake',

  // Skeleton loading states
  skeletonCard: 'skeleton-card',
  skeletonRow: 'skeleton-row',

  // Supplier inventory
  supplierInventoryHeader: 'supplier-inventory-header',
  supplierInventoryStats: 'supplier-inventory-stats',
  supplierInventoryList: 'supplier-inventory-list',
  supplierItemCardPrefix: 'supplier-item-card-',
  supplierQueueSnapshotPanel: 'supplier-queue-snapshot-panel',
  supplierLiveIntakeButton: 'supplier-live-intake-button',
  supplierOpenInventoryButton: 'supplier-open-inventory-button',
  supplierInventoryManagementPanel: 'supplier-inventory-management-panel',
  supplierRefreshQueueButton: 'supplier-refresh-queue-button',
  supplierOpenIntakeButton: 'supplier-open-intake-button',

  // KPI cards
  kpiCardPrefix: 'kpi-card-',

  // Glass panel
  glassPanelPrefix: 'glass-panel-',

  // Staggered reveal
  staggeredRevealPrefix: 'stagger-',

  // Phone chrome
  phonePanelPrefix: 'phone-panel-',
  phoneEyebrowPrefix: 'phone-eyebrow-',

  // Feed state containers
  feedStateLoading: 'feed-state-loading',
  feedStateError: 'feed-state-error',
  feedStateEmpty: 'feed-state-empty',
} as const;

function isAndroidRuntime() {
  return typeof driver !== 'undefined' && driver.isAndroid;
}

function byTestId(testId: string) {
  return isAndroidRuntime()
    ? `android=new UiSelector().resourceId("${testId}")`
    : `~${testId}`;
}

function escapeUiSelectorRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const sel = new Proxy(ids, {
  get(target, property: string | symbol) {
    if (typeof property !== 'string' || !(property in target)) {
      return undefined;
    }

    return byTestId(target[property as keyof typeof ids]);
  },
}) as typeof ids;

/**
 * Build a dynamic selector for elements with id-based testIDs.
 */
export function selById(prefix: string, id: string) {
  const rawPrefix = prefix.startsWith('~') ? prefix.slice(1) : prefix;
  return byTestId(`${rawPrefix}${id}`);
}

/**
 * Build a selector for dynamic IDs where the full suffix is data-driven.
 */
export function selByIdPrefix(prefix: string) {
  const rawPrefix = prefix.startsWith('~') ? prefix.slice(1) : prefix;
  return isAndroidRuntime()
    ? `android=new UiSelector().resourceIdMatches(".*${escapeUiSelectorRegex(rawPrefix)}.*")`
    : `-ios predicate string:name BEGINSWITH "${rawPrefix}" OR label BEGINSWITH "${rawPrefix}"`;
}
