import { describe, expect, it } from 'vitest';
import { chipLabels } from '../src/docNames';

describe('chipLabels', () => {
  it('drops the start the titles share', () => {
    expect(chipLabels(['SAR Test Report-Annex A', 'SAR Test Report-Annex B', 'SAR Test Report-Annex C'], 'Test Report'))
      .toEqual(['Annex A', 'Annex B', 'Annex C']);
    expect(chipLabels(['Test Report-DSS-1', 'Test Report-DSS-2'], 'Test Report')).toEqual(['DSS-1', 'DSS-2']);
  });

  it('cuts on a word boundary', () => {
    expect(chipLabels(['Antenna Report-R', 'Antenna Report-L'], 'x')).toEqual(['Report-R', 'Report-L']);
    expect(chipLabels(['Test Reports-DTS-1', 'Test Report-DSS-1'], 'x')).toEqual(['Reports-DTS-1', 'Report-DSS-1']);
  });

  it('keeps whole titles when one is the shared start', () => {
    expect(chipLabels(['SAR Test Report', 'SAR Test Report-Annex A'], 'x')).toEqual(['SAR Test Report', 'SAR Test Report-Annex A']);
  });

  it('keeps titles with nothing in common', () => {
    expect(chipLabels(['Agent Letter', 'Confidentiality Letter'], 'x')).toEqual(['Agent Letter', 'Confidentiality Letter']);
  });

  it('reads underscores as spaces and numbers exact repeats', () => {
    expect(chipLabels(['FCC_E-Label_Info_v1.0', 'FCC_E-Label_Info_v1.0'], 'x')).toEqual(['FCC E-Label Info v1.0 (1)', 'FCC E-Label Info v1.0 (2)']);
    expect(chipLabels(['A1901_Internal_Photos_v1.1'], 'x')).toEqual(['A1901 Internal Photos v1.1']);
  });

  it('falls back to the type name for an empty title', () => {
    expect(chipLabels(['', ''], 'User Manual')).toEqual(['User Manual (1)', 'User Manual (2)']);
  });
});
