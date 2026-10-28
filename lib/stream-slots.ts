const counts = new Map<string, number>();
let total = 0;
/** A process budget, independent of request rate. Every termination path releases its slot. */
export function acquireStreamSlot(userId: string) {
  const count = counts.get(userId) || 0;
  if (count >= 4 || total >= 1000) return null;
  counts.set(userId, count + 1); total++;
  let released = false;
  return () => {
    if (released) return; released = true; total--;
    const next = (counts.get(userId) || 1) - 1;
    if (next) counts.set(userId, next); else counts.delete(userId);
  };
}
