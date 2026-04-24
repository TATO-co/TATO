import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function parseStoragePath(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  return {
    bucket: parts[0],
    objectPath: parts.slice(1).join('/'),
  };
}

export async function createSignedStorageUrl(
  admin: SupabaseClient,
  path: string | null | undefined,
  expiresInSeconds = 60 * 60,
) {
  const parsed = parseStoragePath(path);
  if (!parsed) {
    return null;
  }

  const { data, error } = await admin
    .storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.objectPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}
