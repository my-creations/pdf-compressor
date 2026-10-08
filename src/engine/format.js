export const MB = 1024 * 1024;

/** Preset target sizes offered in the UI, in MB. */
export const TARGET_PRESETS_MB = [1, 2, 5, 10];
export const DEFAULT_TARGET_MB = 2;

/**
 * Bytes we actually aim for: a small margin under the limit so that portals
 * which count "2 MB" as 2,000,000 bytes still accept the file.
 */
export function targetBytesFor(targetMB) {
  return Math.floor(Math.min(targetMB * MB * 0.95, targetMB * 1_000_000));
}

/**
 * Parse a user-entered target (e.g. "1,5" or "3") into MB.
 * Returns null when the value is unusable.
 */
export function parseTargetMB(value) {
  if (typeof value === 'number') return value >= 0.1 && value <= 500 ? value : null;
  if (typeof value !== 'string') return null;
  const n = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0.1 || n > 500) return null;
  return Math.round(n * 100) / 100;
}

/** Format bytes as a readable MB string. */
export function formatMB(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '0.00 MB';
  return (bytes / MB).toFixed(2) + ' MB';
}

/** Short size label: KB below 1 MB, MB above. */
export function formatSize(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '0 KB';
  if (bytes < MB) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  return formatMB(bytes);
}

/** Size reduction in whole percent, never negative. */
export function calculateReduction(originalSize, compressedSize) {
  if (!originalSize || originalSize <= 0) return 0;
  const reduction = Math.round((1 - compressedSize / originalSize) * 100);
  return Math.max(0, reduction);
}

/** Label for a target size, e.g. "2 MB" or "1.5 MB". */
export function targetLabel(targetMB) {
  return `${Number.isInteger(targetMB) ? targetMB : targetMB.toFixed(1)} MB`;
}

/** Strip extension and characters that are unsafe in file names. */
export function baseName(fileName) {
  const base = String(fileName || 'documento').replace(/\.[^.]+$/, '');
  return base.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'documento';
}

/** Name for a compressed output file, e.g. "relatorio_2MB.pdf". */
export function outputFileName(fileName, targetMB, suffix = '') {
  const size = targetLabel(targetMB).replace(/\s+/g, '');
  return `${baseName(fileName)}${suffix}_${size}.pdf`;
}

/** Make file names unique within a list (for ZIP archives). */
export function uniqueNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    return name.replace(/(\.[^.]+)?$/, (ext) => ` (${count + 1})${ext || ''}`);
  });
}
