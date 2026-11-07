/**
 * Web: expo-print prints the *current page*, not supplied HTML, so open the
 * document in a new window and use the browser's print dialog ("Save as PDF").
 */
export async function exportHtml(html: string, _filename: string): Promise<void> {
  const w = window.open('', '_blank');
  if (!w) {
    // Pop-up blocked: fall back to a downloadable HTML file.
    download(html, `${_filename}.html`, 'text/html');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Print once, whichever fires first.
  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    w.print();
  };
  w.onload = go;
  setTimeout(go, 600);
}

/** Print an HTML document from a hidden iframe (no pop-up window needed). */
export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 300));
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  // Leave the frame until the dialog closes; afterprint isn't reliable everywhere.
  setTimeout(() => frame.remove(), 60_000);
}

export async function shareText(text: string, filename: string, mimeType = 'text/plain'): Promise<void> {
  download(text, filename, mimeType);
}

function download(text: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
