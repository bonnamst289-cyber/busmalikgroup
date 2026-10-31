#!/usr/bin/env node
// One release = one tag = one CHANGELOG section. This script is the gate that
// keeps those three in step, and it hands the release notes to GitHub Actions
// so the in-application update box can show them.
//
//   node scripts/prepare-release.cjs            # uses v<package.json version>
//   node scripts/prepare-release.cjs v1.0.1
const fs = require('node:fs');
const path = require('node:path');
const { isValidVersion } = require('../src/updater/version.cjs');

const ROOT = path.join(__dirname, '..');
const packageJson = require(path.join(ROOT, 'package.json'));

function fail(message) {
  console.error(`\n  RELEASE BLOCKED  ${message}\n`);
  process.exit(1);
}

function changeLogSection(version) {
  const lines = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').split(/\r?\n/);
  const heading = `## [${version}]`;
  const start = lines.findIndex((line) => line.trim() === heading || line.startsWith(`${heading} `));
  if (start === -1) return null;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^## \[/.test(line) || line.trim() === '---') break;
    body.push(line);
  }
  const notes = body.join('\n').trim();
  return notes ? { notes, heading: lines[start] } : null;
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function main() {
  const tag = (process.argv[2] || `v${packageJson.version}`).trim();
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
    fail(`"${tag}" is not a release tag. Use vMAJOR.MINOR.PATCH, for example v1.0.1.`);
  }
  const version = tag.slice(1);
  if (!isValidVersion(version)) fail(`"${version}" is not a valid semantic version.`);
  if (version !== packageJson.version) {
    fail(`Tag ${tag} does not match package.json ("version": "${packageJson.version}").`);
  }
  const found = changeLogSection(version);
  if (!found) {
    fail(`CHANGELOG.md has no "## [${version}]" section with release notes.\n`
      + '  Add the section first — the notes are what association users read before they install.');
  }
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  const notesFile = path.join(ROOT, 'dist', 'release-notes.md');
  fs.writeFileSync(notesFile, `${found.notes}\n`);
  setOutput('tag', tag);
  setOutput('version', version);
  setOutput('notes_file', path.relative(ROOT, notesFile).replace(/\\/g, '/'));
  console.log(`Release ${tag} accepted.`);
  console.log(`  package.json version : ${packageJson.version}`);
  console.log(`  installer name       : BusMalikSomiti-Setup-${version}-x64.exe`);
  console.log(`  release notes file   : dist/release-notes.md (${found.notes.split('\n').length} lines)`);
}

main();
