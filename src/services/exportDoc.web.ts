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
  w.onload = () => w.print();
  setTimeout(() => w.print(), 600);
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
