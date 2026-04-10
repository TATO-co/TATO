export const STILL_PHOTO_CAMERA_ROUTE = '/(app)/ingestion?entry=camera' as const;
export const STILL_PHOTO_UPLOAD_ROUTE = '/(app)/ingestion?entry=upload' as const;
export const MAX_STILL_PHOTO_SET_SIZE = 5;

export type StillPhotoEntryMode = 'camera' | 'upload';

export type StillPhotoAsset = {
  id: string;
  uri: string;
  mimeType?: string;
};

export type StillPhotoSubmitState = {
  disabled: boolean;
  label: string;
};

function createStillPhotoAssetId() {
  return `still-photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createStillPhotoAsset(args: {
  uri: string;
  mimeType?: string;
}): StillPhotoAsset {
  return {
    id: createStillPhotoAssetId(),
    uri: args.uri,
    mimeType: args.mimeType,
  };
}

export function resolveStillPhotoEntryMode(args: {
  entry?: string | string[] | null;
  platform: string;
}): StillPhotoEntryMode {
  const requestedEntry = Array.isArray(args.entry) ? args.entry[0] : args.entry;

  if (args.platform === 'web') {
    return 'upload';
  }

  return requestedEntry === 'upload' ? 'upload' : 'camera';
}

export function getStillPhotoRoute(args: {
  platform: string;
  preferred?: StillPhotoEntryMode;
}) {
  if (args.platform === 'web') {
    return STILL_PHOTO_UPLOAD_ROUTE;
  }

  return args.preferred === 'upload' ? STILL_PHOTO_UPLOAD_ROUTE : STILL_PHOTO_CAMERA_ROUTE;
}

export function normalizeStillPhotoFallbackMessage(message: string, platform: string) {
  if (platform !== 'web') {
    return message;
  }

  return message
    .replace(/camera capture/gi, 'photo upload')
    .replace(/photo capture/gi, 'photo upload');
}

export function mergeStillPhotoAssets(args: {
  current: StillPhotoAsset[];
  incoming: StillPhotoAsset[];
  maxPhotos?: number;
}) {
  const maxPhotos = args.maxPhotos ?? MAX_STILL_PHOTO_SET_SIZE;
  const nextPhotos = [...args.current, ...args.incoming].slice(0, maxPhotos);

  return {
    photos: nextPhotos,
    overflowCount: Math.max((args.current.length + args.incoming.length) - maxPhotos, 0),
  };
}

export function resolveStillPhotoSelection(args: {
  photos: StillPhotoAsset[];
  preferredId?: string | null;
}) {
  if (!args.photos.length) {
    return null;
  }

  if (args.preferredId && args.photos.some((photo) => photo.id === args.preferredId)) {
    return args.preferredId;
  }

  return args.photos[0]?.id ?? null;
}

export function removeStillPhotoAsset(args: {
  photos: StillPhotoAsset[];
  photoId: string;
  selectedPhotoId?: string | null;
}) {
  const index = args.photos.findIndex((photo) => photo.id === args.photoId);

  if (index < 0) {
    return {
      photos: args.photos,
      selectedPhotoId: resolveStillPhotoSelection({
        photos: args.photos,
        preferredId: args.selectedPhotoId ?? null,
      }),
    };
  }

  const nextPhotos = args.photos.filter((photo) => photo.id !== args.photoId);
  const preferredId =
    args.selectedPhotoId === args.photoId
      ? nextPhotos[index]?.id ?? nextPhotos[index - 1]?.id ?? null
      : args.selectedPhotoId ?? null;

  return {
    photos: nextPhotos,
    selectedPhotoId: resolveStillPhotoSelection({
      photos: nextPhotos,
      preferredId,
    }),
  };
}

export function getStillPhotoSubmitState(args: {
  photoCount: number;
  running: boolean;
  completedItemId?: string | null;
}): StillPhotoSubmitState {
  if (args.completedItemId) {
    return {
      disabled: true,
      label: 'Opening Draft...',
    };
  }

  if (args.running) {
    return {
      disabled: true,
      label: 'Analyzing Photos...',
    };
  }

  if (args.photoCount <= 0) {
    return {
      disabled: true,
      label: 'Add Photos To Continue',
    };
  }

  return {
    disabled: false,
    label: 'Analyze & Open Draft',
  };
}

export function getStillPhotoSuccessRoute(itemId: string) {
  return `/(app)/item/${itemId}`;
}
