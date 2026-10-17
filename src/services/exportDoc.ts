import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Render HTML to a PDF and open the share sheet (save, email, print, AirDrop). */
export async function exportHtml(html: string, filename: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
  } else {
    await Print.printAsync({ uri });
  }
}

export async function shareText(text: string, filename: string, mimeType = 'text/plain'): Promise<void> {
  const { File, Paths } = await import('expo-file-system');
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: filename });
}
