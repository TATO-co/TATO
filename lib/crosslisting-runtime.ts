import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { CrosslistingDraft, UniversalListingKit } from '@/lib/crosslisting';

const KIT_STORAGE_PREFIX = 'tato.crosslisting.kit.';
const LISTING_KIT_NOTIFICATION_CATEGORY = 'TATO_LISTING_KIT';

function kitStorageKey(claimId: string) {
  return `${KIT_STORAGE_PREFIX}${claimId}`;
}

function photoFileExtension(uri: string, index: number) {
  const match = uri.match(/\.([a-z0-9]{3,5})(?:[?#].*)?$/i);
  const ext = match?.[1]?.toLowerCase();
  if (ext && ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }

  return index === 0 ? 'jpg' : 'jpg';
}

export async function readStoredUniversalKit(claimId: string): Promise<UniversalListingKit | null> {
  const raw = await AsyncStorage.getItem(kitStorageKey(claimId));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as UniversalListingKit;
  } catch {
    await AsyncStorage.removeItem(kitStorageKey(claimId));
    return null;
  }
}

export async function storeUniversalListingKit(kit: UniversalListingKit) {
  await AsyncStorage.setItem(kitStorageKey(kit.claimId), JSON.stringify(kit));
}

export async function copyTextToClipboard(text: string) {
  const webClipboard = typeof globalThis.navigator === 'object'
    ? globalThis.navigator.clipboard
    : null;

  if (webClipboard?.writeText) {
    await webClipboard.writeText(text);
    return true;
  }

  try {
    const Clipboard = await import('expo-clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

export async function prepareListingKitPhotos(args: {
  claimId: string;
  photoUrls: string[];
}): Promise<{
  status: UniversalListingKit['photoStatus'];
  savedCount: number;
  message: string;
}> {
  if (Platform.OS === 'web') {
    return {
      status: 'skipped',
      savedCount: 0,
      message: 'Photo saving is available on iOS and Android.',
    };
  }

  if (!args.photoUrls.length) {
    return {
      status: 'skipped',
      savedCount: 0,
      message: 'No item photos were available to save.',
    };
  }

  try {
    const [MediaLibrary, FileSystem] = await Promise.all([
      import('expo-media-library'),
      import('expo-file-system/legacy'),
    ]);
    const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!permission.granted) {
      return {
        status: 'failed',
        savedCount: 0,
        message: 'Photo library permission is required to save listing photos.',
      };
    }

    let savedCount = 0;
    const cacheDirectory = FileSystem.cacheDirectory;
    if (!cacheDirectory) {
      return {
        status: 'failed',
        savedCount: 0,
        message: 'Unable to access the photo staging folder on this device.',
      };
    }

    for (const [index, uri] of args.photoUrls.entries()) {
      try {
        const localUri = uri.startsWith('file://')
          ? uri
          : `${cacheDirectory}tato-listing-${args.claimId}-${index}.${photoFileExtension(uri, index)}`;
        const savedUri = uri.startsWith('file://')
          ? localUri
          : (await FileSystem.downloadAsync(uri, localUri)).uri;

        await MediaLibrary.saveToLibraryAsync(savedUri);
        savedCount += 1;
      } catch {
        // Keep preparing the rest of the kit if one image fails.
      }
    }

    return {
      status: savedCount === args.photoUrls.length ? 'saved' : savedCount > 0 ? 'partial' : 'failed',
      savedCount,
      message: savedCount === args.photoUrls.length
        ? `${savedCount} photos saved to the camera roll.`
        : savedCount > 0
          ? `${savedCount} of ${args.photoUrls.length} photos saved to the camera roll.`
          : 'Unable to save listing photos to the camera roll.',
    };
  } catch {
    return {
      status: 'failed',
      savedCount: 0,
      message: 'Unable to prepare listing photos on this device.',
    };
  }
}

export async function registerListingKitNotificationActions() {
  if (Platform.OS === 'web') {
    return () => undefined;
  }

  try {
    const [Notifications, Clipboard] = await Promise.all([
      import('expo-notifications'),
      import('expo-clipboard'),
    ]);

    await Notifications.setNotificationCategoryAsync(
      LISTING_KIT_NOTIFICATION_CATEGORY,
      [
        {
          identifier: 'COPY_TITLE',
          buttonTitle: 'Copy Title',
          options: { opensAppToForeground: false },
        },
        {
          identifier: 'COPY_DESCRIPTION',
          buttonTitle: 'Copy Description',
          options: { opensAppToForeground: false },
        },
      ],
    );

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const action = response.actionIdentifier;
      const data = response.notification.request.content.data as {
        title?: string;
        description?: string;
      };

      if (action === 'COPY_TITLE' && data.title) {
        void Clipboard.setStringAsync(data.title);
      }

      if (action === 'COPY_DESCRIPTION' && data.description) {
        void Clipboard.setStringAsync(data.description);
      }
    });

    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

export async function scheduleListingKitNotification(args: {
  draft: CrosslistingDraft;
  floorPriceLabel?: string | null;
}) {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const Notifications = await import('expo-notifications');
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return null;
    }

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: `TATO - ${args.draft.shortLabel} Kit`,
        body: [
          args.draft.priceLabel ? `Price: ${args.draft.priceLabel}` : null,
          args.floorPriceLabel ? `Floor: ${args.floorPriceLabel}` : null,
          `${args.draft.photoCount} photos ready`,
        ].filter(Boolean).join('  ·  '),
        categoryIdentifier: LISTING_KIT_NOTIFICATION_CATEGORY,
        data: {
          title: args.draft.title,
          description: args.draft.description,
        },
        sticky: true,
      },
      trigger: null,
    });
  } catch {
    return null;
  }
}

export async function dismissListingKitNotification(identifier: string | null | undefined) {
  if (!identifier || Platform.OS === 'web') {
    return;
  }

  try {
    const Notifications = await import('expo-notifications');
    await Notifications.dismissNotificationAsync(identifier);
  } catch {
    // Dismissing the helper notification should never block the broker workflow.
  }
}
