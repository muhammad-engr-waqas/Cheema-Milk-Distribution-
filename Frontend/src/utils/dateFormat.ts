/**
 * Date display utility
 * Converts stored ISO date string (YYYY-MM-DD) to display format (DD-MM-YY)
 * e.g. "2026-07-14" → "14-07-26"
 *
 * Internal storage format (YYYY-MM-DD) remains unchanged —
 * sirf display ke liye format badla jata hai.
 */
export const fmtDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [yyyy, mm, dd] = parts;
  const yy = yyyy.slice(2); // last 2 digits
  return `${dd}-${mm}-${yy}`;
};
