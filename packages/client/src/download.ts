/** Hand a Blob to the browser as a file download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** A doc name as a file name: as it reads, with the characters Windows and macOS forbid replaced. */
export function fileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '-')
      // Control characters, which no file system wants.
      .split('')
      .filter((c) => c.charCodeAt(0) >= 32)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 120) || 'Untitled'
  );
}

