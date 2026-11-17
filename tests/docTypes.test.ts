// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOC_TYPES, OTHER_COLOR, gridCols, gridRows, groupDocuments } from '../src/docTypes';
import type { Exhibit } from '../src/fccidio';
import { parseDevicePage } from '../src/fccidio';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

const ex = (type: string, status: Exhibit['status'], extra: Partial<Exhibit> = {}): Exhibit => ({
  type,
  title: `${type} doc`,
  status,
  ...extra,
});

describe('DOC_TYPES', () => {
  it('lists the 14 types in priority order, each with its own color', () => {
    expect(DOC_TYPES.map((t) => t.name)).toEqual([
      'Internal Photos',
      'External Photos',
      'Schematics',
      'Block Diagram',
      'User Manual',
      'ID Label/Location Info',
      'Cover Letter(s)',
      'Operational Description',
      'Parts List/Tune Up Info',
      'Test Report',
      'Test Setup Photos',
      'RF Exposure Info',
      'Attestation Statements',
      'SDR Software/Security Info',
    ]);
    const colors = DOC_TYPES.map((t) => t.color);
    expect(new Set([...colors, OTHER_COLOR]).size).toBe(15);
  });
});

describe('groupDocuments', () => {
  it('puts types with a public document in priority order, unknown types last', () => {
    const { visible } = groupDocuments([
      ex('Test Report', 'available'),
      ex('jpeg', 'available'),
      ex('External Photos', 'available'),
      ex('Internal Photos', 'available'),
    ]);
    expect(visible.map((g) => g.name)).toEqual(['Internal Photos', 'External Photos', 'Test Report', 'jpeg']);
    expect(visible[3].color).toBe(OTHER_COLOR);
  });

  it('collects every document of a type into one group', () => {
    const { visible } = groupDocuments([ex('Internal Photos', 'available'), ex('Internal Photos', 'pending', { availableDate: '2027-01-01' })]);
    expect(visible).toHaveLength(1);
    expect(visible[0].exhibits).toHaveLength(2);
    expect(visible[0].publicCount).toBe(1);
  });

  it('maps fccid.io type names onto the list (Users Manual, truncated SDR)', () => {
    const { visible, confidential } = groupDocuments([
      ex('Users Manual', 'available'),
      ex('SDR Software/Security Inf', 'unavailable'),
      ex('SDR Software/Security Info.', 'unavailable'),
    ]);
    expect(visible.map((g) => g.name)).toEqual(['User Manual']);
    expect(confidential.map((g) => g.name)).toEqual(['SDR Software/Security Info']);
    expect(confidential[0].exhibits).toHaveLength(2);
  });

  it('keeps types with nothing public out of visible: pending with the earliest date, else private', () => {
    const { visible, confidential } = groupDocuments([
      ex('User Manual', 'pending', { availableDate: '2027-03-01' }),
      ex('User Manual', 'pending', { availableDate: '2027-02-10' }),
      ex('Schematics', 'unavailable'),
    ]);
    expect(visible).toEqual([]);
    expect(confidential.map((g) => [g.name, g.state, g.availableDate])).toEqual([
      ['Schematics', 'private', undefined],
      ['User Manual', 'pending', '2027-02-10'],
    ]);
  });

  it('notes when a release date has passed but nothing was published', () => {
    const { confidential } = groupDocuments([ex('User Manual', 'unavailable', { availableDate: '2018-04-02' })]);
    expect(confidential[0]).toMatchObject({ state: 'private', overdueSince: '2018-04-02' });
  });

  it('lists the types that were never filed', () => {
    const { notFiled } = groupDocuments([ex('Internal Photos', 'available'), ex('Schematics', 'unavailable')]);
    expect(notFiled).not.toContain('Internal Photos');
    expect(notFiled).not.toContain('Schematics');
    expect(notFiled).toContain('SDR Software/Security Info');
    expect(notFiled).toHaveLength(12);
  });

  it('handles a real device page', () => {
    const device = parseDevicePage(fixture('bcg-e3175a.html'), '2026-10-11');
    const { visible, confidential } = groupDocuments(device.exhibits);
    expect(visible[0].name).toBe('Internal Photos');
    expect(confidential.map((g) => g.name)).toContain('Parts List/Tune Up Info');
  });
});

describe('gridRows', () => {
  it('fits as many 120 px rows (12 px gaps) as the space allows', () => {
    expect(gridRows(648, 8)).toBe(4);
    expect(gridRows(471, 8)).toBe(3);
    expect(gridRows(648, 20)).toBe(5);
  });

  it('never uses more rows than the tiles need', () => {
    expect(gridRows(648, 3)).toBe(2);
    expect(gridRows(648, 1)).toBe(1);
  });

  it('keeps at least one row when there are tiles, none when there are not', () => {
    expect(gridRows(50, 4)).toBe(1);
    expect(gridRows(648, 0)).toBe(0);
  });

  it('needs fewer rows with more columns', () => {
    expect(gridRows(648, 8, 120, 12, 4)).toBe(2);
    expect(gridRows(648, 9, 120, 12, 4)).toBe(3);
  });
});

describe('gridCols', () => {
  it('uses two columns on a phone and more on wider screens', () => {
    expect(gridCols(390)).toBe(2);
    expect(gridCols(768)).toBe(3);
    expect(gridCols(1168)).toBe(4);
  });
});
