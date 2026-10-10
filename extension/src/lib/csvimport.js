// CSV import: TimeTrack's own export, RescueTime-style exports, and any CSV that has a
// date column, a site column and a duration column (header names are matched loosely).
// Pure functions — no DOM, no chrome APIs.

/** Minimal RFC 4180 parser: quoted fields, "" escapes, CRLF/LF, blank lines ignored. */
export function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) rows.push(row); }
  return rows;
}

// Accepted header names (lower-cased), most specific first.
const COLUMNS = {
  date: ['date', 'day', 'start time', 'start', 'timestamp', 'time'],
  domain: ['domain', 'website', 'site', 'hostname', 'host', 'url', 'activity', 'name'],
  seconds: ['seconds', 'time spent (seconds)', 'duration (seconds)', 'time (seconds)', 'total seconds', 'time spent seconds'],
  minutes: ['minutes', 'time spent (minutes)', 'duration (minutes)', 'time (minutes)', 'total minutes'],
  hours: ['hours', 'time spent (hours)', 'duration (hours)', 'time (hours)'],
  visits: ['visits', 'views', 'sessions', 'count'],
};

function findColumn(header, names) {
  for (const name of names) {
    const i = header.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

function fail(code, message) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

/** "2026-03-05", "2026-03-05T14:30:00", "2026-03-05 14:30", "2026/03/05" → { key, hour } or null. */
function parseDate(raw) {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s](\d{2}))?/.exec((raw || '').trim());
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { key: `${m[1]}-${m[2]}-${m[3]}`, hour: m[4] != null ? Math.min(23, Number(m[4])) : null };
}

/** Bare, lower-case hostname, or '' when the value is not a website (e.g. a desktop app name). */
function cleanSite(raw) {
  const d = (raw || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : '';
}

/**
 * @param {string} text  the CSV file's contents
 * @returns {{ days: Record<string, any>, rows: number, skipped: number, format: 'timetrack' | 'rescuetime' | 'generic' }}
 * @throws Error with `code` 'NO_COLUMNS' (unrecognized header) or 'NO_ROWS' (nothing usable)
 */
export function parseUsageCsv(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw fail('NO_COLUMNS', 'CSV has no data rows');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, names]) => [key, findColumn(header, names)]));
  if (col.date < 0 || col.domain < 0 || (col.seconds < 0 && col.minutes < 0 && col.hours < 0)) {
    throw fail('NO_COLUMNS', 'CSV needs date, site and duration columns');
  }
  const format = header.includes('time spent (seconds)') && header.includes('activity') ? 'rescuetime'
    : header.includes('category') && header.includes('seconds') ? 'timetrack' : 'generic';

  const days = {};
  let valid = 0;
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const when = parseDate(cells[col.date]);
    const domain = cleanSite(cells[col.domain]);
    let seconds = NaN;
    if (col.seconds >= 0) seconds = parseFloat(cells[col.seconds]);
    else if (col.minutes >= 0) seconds = parseFloat(cells[col.minutes]) * 60;
    else seconds = parseFloat(cells[col.hours]) * 3600;
    if (!when || !domain || !(seconds > 0)) { skipped++; continue; }

    seconds = Math.round(seconds);
    const day = days[when.key] || (days[when.key] = { domains: {}, hours: new Array(24).fill(0) });
    const rec = day.domains[domain] || (day.domains[domain] = { t: 0, v: 0 });
    rec.t += seconds;
    if (col.visits >= 0) rec.v += parseInt(cells[col.visits], 10) || 0;
    if (when.hour != null) {
      day.hours[when.hour] += seconds;
      rec.dh = rec.dh || {};
      rec.dh[when.hour] = (rec.dh[when.hour] || 0) + seconds;
    }
    valid++;
  }
  if (!valid) throw fail('NO_ROWS', 'no usable rows');
  return { days, rows: valid, skipped, format };
}
