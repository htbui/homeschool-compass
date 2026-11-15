import type { Curriculum, ID } from '@/lib/types';
import type { PackageContent } from '@/lib/market';
import { coopKey } from '@/lib/coop';
import { attributionFor, type CurriculumPackage } from '@/lib/package';
import { sameOutline } from '@/lib/planUpdate';
import { useAccount } from '@/store/useAccount';
import { useMarket } from '@/store/useMarket';
import { useStore } from '@/store/useStore';

import { supabase } from './cloud';
import { classContent, myClasses } from './coopApi';
import { packageContent } from './studioApi';

/**
 * Newer versions of the lesson-by-lesson plans a family has scheduled: a
 * creator's new Marketplace release, a co-op teacher's new version, or the
 * family's own Studio edits that aren't in the plan yet.
 */

export interface PlanUpdateInfo {
  key: string;
  source: 'studio' | 'release';
  version?: number;
  /** Ready for Studio edits; releases are loaded when the family opens the update. */
  content?: PackageContent;
}

const own = (c: Curriculum, packages: CurriculumPackage[]) => (c.packageId ? packages.find((p) => p.id === c.packageId) : undefined);

/** The family's own Studio plans whose lessons changed since they were scheduled. */
export function studioUpdates(curricula: Curriculum[], packages: CurriculumPackage[], creatorName?: string): Record<ID, PlanUpdateInfo> {
  const out: Record<ID, PlanUpdateInfo> = {};
  for (const c of curricula) {
    // A co-op class plan follows the class's versions, even on the teacher's own device.
    const pkg = c.coopClassId ? undefined : own(c, packages);
    if (!pkg?.units.some((u) => u.lessons.length) || c.skippedUpdate === pkg.updatedAt) continue;
    if (sameOutline(c.outline, pkg.units) && c.license?.kind === pkg.license.kind) continue;
    out[c.id] = { key: pkg.updatedAt, source: 'studio', content: { units: pkg.units, version: pkg.version, license: pkg.license, attribution: attributionFor(pkg, creatorName) } };
  }
  return out;
}

/** Marketplace (and co-op class) plans with a newer release than the one scheduled. Class versions are keyed by coopKey(). */
export function releaseUpdates(curricula: Curriculum[], packages: CurriculumPackage[], versions: Record<ID, number>): Record<ID, PlanUpdateInfo> {
  const out: Record<ID, PlanUpdateInfo> = {};
  for (const c of curricula) {
    const v = c.coopClassId ? versions[coopKey(c.coopClassId)] : c.listingId ? versions[c.listingId] : undefined;
    if (!v || (!c.coopClassId && own(c, packages)) || v <= (c.packageVersion ?? 0) || c.skippedUpdate === String(v)) continue;
    out[c.id] = { key: String(v), source: 'release', version: v };
  }
  return out;
}

/** Latest release number per listing, for the plans that came from the Marketplace. */
export async function releaseVersions(curricula: Curriculum[], _account?: string): Promise<Record<ID, number>> {
  const coop = curricula.some((c) => c.coopClassId) ? Object.fromEntries((await myClasses().catch(() => [])).map((m) => [coopKey(m.classId), m.version])) : {};
  const listings = await listingVersions(curricula.filter((c) => !c.coopClassId));
  return { ...listings, ...coop };
}

async function listingVersions(curricula: Curriculum[]): Promise<Record<ID, number>> {
  const ids = [...new Set(curricula.filter((c) => c.packageId && c.listingId).map((c) => c.listingId!))];
  if (!ids.length) return {};
  if (supabase && useAccount.getState().userId) {
    const { data, error } = await supabase.from('listings').select('id, package_version').in('id', ids);
    if (error) return {};
    return Object.fromEntries((data as { id: string; package_version: number | null }[]).filter((r) => r.package_version).map((r) => [r.id, r.package_version!]));
  }
  const known = [...useStore.getState().myListings, ...useMarket.getState().listings];
  return Object.fromEntries(ids.flatMap((id) => {
    const v = known.find((l) => l.id === id)?.packageVersion;
    return v ? [[id, v]] : [];
  }));
}

/** The newest release of a Marketplace plan. */
export async function loadRelease(c: Curriculum): Promise<PackageContent | undefined> {
  if (c.coopClassId) return classContent(c.coopClassId);
  if (!c.listingId || !c.packageId) return undefined;
  const sample = useMarket.getState().listings.find((l) => l.id === c.listingId)?.sample;
  return packageContent({ id: c.listingId, packageId: c.packageId, sample });
}
