const { compareVersions } = require('./version.cjs');

// "Remind me later" hides the notice for one day; "Skip this version" hides it
// until a release newer than the skipped one appears.
function isSnoozed(snoozeUntil, now = new Date()) {
  if (!snoozeUntil) return false;
  const until = Date.parse(snoozeUntil);
  return !Number.isNaN(until) && until > now.getTime();
}

function isSkipped(skippedVersion, latestVersion) {
  if (!skippedVersion || !latestVersion) return false;
  return compareVersions(latestVersion, skippedVersion) <= 0;
}

module.exports = { isSnoozed, isSkipped };
