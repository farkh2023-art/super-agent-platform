'use strict';

const { parse, compare, isNewer } = require('../src/utils/semver');

describe('semver - parse', () => {
  test('parses plain version', () => {
    expect(parse('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, pre: null });
  });

  test('strips v prefix', () => {
    expect(parse('v2.9.0')).toEqual({ major: 2, minor: 9, patch: 0, pre: null });
  });

  test('parses prerelease with multiple hyphens', () => {
    const p = parse('v2.9.0-phase-10');
    expect(p.major).toBe(2);
    expect(p.minor).toBe(9);
    expect(p.patch).toBe(0);
    expect(p.pre).toBe('phase-10');
  });

  test('handles empty string', () => {
    expect(parse('')).toEqual({ major: 0, minor: 0, patch: 0, pre: null });
  });

  test('handles null/undefined', () => {
    expect(parse(null)).toEqual({ major: 0, minor: 0, patch: 0, pre: null });
  });
});

describe('semver - compare', () => {
  test('major: higher wins', () => {
    expect(compare('v3.0.0', 'v2.0.0')).toBe(1);
    expect(compare('v2.0.0', 'v3.0.0')).toBe(-1);
  });

  test('minor: v1.10.0 > v1.9.0', () => {
    expect(compare('v1.10.0', 'v1.9.0')).toBe(1);
    expect(compare('v1.9.0', 'v1.10.0')).toBe(-1);
  });

  test('patch difference', () => {
    expect(compare('v1.0.1', 'v1.0.0')).toBe(1);
    expect(compare('v1.0.0', 'v1.0.1')).toBe(-1);
  });

  test('equal versions return 0', () => {
    expect(compare('v1.0.0', 'v1.0.0')).toBe(0);
    expect(compare('v2.9.0-phase-10', 'v2.9.0-phase-10')).toBe(0);
  });

  test('release > prerelease on same core', () => {
    expect(compare('v2.9.0', 'v2.9.0-phase-10')).toBe(1);
    expect(compare('v2.9.0-phase-10', 'v2.9.0')).toBe(-1);
  });

  test('higher prerelease number wins', () => {
    expect(compare('v2.9.0-phase-11', 'v2.9.0-phase-10')).toBe(1);
    expect(compare('v2.9.0-phase-10', 'v2.9.0-phase-11')).toBe(-1);
  });

  test('v3.0.0-phase-12 > v2.9.0-phase-10 (major wins)', () => {
    expect(compare('v3.0.0-phase-12', 'v2.9.0-phase-10')).toBe(1);
  });

  test('no v prefix accepted', () => {
    expect(compare('2.0.0', '1.0.0')).toBe(1);
  });
});

describe('semver - isNewer', () => {
  test('v3.0.0-phase-12 is newer than v2.9.0-phase-10', () => {
    expect(isNewer('v2.9.0-phase-10', 'v3.0.0-phase-12')).toBe(true);
  });

  test('older candidate returns false', () => {
    expect(isNewer('v3.0.0', 'v2.9.0')).toBe(false);
  });

  test('equal versions return false', () => {
    expect(isNewer('v1.0.0', 'v1.0.0')).toBe(false);
  });

  test('minor increment is newer', () => {
    expect(isNewer('v1.0.0', 'v1.1.0')).toBe(true);
  });

  test('prerelease increment is newer', () => {
    expect(isNewer('v2.9.0-phase-10', 'v2.9.0-phase-11')).toBe(true);
  });

  test('release is newer than prerelease on same core', () => {
    expect(isNewer('v2.9.0-phase-10', 'v2.9.0')).toBe(true);
  });
});
