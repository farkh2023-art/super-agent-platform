'use strict';

function parse(version) {
  const s = String(version || '').trim().replace(/^v/, '');
  const idx = s.indexOf('-');
  const core = idx === -1 ? s : s.slice(0, idx);
  const pre  = idx === -1 ? null : s.slice(idx + 1);
  const parts = core.split('.');
  return {
    major: parseInt(parts[0], 10) || 0,
    minor: parseInt(parts[1], 10) || 0,
    patch: parseInt(parts[2], 10) || 0,
    pre,
  };
}

// Returns -1 if a < b, 0 if equal, 1 if a > b
function compare(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  // Core equal: null (release) > any prerelease (standard semver)
  if (pa.pre === null && pb.pre === null) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  // Both prerelease: compare trailing numeric suffix when present
  const numA = parseInt(String(pa.pre).match(/(\d+)$/)?.[1] ?? '', 10);
  const numB = parseInt(String(pb.pre).match(/(\d+)$/)?.[1] ?? '', 10);
  if (!isNaN(numA) && !isNaN(numB)) return numA > numB ? 1 : numA < numB ? -1 : 0;
  return pa.pre.localeCompare(pb.pre);
}

function isNewer(current, candidate) {
  return compare(candidate, current) > 0;
}

module.exports = { parse, compare, isNewer };
