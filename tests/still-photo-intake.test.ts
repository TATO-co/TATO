import { describe, expect, it } from 'vitest';

import {
  MAX_STILL_PHOTO_SET_SIZE,
  createStillPhotoAsset,
  getStillPhotoSuccessRoute,
  getStillPhotoSubmitState,
  mergeStillPhotoAssets,
  removeStillPhotoAsset,
  resolveStillPhotoEntryMode,
  resolveStillPhotoSelection,
} from '@/lib/stillPhotoIntake';

function createPhoto(uri: string) {
  return createStillPhotoAsset({ uri, mimeType: 'image/jpeg' });
}

describe('still-photo intake helpers', () => {
  it('normalizes web entry into upload mode', () => {
    expect(resolveStillPhotoEntryMode({ entry: 'camera', platform: 'web' })).toBe('upload');
    expect(resolveStillPhotoEntryMode({ entry: 'upload', platform: 'ios' })).toBe('upload');
    expect(resolveStillPhotoEntryMode({ entry: undefined, platform: 'android' })).toBe('camera');
  });

  it('caps the photo set at the configured limit', () => {
    const current = Array.from({ length: MAX_STILL_PHOTO_SET_SIZE - 1 }, (_, index) => createPhoto(`file:///current-${index}.jpg`));
    const incoming = [createPhoto('file:///incoming-a.jpg'), createPhoto('file:///incoming-b.jpg')];

    const merged = mergeStillPhotoAssets({
      current,
      incoming,
    });

    expect(merged.photos).toHaveLength(MAX_STILL_PHOTO_SET_SIZE);
    expect(merged.overflowCount).toBe(1);
    expect(merged.photos.at(-1)?.uri).toBe('file:///incoming-a.jpg');
  });

  it('reselects the nearest photo when the selected photo is removed', () => {
    const first = createPhoto('file:///one.jpg');
    const second = createPhoto('file:///two.jpg');
    const third = createPhoto('file:///three.jpg');

    const removedMiddle = removeStillPhotoAsset({
      photos: [first, second, third],
      photoId: second.id,
      selectedPhotoId: second.id,
    });

    expect(removedMiddle.photos.map((photo) => photo.id)).toEqual([first.id, third.id]);
    expect(removedMiddle.selectedPhotoId).toBe(third.id);

    const removedLast = removeStillPhotoAsset({
      photos: [first, third],
      photoId: third.id,
      selectedPhotoId: third.id,
    });

    expect(removedLast.selectedPhotoId).toBe(first.id);
  });

  it('preserves an existing selection when a different photo is removed', () => {
    const first = createPhoto('file:///one.jpg');
    const second = createPhoto('file:///two.jpg');

    const next = removeStillPhotoAsset({
      photos: [first, second],
      photoId: first.id,
      selectedPhotoId: second.id,
    });

    expect(next.selectedPhotoId).toBe(second.id);
    expect(resolveStillPhotoSelection({
      photos: next.photos,
      preferredId: second.id,
    })).toBe(second.id);
  });

  it('locks submission while empty, running, or navigating away', () => {
    expect(getStillPhotoSubmitState({ photoCount: 0, running: false, completedItemId: null })).toEqual({
      disabled: true,
      label: 'Add Photos To Continue',
    });

    expect(getStillPhotoSubmitState({ photoCount: 2, running: true, completedItemId: null })).toEqual({
      disabled: true,
      label: 'Analyzing Photos...',
    });

    expect(getStillPhotoSubmitState({ photoCount: 2, running: false, completedItemId: 'item-123' })).toEqual({
      disabled: true,
      label: 'Opening Draft...',
    });

    expect(getStillPhotoSubmitState({ photoCount: 2, running: false, completedItemId: null })).toEqual({
      disabled: false,
      label: 'Analyze & Open Draft',
    });
  });

  it('builds the success route for the created item', () => {
    expect(getStillPhotoSuccessRoute('item-123')).toBe('/(app)/item/item-123');
  });
});
