import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { runtimeConfig } from '@/lib/config';

export const isSupabaseConfigured = Boolean(runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey);

export const supabase =
  isSupabaseConfigured && runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey
    ? createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        },
      })
    : null;
