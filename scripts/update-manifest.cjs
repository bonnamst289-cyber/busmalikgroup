#!/usr/bin/env node
// Builds the small public manifest that sits beside latest.yml on every GitHub
// release. electron-updater still uses latest.yml for the download; this file
// adds the package SHA256, mandatory flag and readable notes the app checks
// before it offers an install.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const packageJson = require(path.join(ROOT, 'package.json'));
const { compareVersions, isValidVersion } = require(path.join(ROOT, 'src', 'updater', 'version.cjs'));

function fail(message) {
  throw new Error(message);
}

function findInstaller(distDir, version) {
  const expected = `BusMalikGroup-Setup-${version}-x64.exe`;
  const expectedPath = path.join(distDir, expected);
  if (fs.existsSync(expectedPath)) return { filePath: expectedPath, fileName: expected };
  const match = fs.readdirSync(distDir).find((name) => (
    name.startsWith(`BusMalikGroup-Setup-${version}`) && name.endsWith('.exe')
  ));
  if (!match) fail(`No Windows installer for ${version} was found in ${distDir}.`);
  return { filePath: path.join(distDir, match), fileName: match };
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function latestYmlVersion(distDir) {
  const file = path.join(distDir, 'latest.yml');
  if (!fs.existsSync(file)) fail(`latest.yml is missing from ${distDir}.`);
  const match = fs.readFileSync(file, 'utf8').match(/^version:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  if (!match) fail('latest.yml has no version field.');
  return match[1].trim();
}

function releaseDownloadUrl({ owner, repo, version, fileName }) {
  return `https://github.com/${owner}/${repo}/releases/download/v${version}/${encodeURIComponent(fileName)}`;
}

function buildManifest({ distDir = path.join(ROOT, 'dist'), version = packageJson.version,
  minimumVersion = null, notes = '', mandatory = false, owner = 'bonnamst289-cyber',
  repo = 'busmalikgroup', now = new Date() } = {}) {
  if (!isValidVersion(version)) fail(`"${version}" is not a valid MAJOR.MINOR.PATCH version.`);
  const minimum = String(minimumVersion || version).trim();
  if (!isValidVersion(minimum)) fail(`"${minimum}" is not a valid minimum version.`);
  if (compareVersions(minimum, version) > 0) {
    fail(`minimum required version ${minimum} cannot be newer than the release ${version}.`);
  }
  const feedVersion = latestYmlVersion(distDir);
  if (feedVersion !== version) {
    fail(`latest.yml says ${feedVersion}, but the manifest version is ${version}. Bump package.json before building.`);
  }
  const installer = findInstaller(distDir, version);
  const size = fs.statSync(installer.filePath).size;
  if (!size) fail(`${installer.fileName} is empty.`);
  return {
    version,
    minimumVersion: minimum,
    downloadUrl: releaseDownloadUrl({ owner, repo, version, fileName: installer.fileName }),
    sha256: sha256(installer.filePath),
    releaseNotes: String(notes || '').trim() || `Bus Malik Group ${version}`,
    releaseDate: now.toISOString(),
    mandatory: mandatory === true,
    size,
    installer
  };
}

function writeManifest({ distDir = path.join(ROOT, 'dist'), version = packageJson.version,
  minimumVersion = null, notes = '', mandatory = false, owner = 'bonnamst289-cyber',
  repo = 'busmalikgroup', now = new Date() } = {}) {
  const manifest = buildManifest({ distDir, version, minimumVersion, notes, mandatory, owner, repo, now });
  const versionFile = path.join(distDir, 'version.json');
  const checksumFile = `${manifest.installer.filePath}.sha256`;
  const notesFile = path.join(distDir, 'release-notes.md');
  // snake_case is the documented central policy format. The camelCase aliases
  // keep older installed builds able to read the SHA256 and notes from the
  // same per-release version.json.
  const publicManifest = {
    latest_version: manifest.version,
    minimum_required_version: manifest.minimumVersion,
    download_url: manifest.downloadUrl,
    sha256: manifest.sha256,
    release_notes: manifest.releaseNotes,
    release_date: manifest.releaseDate,
    mandatory: manifest.mandatory,
    size: manifest.size,
    version: manifest.version,
    downloadUrl: manifest.downloadUrl,
    releaseNotes: manifest.releaseNotes,
    releaseDate: manifest.releaseDate
  };
  fs.writeFileSync(versionFile, `${JSON.stringify(publicManifest, null, 2)}\n`);
  fs.writeFileSync(checksumFile, `${manifest.sha256}  ${manifest.installer.fileName}\n`);
  fs.writeFileSync(notesFile, `${publicManifest.releaseNotes}\n`);
  return { ...publicManifest, versionFile, checksumFile, notesFile, installerFile: manifest.installer.filePath };
}

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function main() {
  const args = process.argv.slice(2);
  const version = argumentValue(args, '--version', process.env.VERSION || packageJson.version);
  const notesFile = argumentValue(args, '--notes-file', process.env.NOTES_FILE || path.join(ROOT, 'dist', 'release-notes.md'));
  const outDir = path.resolve(argumentValue(args, '--out-dir', path.join(ROOT, 'dist')));
  const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8') : (process.env.RELEASE_NOTES || '');
  const optional = args.includes('--optional') || process.env.UPDATE_OPTIONAL === '1';
  const explicitMinimum = argumentValue(args, '--minimum-version', process.env.UPDATE_MINIMUM_VERSION || null);
  // By default every published release raises the minimum version to itself:
  // that is the strict policy the association asked for. A deliberate optional
  // release must say so and keep the previous minimum (0.0.0 = never block).
  const minimumVersion = explicitMinimum || (optional ? '0.0.0' : version);
  const mandatory = !optional && (args.includes('--mandatory') || process.env.UPDATE_MANDATORY === '1'
    || minimumVersion === version);
  const result = writeManifest({ distDir: outDir, version, minimumVersion, notes, mandatory });
  console.log(`Update manifest written for ${version} (minimum ${minimumVersion}).`);
  console.log(`  version.json : ${result.versionFile}`);
  console.log(`  checksum     : ${result.checksumFile}`);
  console.log(`  installer    : ${result.installerFile}`);
  console.log(`  SHA256       : ${result.sha256}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\n  MANIFEST BLOCKED  ${error.message}\n`);
    process.exit(1);
  }
}

module.exports = { buildManifest, writeManifest, findInstaller, sha256, latestYmlVersion };
