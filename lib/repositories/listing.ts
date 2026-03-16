import { createRequestKey } from '@/lib/models';
import { supabase } from '@/lib/supabase';

export type ListingAiResult = {
  claimId: string;
  itemId: string;
  listingTitle: string;
  listingDescription: string;
  platformVariants: Record<string, { title: string; description: string }>;
};

export async function generateBrokerListing(claimId: string): Promise<ListingAiResult> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const requestKey = createRequestKey('listing');
  const { data, error } = await supabase.functions.invoke('generate-broker-listing', {
    body: { claimId, requestKey },
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to generate listing.');
  }

  const response = data as Record<string, unknown>;
  if (response.ok === false) {
    throw new Error((response.message as string) ?? 'Failed to generate listing.');
  }

  return {
    claimId: response.claimId as string,
    itemId: response.itemId as string,
    listingTitle: (response.listingTitle as string) ?? '',
    listingDescription: (response.listingDescription as string) ?? '',
    platformVariants: (response.platformVariants as Record<string, { title: string; description: string }>) ?? {},
  };
}
