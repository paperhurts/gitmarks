// Triggers a browser file download for an in-memory string blob.
// Uses URL.createObjectURL + a synthetic anchor click, which is the standard
// approach that works across all evergreen browsers without polyfills.
export function downloadString(content: string, filename: string, mimeType = "text/html"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after the click so the download completes; setTimeout(0) is enough
  // because the browser has already started the download by the next tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
