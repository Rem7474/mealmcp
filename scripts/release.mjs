// Usage: npm run release -- <patch|minor|major|X.Y.Z>
//
// Bumps the version in package.json, server/package.json, web/package.json and package-lock.json,
// then commits "Release vX.Y.Z" and tags it. Nothing is pushed: review, then `git push --follow-tags`.
// The release workflow refuses a tag that does not match these files.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = ['package.json', 'server/package.json', 'web/package.json'].map((f) => resolve(root, f));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const current = read(files[0]).version;
const arg = process.argv[2];
if (!arg) fail('usage: npm run release -- <patch|minor|major|X.Y.Z>');

function next(version, how) {
  if (/^\d+\.\d+\.\d+$/.test(how)) return how;
  const [major, minor, patch] = version.split('.').map(Number);
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  return fail(`unknown bump "${how}"`);
}
const version = next(current, arg);

if (git('status', '--porcelain')) fail('the working tree is not clean: commit or stash first');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('releases are cut from main');
if (git('tag', '--list', `v${version}`)) fail(`tag v${version} already exists`);

const writeJson = (f, data) => writeFileSync(f, `${JSON.stringify(data, null, 2)}\n`);
for (const f of files) writeJson(f, { ...read(f), version });

const lock = resolve(root, 'package-lock.json');
const lockData = read(lock);
lockData.version = version;
if (lockData.packages?.['']) lockData.packages[''].version = version;
for (const w of ['server', 'web']) if (lockData.packages?.[w]) lockData.packages[w].version = version;
writeJson(lock, lockData);

git('add', ...files, lock);
git('commit', '-m', `Release v${version}`);
git('tag', '-a', `v${version}`, '-m', `v${version}`);
console.log(`Released ${current} -> ${version}. Push with: git push --follow-tags`);
