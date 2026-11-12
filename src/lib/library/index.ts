import type { Listing, PackageContent } from '../market';

import { libraryContent, libraryId, libraryListing, type CatalogEntry, type LibraryEntry } from './build';
import catalog from './catalog.json';
import { LOADERS } from './loaders';

export { LIBRARY_SELLER, libraryId } from './build';

/** Every Library curriculum, ready to show in the Marketplace. */
export function libraryListings(): Listing[] {
  return (catalog as CatalogEntry[]).map(libraryListing);
}

/** A Library curriculum's lessons. They load on demand: the app only bundles the catalog. */
export async function loadLibraryContent(listingId: string): Promise<PackageContent | undefined> {
  const key = (catalog as CatalogEntry[]).find((e) => libraryId(e.key) === listingId)?.key;
  const load = key ? LOADERS[key] : undefined;
  if (!load) return undefined;
  const mod = (await load()) as { default: LibraryEntry };
  return libraryContent(mod.default);
}
