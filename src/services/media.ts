import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { uid } from '@/lib/id';

/**
 * Snap-and-upload for the Evidence Vault (native). Photos are copied out of the
 * picker's cache into the app's document directory so the OS can't purge them.
 * When the Kinship API exists these get uploaded to encrypted storage instead.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | undefined> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return undefined;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return undefined;

  const dir = new Directory(Paths.document, 'evidence');
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = res.assets[0].uri.split('.').pop()?.split('?')[0] || 'jpg';
  const dest = new File(dir, `${uid('ev')}.${ext}`);
  await new File(res.assets[0].uri).copy(dest);
  return dest.uri;
}

/** Inline an image for HTML export (iOS print can't load local file URLs). */
export async function toDataUri(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  try {
    const b64 = await new File(uri).base64();
    const type = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${type};base64,${b64}`;
  } catch {
    return uri;
  }
}

export async function deletePhoto(uri: string): Promise<void> {
  if (uri.startsWith('data:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone — nothing to clean up.
  }
}
