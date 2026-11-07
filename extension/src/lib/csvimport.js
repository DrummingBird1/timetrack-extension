// CSV import: TimeTrack's own export, RescueTime-style exports, and any CSV that has a
// date column, a site column and a duration column (header names are matched loosely).
// Pure functions — no DOM, no chrome APIs.

import { cleanDomain } from './utils.js';
import { isDayKey } from './snapshot.js';

/**
 * The field separator of a CSV file: Excel writes ";" (and a decimal comma) in Hebrew, Russian,
 * French, Spanish and most other locales, "," in English ones, and a tab for "Unicode text".
 * Judged from the header line, ignoring anything inside quotes.
 */
export function detectDelimiter(text) {
  const header = text.slice(0, text.search(/\r?\n/) < 0 ? undefined : text.search(/\r?\n/)).replace(/"[^"]*"/g, '');
  const count = (c) => header.split(c).length - 1;
  const best = [';', '\t'].reduce((a, c) => (count(c) > count(a) ? c : a), ',');
  return count(best) > 0 ? best : ',';
}

/** Minimal RFC 4180 parser: quoted fields, "" escapes, CRLF/LF, blank lines ignored. */
export function parseCsv(text, delimiter = ',') {
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
    } else if (c === delimiter) {
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

/** "2026-03-05", "2026-03-05T14:30:00", "2026-03-05 14:30", "2026/03/05" → { key, hour } or null (also null for 2026-02-31). */
function parseDate(raw) {
  const m = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s](\d{2}))?/.exec((raw || '').trim());
  if (!m) return null;
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isDayKey(key)) return null;
  return { key, hour: m[4] != null ? Math.min(23, Number(m[4])) : null };
}

/**
 * A number the way a spreadsheet wrote it: "90", "1.5", "1,5", "1.234,5" (decimal comma, used by ";"
 * files) or "1,234.5". Plain decimal numbers only: no "Infinity", no "1e12". NaN when it is not one.
 */
function toNumber(raw, decimalComma) {
  let s = String(raw ?? '').trim().replace(/\s/g, '');
  if (decimalComma) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');        // "1,5" in a comma-separated file: a decimal comma
  else s = s.replace(/,/g, '');                                       // "1,234.5": thousands separators
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const MAX_ROW_SECONDS = 86400;      // one site cannot have more than a day in a day

/** Bare, lower-case hostname, or '' when the value is not a website (e.g. a desktop app name). */
function cleanSite(raw) {
  const host = cleanDomain(raw);
  // a dot (a real site), or localhost / an IPv6 literal; a bare word is far more likely an app name
  return host && (host.includes('.') || host === 'localhost' || host.startsWith('[')) ? host : '';
}

/**
 * @param {string} text  the CSV file's contents
 * @returns {{ days: Record<string, any>, rows: number, skipped: number, format: 'timetrack' | 'rescuetime' | 'generic' }}
 * @throws Error with `code` 'NO_COLUMNS' (unrecognized header) or 'NO_ROWS' (nothing usable)
 */
export function parseUsageCsv(text) {
  const body = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(body);
  const rows = parseCsv(body, delimiter);
  const decimalComma = delimiter === ';';
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
    if (col.seconds >= 0) seconds = toNumber(cells[col.seconds], decimalComma);
    else if (col.minutes >= 0) seconds = toNumber(cells[col.minutes], decimalComma) * 60;
    else seconds = toNumber(cells[col.hours], decimalComma) * 3600;
    if (!when || !domain || !(seconds > 0) || seconds > MAX_ROW_SECONDS) { skipped++; continue; }

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
