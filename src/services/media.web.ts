import * as ImagePicker from 'expo-image-picker';

/**
 * Web variant: blob: URLs die with the tab, so keep a downscaled data URI.
 * localStorage is small (~5 MB), so photos are compressed hard.
 */
export async function pickPhoto(_source: 'camera' | 'library'): Promise<string | undefined> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, base64: true });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset) return undefined;
  if (asset.uri.startsWith('data:')) return downscale(asset.uri);
  if (asset.base64) return downscale(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
  return undefined;
}

function downscale(dataUri: string, maxSide = 900): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

export async function toDataUri(uri: string): Promise<string> {
  return uri;
}

export async function deletePhoto(_uri: string): Promise<void> {}
