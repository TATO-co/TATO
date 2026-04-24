import { Image as ReactNativeImage, type ImageProps as ReactNativeImageProps, type ImageResizeMode } from 'react-native';

type TatoImageProps = Omit<ReactNativeImageProps, 'resizeMode'> & {
  cachePolicy?: 'disk' | 'memory' | 'memory-disk' | null;
  contentFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  transition?: number | null;
};

function getResizeMode(contentFit?: TatoImageProps['contentFit']): ImageResizeMode {
  switch (contentFit) {
    case 'contain':
      return 'contain';
    case 'fill':
      return 'stretch';
    case 'none':
      return 'center';
    case 'scale-down':
      return 'contain';
    case 'cover':
    default:
      return 'cover';
  }
}

export function Image({ cachePolicy: _cachePolicy, contentFit, transition: _transition, ...props }: TatoImageProps) {
  return <ReactNativeImage {...props} resizeMode={getResizeMode(contentFit)} />;
}
