export type SharedCapture = { text: string; audio: File | null; audioName?: string | null; truncated?: boolean; createdAt: number };

/** Long enough for sign-in plus two-step verification after the share. */
export const SHARE_TTL_MS = 30 * 60_000;

function withInbox<T>(work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("boardcue-share", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("inbox");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("inbox", "readwrite");
      let result: T;
      work(tx.objectStore("inbox"), value => (result = value));
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

/**
 * Reads the share the service worker stored without removing it (expired shares are deleted).
 * Call clearSharedCapture() once the text was placed or the audio transcribed, so a failed step can be retried.
 */
export function consumeSharedCapture(): Promise<SharedCapture | null> {
  return withInbox((store, done) => {
    const read = store.get("latest");
    read.onsuccess = () => {
      const value = read.result as SharedCapture | undefined;
      const fresh = Boolean(value) && Date.now() - value!.createdAt < SHARE_TTL_MS;
      if (value && !fresh) store.delete("latest");
      done(fresh ? { ...value!, audioName: value!.audioName || value!.audio?.name || null, truncated: Boolean(value!.truncated) } : null);
    };
  });
}

export function clearSharedCapture(): Promise<void> {
  return withInbox((store, done) => {
    store.delete("latest");
    done(undefined);
  });
}
