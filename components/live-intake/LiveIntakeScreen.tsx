import { Platform } from 'react-native';

const LiveIntakeScreen =
  Platform.OS === 'web'
    ? require('./LiveIntakeScreen.web').default
    : require('./LiveIntakeScreen.native').default;

export default LiveIntakeScreen;
