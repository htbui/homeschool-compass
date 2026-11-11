import * as DocumentPicker from 'expo-document-picker';

import { uid } from '@/lib/id';
import type { LessonMaterial } from '@/lib/types';

import { useAccount } from '@/store/useAccount';
import { mediaUrl, uploadFamilyFile } from './sync';

/**
 * Lesson materials (web). Links open in a new tab. Files go straight to the
 * family's private cloud storage when signed in; otherwise small ones are
 * kept in the browser (its storage is only a few MB).
 */

export const MAX_FILE_MB = 10;
const MAX_LOCAL_MB = 1;

export type PickResult = { material: LessonMaterial } | { error: string } | undefined;

export async function pickMaterialFile(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], base64: false });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) return undefined;
  const size = asset.size ?? asset.file?.size ?? 0;
  if (size > MAX_FILE_MB * 1024 * 1024) return { error: `That file is over ${MAX_FILE_MB} MB. Add a link to it instead, or split the PDF.` };
  const id = uid('m');
  const base = { id, label: asset.name.replace(/\.[^.]+$/, ''), fileName: asset.name, mimeType: asset.mimeType ?? asset.file?.type };
  if (useAccount.getState().familyId) {
    const remotePath = await uploadFamilyFile(`materials/${id}`, asset.uri, base.mimeType);
    if (!remotePath) return { error: 'Couldn’t upload that file. Check your connection and try again.' };
    return { material: { ...base, remotePath } };
  }
  if (size > MAX_LOCAL_MB * 1024 * 1024) {
    return { error: `Files over ${MAX_LOCAL_MB} MB need a Freerange account (they're kept in your family's private cloud). Sign in under Settings → Account, or add a link instead.` };
  }
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const uri = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return { material: { ...base, uri } };
}

/**
 * Opens a material in a new tab. The tab is opened before anything async so
 * pop-up blockers treat it as part of the click.
 */
export async function openMaterial(m: LessonMaterial): Promise<string | undefined> {
  if (m.url) {
    window.open(m.url, '_blank', 'noopener');
    return undefined;
  }
  const tab = window.open('', '_blank');
  if (!tab) return 'Your browser blocked the new tab. Allow pop-ups for Freerange and try again.';
  tab.opener = null;
  try {
    let href: string | undefined;
    if (m.uri) href = URL.createObjectURL(await (await fetch(m.uri)).blob());
    else if (m.remotePath) href = await mediaUrl(m.remotePath);
    if (!href) {
      tab.close();
      return m.remotePath ? 'Couldn’t reach Freerange to fetch this file. Check your connection.' : 'This file was added on another device. Sign in on both devices to share it with the family.';
    }
    tab.location.href = href;
    return undefined;
  } catch {
    tab.close();
    return 'Couldn’t open that file.';
  }
}

export async function deleteMaterialFile(_m: LessonMaterial): Promise<void> {}
