import { uid } from '@/lib/id';

import { supabase } from './cloud';
import { pickPhoto, readForUpload } from './media';

/**
 * Photos of a used curriculum a family sells. On this device they stay as
 * local images; in the live marketplace they're uploaded to the public
 * listing-photos bucket under the family's folder, and the listing stores
 * only the object paths (the server refuses anything else).
 */

const BUCKET = 'listing-photos';

/** Pick one photo from the library (a data URI on web, a file on phones). */
export const pickListingPhoto = () => pickPhoto('library');

/** The address of a stored photo. */
export function listingPhotoUrl(path: string): string {
  if (!supabase || /^(https?:|data:|file:|blob:)/.test(path)) return path;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** The stored path behind a photo address, or undefined for a photo that isn't uploaded yet. */
export function listingPhotoPath(url: string): string | undefined {
  if (!supabase) return undefined;
  const prefix = supabase.storage.from(BUCKET).getPublicUrl('').data.publicUrl;
  if (url.startsWith(prefix)) return decodeURIComponent(url.slice(prefix.length));
  return /^[0-9a-f-]{36}\//.test(url) ? url : undefined;
}

/** Upload any photos that are still on this device; returns the paths to store on the listing, in order. */
export async function uploadListingPhotos(familyId: string, photos: string[]): Promise<string[]> {
  if (!supabase) return photos;
  const paths: string[] = [];
  for (const photo of photos) {
    const have = listingPhotoPath(photo);
    if (have) {
      paths.push(have);
      continue;
    }
    const { body, contentType } = await readForUpload(photo);
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `${familyId}/${uid('ph').replace(/[^A-Za-z0-9_-]/g, '')}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: ext === 'jpg' ? 'image/jpeg' : contentType, upsert: false });
    if (error) throw new Error('A photo didn’t upload. Check your connection and try again.');
    paths.push(path);
  }
  return paths;
}
