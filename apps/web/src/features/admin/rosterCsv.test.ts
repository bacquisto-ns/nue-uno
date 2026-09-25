import { describe, expect, it } from 'vitest';
import { parseCsv, rosterFromCsv } from './rosterCsv';

describe('parseCsv', () => {
  it('handles quotes, commas in quotes, doubled quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
});

describe('rosterFromCsv', () => {
  it('maps common HR headers, lowercases emails, and reports bad rows by line', () => {
    const csv = [
      'Work Email,First Name,Last Name,Dept,Location',
      'Priya.Shah@NueSynergy.com,Priya,Shah,Finance,Kansas City',
      'someone@gmail.com,Some,One,IT,',
      'dana@nuesynergy.com,Dana,,Sales,',
      'priya.shah@nuesynergy.com,Priya,Again,Finance,',
      'lee@nuesynergy.com,Lee,Wu,,',
    ].join('\n');
    const { rows, errors } = rosterFromCsv(csv);
    expect(rows).toEqual([
      { email: 'priya.shah@nuesynergy.com', name: 'Priya Shah', department: 'Finance', office: 'Kansas City' },
      { email: 'dana@nuesynergy.com', name: 'Dana', department: 'Sales', office: null },
    ]);
    expect(errors).toEqual([
      'Line 3: "someone@gmail.com" isn\'t a company email.',
      'Line 5: priya.shah@nuesynergy.com appears twice (kept the first).',
      'Line 6: no department for lee@nuesynergy.com.',
    ]);
  });

  it('explains a missing column instead of importing nothing silently', () => {
    expect(rosterFromCsv('Email,Name\na@nuesynergy.com,A').errors).toEqual(['No department column found (expected "Department").']);
    expect(rosterFromCsv('Email').errors[0]).toMatch(/header row/);
  });
});
