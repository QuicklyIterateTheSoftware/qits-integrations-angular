import { readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));
const dist = JSON.parse(readFileSync('dist/qits-integrations-angular/package.json', 'utf8'));

let failed = false;
const rootEntry = root.exports['.'];
const distEntry = dist.exports['.'];
for (const key of ['types', 'default']) {
  const expected = './dist/qits-integrations-angular/' + distEntry[key].replace(/^\.\//, '');
  if (rootEntry[key] !== expected) {
    console.error(`exports drift: root exports['.'].${key} is ${rootEntry[key]}, dist says ${expected}`);
    failed = true;
  }
}
for (const [pkg, range] of Object.entries(dist.peerDependencies ?? {})) {
  if (root.peerDependencies?.[pkg] !== range) {
    console.error(`peer drift: dist declares ${pkg}@${range}, root has ${root.peerDependencies?.[pkg]}`);
    failed = true;
  }
}
// The consumer's package manager resolves the ROOT manifest's dependencies (git deps install the
// repo root), while ng-packagr emits dist's from projects/qits-integrations-angular/package.json — both ways
// of drifting ship a package that can't resolve its imports.
for (const [pkg, range] of Object.entries(dist.dependencies ?? {})) {
  if (root.dependencies?.[pkg] !== range) {
    console.error(`dependency drift: dist declares ${pkg}@${range}, root has ${root.dependencies?.[pkg]}`);
    failed = true;
  }
}
for (const pkg of Object.keys(root.dependencies ?? {})) {
  if (!dist.dependencies?.[pkg]) {
    console.error(`dependency drift: root declares ${pkg}, missing from dist (add it to projects/qits-integrations-angular/package.json)`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('manifests in sync: root mirrors dist (exports + peers + dependencies)');
