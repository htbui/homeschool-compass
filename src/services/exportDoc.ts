import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Render HTML to a PDF and open the share sheet (save, email, print, AirDrop). */
export async function exportHtml(html: string, filename: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: filename });
  } else {
    await Print.printAsync({ uri });
  }
}

const PAGE = { letter: { width: 612, height: 792 }, a4: { width: 595, height: 842 } } as const;

/** Only iOS can pick and remember a specific printer (AirPrint). */
export const canChoosePrinter = Platform.OS === 'ios';

/** Ask the system to pick a printer (iOS). Returns undefined if cancelled. */
export async function choosePrinter(): Promise<{ name: string; url: string } | undefined> {
  if (!canChoosePrinter) return undefined;
  try {
    const p = await Print.selectPrinterAsync();
    return p?.url ? { name: p.name, url: p.url } : undefined;
  } catch {
    return undefined; // picker dismissed
  }
}

/**
 * Print an HTML document. With `printerUrl` (iOS) it goes straight to that
 * printer; otherwise the system print dialog opens (AirPrint on iOS, the
 * Android print service — Wi-Fi, Mopria, or a manufacturer plugin — on Android).
 */
export async function printHtml(html: string, opts: { printerUrl?: string; paper?: 'letter' | 'a4' } = {}): Promise<void> {
  await Print.printAsync({ html, printerUrl: opts.printerUrl, ...PAGE[opts.paper ?? 'letter'] });
}

export async function shareText(text: string, filename: string, mimeType = 'text/plain'): Promise<void> {
  const { File, Paths } = await import('expo-file-system');
  const f = new File(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: filename });
}
