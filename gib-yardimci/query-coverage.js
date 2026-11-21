// query-coverage.js — tarih araligi kapsama matematigi (exe'den adapte edildi)
// Parca parca sorgulanan araliklari birlestirip "bu donem tam kapsandi mi" diye kanitlar.
const day = (value) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : NaN;
};

function covered(completed, key) {
  if (completed.has(key)) return true;
  const parts = key.split('|');
  const end = day(parts.pop());
  const start = day(parts.pop());
  const prefix = parts.join('|') + '|';
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const ranges = [];
  for (const saved of completed) {
    if (!saved.startsWith(prefix)) continue;
    const p = saved.slice(prefix.length).split('|');
    if (p.length !== 2) continue;
    const a = day(p[0]);
    const b = day(p[1]);
    if (Number.isFinite(a) && Number.isFinite(b) && a <= b) ranges.push([a, b]);
  }
  let cursor = start;
  for (const [a, b] of ranges.sort((x, y) => x[0] - y[0])) {
    if (a > cursor) break;
    if (b >= cursor) cursor = b + 86400000;
    if (cursor > end) return true;
  }
  return false;
}

// Read-only fallback: en yeni ayni ay anlik goruntusunu tut, ama kapsanmamis
// gunleri kapsandigi iddia etme.
function latestSnapshot(stores, key) {
  const parts = key.split('|');
  const end = parts.pop();
  const start = parts.pop();
  const prefix = parts.join('|') + '|' + start + '|';
  const candidates = [];
  for (const store of stores) {
    for (const [k, entry] of Object.entries(store.steps || {})) {
      if (!k.startsWith(prefix) || entry?.status !== 'complete') continue;
      const until = k.slice(prefix.length);
      if (until.slice(3) === start.slice(3) && day(until) <= day(end)) {
        candidates.push({ entry, start, end: until });
      }
    }
  }
  return candidates.sort((a, b) => day(b.end) - day(a.end) || String(b.entry?.updatedAt || '').localeCompare(String(a.entry?.updatedAt || '')))[0] || null;
}

module.exports = { covered, latestSnapshot, day };
