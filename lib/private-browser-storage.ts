/** Unsent content is private even when no API request has been made. */
export function clearPrivateBrowserStorage() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith("boardcue:")) sessionStorage.removeItem(key);
    indexedDB.deleteDatabase("boardcue-share");
  } catch { /* Storage may be unavailable. Server also sends Clear-Site-Data. */ }
}
