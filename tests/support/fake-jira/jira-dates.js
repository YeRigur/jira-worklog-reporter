// Jira renders dates in CSV exports with the exporter's date format and
// timezone (e.g. "20/Feb/25 1:43 PM"). Patterns use the same tokens Jira's
// "Look and feel" settings use: yyyy yy MMMM MMM MM M dd d HH H hh h mm ss a.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Tried in order by detectDatePattern; the first one that parses every sample wins.
export const DATE_PATTERNS = [
  'dd/MMM/yy h:mm a',
  'dd/MMM/yyyy h:mm a',
  'dd/MMM/yy HH:mm',
  'dd/MMM/yyyy HH:mm',
  'yyyy-MM-dd HH:mm',
  'yyyy-MM-dd HH:mm:ss',
  'yyyy-MM-dd h:mm a',
  'dd/MM/yyyy HH:mm',
  'dd/MM/yy HH:mm',
  'dd.MM.yyyy HH:mm',
  'dd.MM.yy HH:mm',
  'MM/dd/yyyy h:mm a',
  'MM/dd/yy h:mm a',
  'dd/MM/yyyy h:mm a',
  'dd MMM yyyy HH:mm',
  'dd MMM yyyy h:mm a'
];

const TOKEN_RE = /yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|hh|h|mm|ss|a/g;

const TOKEN_SOURCE = {
  yyyy: '(\\d{4})', yy: '(\\d{2})',
  MMMM: '([A-Za-z]{3,9})', MMM: '([A-Za-z]{3})', MM: '(\\d{1,2})', M: '(\\d{1,2})',
  dd: '(\\d{1,2})', d: '(\\d{1,2})',
  HH: '(\\d{1,2})', H: '(\\d{1,2})', hh: '(\\d{1,2})', h: '(\\d{1,2})',
  mm: '(\\d{2})', ss: '(\\d{2})', a: '([AaPp][Mm])'
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileDatePattern(pattern) {
  const tokens = [];
  let source = '';
  let last = 0;
  for (const m of pattern.matchAll(TOKEN_RE)) {
    source += escapeRe(pattern.slice(last, m.index)) + TOKEN_SOURCE[m[0]];
    tokens.push(m[0]);
    last = m.index + m[0].length;
  }
  source += escapeRe(pattern.slice(last));
  const re = new RegExp(`^${source}$`);
  const twelveHour = tokens.includes('a');

  const parse = (raw) => {
    const m = re.exec(String(raw ?? '').trim());
    if (!m) return null;
    const out = { year: NaN, month: NaN, day: NaN, hour: 0, minute: 0, second: 0 };
    let meridiem = '';
    tokens.forEach((tok, i) => {
      const v = m[i + 1];
      if (tok === 'yyyy') out.year = Number(v);
      else if (tok === 'yy') out.year = 2000 + Number(v);
      else if (tok === 'MMM' || tok === 'MMMM') out.month = MONTHS.indexOf(v.slice(0, 3).toLowerCase()) + 1;
      else if (tok === 'MM' || tok === 'M') out.month = Number(v);
      else if (tok === 'dd' || tok === 'd') out.day = Number(v);
      else if (tok === 'HH' || tok === 'H' || tok === 'hh' || tok === 'h') out.hour = Number(v);
      else if (tok === 'mm') out.minute = Number(v);
      else if (tok === 'ss') out.second = Number(v);
      else if (tok === 'a') meridiem = v.toUpperCase();
    });
    if (twelveHour) {
      if (out.hour < 1 || out.hour > 12) return null;
      out.hour = (out.hour % 12) + (meridiem === 'PM' ? 12 : 0);
    }
    if (!(out.month >= 1 && out.month <= 12)) return null;
    if (out.hour > 23 || out.minute > 59 || out.second > 59) return null;
    const probe = new Date(Date.UTC(out.year, out.month - 1, out.day));
    if (probe.getUTCMonth() !== out.month - 1 || probe.getUTCDate() !== out.day) return null;
    return out;
  };

  return { pattern, parse };
}

export function detectDatePattern(samples) {
  const values = samples.map((s) => String(s ?? '').trim()).filter(Boolean);
  if (!values.length) return null;
  for (const pattern of DATE_PATTERNS) {
    const { parse } = compileDatePattern(pattern);
    if (values.every((v) => parse(v))) return pattern;
  }
  return null;
}

const pad = (n, len = 2) => String(n).padStart(len, '0');

export function toIsoDate(p) {
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

// Same shape the Jira REST API returns ("2025-02-20T13:43:00.000+0200"). The
// offset is this machine's for that instant — the CSV carries no timezone.
export function toIsoDateTime(p) {
  const local = new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${toIsoDate(p)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.000${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

