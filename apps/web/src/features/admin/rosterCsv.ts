import { isCompanyEmail } from '@nue-uno/shared';

export interface RosterCsvRow {
  email: string;
  name: string;
  department: string;
  office: string | null;
}

export interface RosterCsvResult {
  rows: RosterCsvRow[];
  /** Human-readable problems, e.g. "Line 7: not a @nuesynergy.com email". */
  errors: string[];
}

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

/** RFC 4180-ish: commas, quoted fields, doubled quotes, CRLF. Enough for an HR export. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(BOM, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim()));
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z]/g, '');
const HEADERS = {
  email: ['email', 'emailaddress', 'workemail', 'mail'],
  name: ['name', 'fullname', 'displayname', 'employeename', 'employee'],
  first: ['firstname', 'first', 'givenname', 'preferredname'],
  last: ['lastname', 'last', 'surname', 'familyname'],
  department: ['department', 'dept', 'team', 'division'],
  office: ['office', 'location', 'site'],
};

/**
 * HR roster CSV → rows for `importRoster` (PRD A3). Needs a header row with an email column, a
 * name (or first + last name) and a department. Only company emails are accepted; duplicates keep
 * the first row.
 */
export function rosterFromCsv(text: string): RosterCsvResult {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ['The file needs a header row and at least one person.'] };
  const header = table[0]!.map(norm);
  const col = (keys: string[]) => header.findIndex((h) => keys.includes(h));
  const idx = {
    email: col(HEADERS.email),
    name: col(HEADERS.name),
    first: col(HEADERS.first),
    last: col(HEADERS.last),
    department: col(HEADERS.department),
    office: col(HEADERS.office),
  };
  if (idx.email < 0) errors.push('No email column found (expected a header like "Email").');
  if (idx.name < 0 && idx.first < 0) errors.push('No name column found (expected "Name", or "First name" and "Last name").');
  if (idx.department < 0) errors.push('No department column found (expected "Department").');
  if (errors.length) return { rows: [], errors };

  const seen = new Set<string>();
  const rows: RosterCsvRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (j: number) => (j >= 0 ? (cells[j] ?? '').trim() : '');
    const email = get(idx.email).toLowerCase();
    const name = idx.name >= 0 && get(idx.name) ? get(idx.name) : [get(idx.first), get(idx.last)].filter(Boolean).join(' ');
    const department = get(idx.department);
    if (!isCompanyEmail(email)) return void errors.push(`Line ${line}: "${email || '(blank)'}" isn't a company email.`);
    if (!name) return void errors.push(`Line ${line}: no name for ${email}.`);
    if (!department) return void errors.push(`Line ${line}: no department for ${email}.`);
    if (seen.has(email)) return void errors.push(`Line ${line}: ${email} appears twice (kept the first).`);
    seen.add(email);
    rows.push({ email, name: name.slice(0, 80), department: department.slice(0, 60), office: get(idx.office).slice(0, 60) || null });
  });
  return { rows, errors };
}
