import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';

import { uid } from '@/lib/id';
import type { LessonMaterial } from '@/lib/types';

import { mediaUrl } from './sync';

/**
 * Lesson materials (native): links open in an in-app browser; PDFs and
 * images are kept in the app's documents folder and opened through the
 * system viewer ("Open in Books / Files / Drive…"). Files sync to the
 * family's private storage when signed in, so every device can open them.
 */

export const MAX_FILE_MB = 10;

export type PickResult = { material: LessonMaterial } | { error: string } | undefined;

export async function pickMaterialFile(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) return undefined;
  if (asset.size && asset.size > MAX_FILE_MB * 1024 * 1024) return { error: `That file is over ${MAX_FILE_MB} MB. Add a link to it instead, or split the PDF.` };
  const id = uid('m');
  const dir = new Directory(Paths.document, 'materials');
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = asset.name.split('.').pop()?.toLowerCase() || (asset.mimeType === 'application/pdf' ? 'pdf' : 'jpg');
  const dest = new File(dir, `${id}.${ext}`);
  await new File(asset.uri).copy(dest);
  return { material: { id, label: asset.name.replace(/\.[^.]+$/, ''), uri: dest.uri, fileName: asset.name, mimeType: asset.mimeType } };
}

/** Opens a material; resolves to an error message when it can't. */
export async function openMaterial(m: LessonMaterial): Promise<string | undefined> {
  try {
    if (m.url) {
      await WebBrowser.openBrowserAsync(m.url);
      return undefined;
    }
    let uri = m.uri && new File(m.uri).exists ? m.uri : undefined;
    if (!uri && m.remotePath) {
      const url = await mediaUrl(m.remotePath);
      if (!url) return 'Couldn’t reach Kinship to fetch this file. Check your connection.';
      const dir = new Directory(Paths.cache, 'materials');
      if (!dir.exists) dir.create({ intermediates: true });
      const dest = new File(dir, `${m.id}-${(m.fileName ?? 'lesson.pdf').replace(/[^\w.-]/g, '_')}`);
      if (!dest.exists) await File.downloadFileAsync(url, dest);
      uri = dest.uri;
    }
    if (!uri) return 'This file was added on another device. Sign in on both devices to share it with the family.';
    if (!(await Sharing.isAvailableAsync())) return 'This device can’t open files from Kinship.';
    await Sharing.shareAsync(uri, { mimeType: m.mimeType, UTI: m.mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined, dialogTitle: m.label });
    return undefined;
  } catch {
    return 'Couldn’t open that file.';
  }
}

export async function deleteMaterialFile(m: LessonMaterial): Promise<void> {
  try {
    if (m.uri) {
      const f = new File(m.uri);
      if (f.exists) f.delete();
    }
  } catch {
    // Already gone.
  }
}
