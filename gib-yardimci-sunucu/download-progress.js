// download-progress.js — SHA-256 tabanli indirme defteri (exe'den adapte edildi)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writeFileSync, readFileSync, mkdirSync, statSync } = fs;

const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');

async function loadDownloadProgress(root, month) {
  const file = path.join(root, `.luca-indirme-durumu-${month}.json`);
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.schemaVersion === 1 && value.month === month && value.steps && typeof value.steps === 'object') {
      return { file, month, steps: value.steps };
    }
    throw new Error('Gecersiz indirme kaydi');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Indirme ilerleme kaydi okunamadi; sifirdan baslanmadı ve mevcut kayit korunuyor.');
  }
  return { file, month, steps: {} };
}

function completedStep(progress, key, { summaryOnly = false } = {}) {
  const entry = progress.steps[key];
  if (entry?.status !== 'complete' || !Array.isArray(entry.files)) return null;
  if (entry.queryRecords?.length && !entry.records?.length && !entry.files.length) return null;
  if ((entry.records?.length >= 500 || entry.stats?.pdfCount >= 500) && entry.pagination?.complete !== true) return null;
  if (!entry.files.length && !(entry.records?.length) && entry.stats?.issues == null && !(entry.metadataOnly && entry.pagination?.complete) && !(entry.stats?.empty === true && entry.pagination?.complete === true)) return null;
  try {
    for (const file of entry.files) {
      if (summaryOnly) { if (!(fs.statSync(file.path)).isFile()) return null; }
      else if (digest(fs.readFileSync(file.path)) !== file.sha256) return null;
    }
    return entry;
  } catch (e) { return null; }
}

function recordStep(progress, key, result = {}, error = null) {
  const files = [];
  for (const file of result.files || (result.filePath ? [result.filePath] : [])) {
    try { files.push({ path: file, sha256: digest(fs.readFileSync(file)) }); } catch (e) { /* yoksay */ }
  }
  progress.steps[key] = {
    status: error ? 'failed' : (result.missing?.length ? 'partial' : 'complete'),
    updatedAt: new Date().toISOString(),
    metadataOnly: result.metadataOnly === true,
    files,
    records: result.records || [],
    ...(Array.isArray(result.queryRecords || result.listedRecords) ? { queryRecords: result.queryRecords || result.listedRecords } : {}),
    missing: result.missing || [],
    error: error?.message || null,
    pagination: result.pagination || null,
    stats: { pdfCount: result.pdfCount ?? null, marked: result.marked ?? null, issues: result.issues ?? null, empty: result.empty ?? null }
  };
  fs.mkdirSync(path.dirname(progress.file), { recursive: true });
  fs.writeFileSync(progress.file, JSON.stringify({ schemaVersion: 1, month: progress.month, steps: progress.steps }, null, 2));
}

module.exports = { loadDownloadProgress, completedStep, recordStep };
