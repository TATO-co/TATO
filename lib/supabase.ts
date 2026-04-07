import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants, { AppOwnership } from 'expo-constants';
import { Platform } from 'react-native';

import { createMemoryAuthStorage, createResilientAuthStorage } from '@/lib/authStorage';
import { runtimeConfig } from '@/lib/config';

export const isSupabaseConfigured = Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);

function createNativeAuthStorage() {
  // Expo Go stores app data in a shared experience-scoped directory. If that
  // directory gets corrupted on a simulator, AsyncStorage starts throwing
  // during Supabase auth refresh. Prefer in-memory auth storage in Expo Go and
  // keep persistent native storage for development/production builds.
  if (Constants.appOwnership === AppOwnership.Expo || Constants.expoGoConfig != null) {
    return createMemoryAuthStorage();
  }

  return createResilientAuthStorage({
    primary: AsyncStorage,
    label: 'supabase-auth',
  });
}

const nativeAuthStorage = Platform.OS === 'web' ? undefined : createNativeAuthStorage();

export const supabase =
  isSupabaseConfigured && runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey
    ? createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: Platform.OS === 'web',
          storage: nativeAuthStorage,
        },
      })
    : null;
