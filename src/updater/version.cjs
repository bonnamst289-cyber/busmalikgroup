const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function isValidVersion(value) {
  return parseVersion(value) !== null;
}

// Semver ordering: a release outranks any of its pre-releases (1.0.0 > 1.0.0-rc.1).
function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  if (!a || !b) throw new Error('Invalid version number.');
  for (const part of ['major', 'minor', 'patch']) {
    if (a[part] !== b[part]) return a[part] > b[part] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    if (!a.prerelease.length && !b.prerelease.length) return 0;
    return a.prerelease.length ? -1 : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) {
      const difference = Number(aPart) - Number(bPart);
      if (difference) return difference > 0 ? 1 : -1;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (aPart !== bPart) {
      return aPart > bPart ? 1 : -1;
    }
  }
  return 0;
}

module.exports = { parseVersion, isValidVersion, compareVersions };
