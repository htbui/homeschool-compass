/**
 * Content licenses for curricula made in Studio.
 *
 * A curriculum keeps the license of what it was made from: an adaptation of
 * a CC BY-NC-SA course is itself CC BY-NC-SA, credits the original, and can
 * only be listed for free. Conversions of books a family owns stay private.
 */

export type LicenseKind =
  | 'all_rights_reserved'
  | 'cc0'
  | 'public_domain'
  | 'cc_by'
  | 'cc_by_sa'
  | 'cc_by_nc'
  | 'cc_by_nc_sa'
  | 'cc_by_nd'
  | 'cc_by_nc_nd'
  | 'unknown';

export interface License {
  kind: LicenseKind;
  /** "4.0" for Creative Commons licenses. */
  version?: string;
  /** The license deed. */
  url?: string;
  /** Who holds the copyright ("© Fernwood Press"). */
  holder?: string;
}

interface Info {
  label: string;
  short: string;
  /** Others may adapt it and share the adaptation. */
  adapt: boolean;
  /** Adaptations may be sold. */
  commercial: boolean;
  shareAlike: boolean;
  attribution: boolean;
}

export const LICENSE_INFO: Record<LicenseKind, Info> = {
  all_rights_reserved: { label: 'All rights reserved', short: '©', adapt: false, commercial: false, shareAlike: false, attribution: true },
  cc0: { label: 'CC0 (no rights reserved)', short: 'CC0', adapt: true, commercial: true, shareAlike: false, attribution: false },
  public_domain: { label: 'Public domain', short: 'Public domain', adapt: true, commercial: true, shareAlike: false, attribution: false },
  cc_by: { label: 'Creative Commons Attribution', short: 'CC BY', adapt: true, commercial: true, shareAlike: false, attribution: true },
  cc_by_sa: { label: 'Creative Commons Attribution-ShareAlike', short: 'CC BY-SA', adapt: true, commercial: true, shareAlike: true, attribution: true },
  cc_by_nc: { label: 'Creative Commons Attribution-NonCommercial', short: 'CC BY-NC', adapt: true, commercial: false, shareAlike: false, attribution: true },
  cc_by_nc_sa: { label: 'Creative Commons Attribution-NonCommercial-ShareAlike', short: 'CC BY-NC-SA', adapt: true, commercial: false, shareAlike: true, attribution: true },
  cc_by_nd: { label: 'Creative Commons Attribution-NoDerivatives', short: 'CC BY-ND', adapt: false, commercial: true, shareAlike: false, attribution: true },
  cc_by_nc_nd: { label: 'Creative Commons Attribution-NonCommercial-NoDerivatives', short: 'CC BY-NC-ND', adapt: false, commercial: false, shareAlike: false, attribution: true },
  unknown: { label: 'License not identified', short: 'Unknown license', adapt: false, commercial: false, shareAlike: false, attribution: true },
};

/** Licenses a creator can pick for their own original work. */
export const ORIGINAL_LICENSES: LicenseKind[] = ['all_rights_reserved', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa', 'cc_by_nd', 'cc_by_nc_nd', 'cc0'];
/** Licenses a creator can say an online source uses, when it couldn't be detected. */
export const SOURCE_LICENSES: LicenseKind[] = ['cc_by', 'cc_by_sa', 'cc_by_nc', 'cc_by_nc_sa', 'cc_by_nd', 'cc_by_nc_nd', 'cc0', 'public_domain', 'all_rights_reserved'];

const CC_SLUG: Record<string, LicenseKind> = { by: 'cc_by', 'by-sa': 'cc_by_sa', 'by-nc': 'cc_by_nc', 'by-nc-sa': 'cc_by_nc_sa', 'by-nd': 'cc_by_nd', 'by-nc-nd': 'cc_by_nc_nd' };

export function licenseUrl(l: License): string | undefined {
  if (l.url) return l.url;
  const slug = Object.entries(CC_SLUG).find(([, k]) => k === l.kind)?.[0];
  if (slug) return `https://creativecommons.org/licenses/${slug}/${l.version ?? '4.0'}/`;
  if (l.kind === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return undefined;
}

export function licenseName(l: License): string {
  const info = LICENSE_INFO[l.kind];
  return l.version && l.kind.startsWith('cc_by') ? `${info.short} ${l.version}` : info.short;
}

/**
 * Find a license statement in a web page: Creative Commons links (the usual
 * badge or rel="license"), or a written "licensed under a Creative Commons
 * Attribution-NonCommercial…" sentence. Returns undefined when there's none.
 */
export function detectLicense(html: string): License | undefined {
  const link = html.match(/creativecommons\.org\/licenses\/(by(?:-nc)?(?:-sa|-nd)?)\/(\d\.\d)/i);
  if (link) {
    const kind = CC_SLUG[link[1].toLowerCase()];
    if (kind) return { kind, version: link[2], url: `https://creativecommons.org/licenses/${link[1].toLowerCase()}/${link[2]}/` };
  }
  if (/creativecommons\.org\/publicdomain\/zero\//i.test(html)) return { kind: 'cc0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
  if (/creativecommons\.org\/publicdomain\/mark\//i.test(html)) return { kind: 'public_domain', url: 'https://creativecommons.org/publicdomain/mark/1.0/' };

  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const written = text.match(/Creative Commons\s+(Attribution(?:[\s-]+(?:Non-?Commercial|Share-?Alike|No-?Derivatives|No-?Derivs))*)(?:\s+(\d\.\d))?/i);
  if (written) {
    const w = written[1].toLowerCase().replace(/[\s-]/g, '');
    const nc = w.includes('noncommercial');
    const sa = w.includes('sharealike');
    const nd = w.includes('noderiv');
    const slug = `by${nc ? '-nc' : ''}${sa ? '-sa' : nd ? '-nd' : ''}`;
    const kind = CC_SLUG[slug];
    if (kind) return { kind, version: written[2] };
  }
  return undefined;
}
