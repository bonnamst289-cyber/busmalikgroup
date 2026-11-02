const fs = require('node:fs');
const path = require('node:path');

// electron-builder strips `build` from the packaged package.json, so the
// installed application must also look at the feed file it writes next to
// app.asar. Only owner/repo are read; no token may live in these files.
function readPackageJson(app) {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function parseFeedYaml(text) {
  const values = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2].replace(/\s+#.*$/, '').trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value === 'false' ? false : value === 'true' ? true : value;
  }
  return values;
}

function normalizePublish(raw) {
  const candidate = Array.isArray(raw)
    ? raw.find((entry) => entry && entry.provider === 'github') || raw[0]
    : raw;
  if (!candidate || typeof candidate !== 'object') return null;
  const owner = String(candidate.owner || '').trim();
  const repo = String(candidate.repo || '').trim();
  if (!owner || !repo) return null;
  const publish = { provider: 'github', owner, repo };
  if (candidate.vPrefixedTagName === false) publish.vPrefixedTagName = false;
  return publish;
}

function feedFiles(app) {
  const files = [];
  try {
    if (process.resourcesPath) files.push(path.join(process.resourcesPath, 'app-update.yml'));
  } catch {
    // process.resourcesPath is absent outside Electron.
  }
  try {
    files.push(path.join(path.dirname(app.getPath('exe')), 'resources', 'app-update.yml'));
  } catch {
    // A test double may not implement getPath('exe').
  }
  try {
    files.push(path.join(app.getAppPath(), 'dev-app-update.yml'));
  } catch {
    // Same for getAppPath().
  }
  return files;
}

function readPublishConfig(app) {
  const fromPackage = normalizePublish(readPackageJson(app).build?.publish);
  if (fromPackage) return fromPackage;
  for (const file of feedFiles(app)) {
    try {
      const publish = normalizePublish(parseFeedYaml(fs.readFileSync(file, 'utf8')));
      if (publish) return publish;
    } catch {
      // Missing or unreadable feed files are skipped.
    }
  }
  return null;
}

module.exports = {
  readPublishConfig,
  parseFeedYaml,
  normalizePublish
};
