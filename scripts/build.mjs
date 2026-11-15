// Builds the two generated files that index.html loads:
//   app.js     – all of src/js/*.js concatenated in filename order (one classic script,
//                so every function and variable stays global exactly like before the split)
//   styles.css – Tailwind CSS generated from the classes used in index.html and src/js
// Run with: npm run build:assets
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath (not URL.pathname) so this also works on Windows.
const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src/js');
const files = readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();

const header = '// GENERATED FILE – do not edit. Edit src/js/*.js and run `npm run build:assets`.\n';
const body = files.map(f => readFileSync(join(srcDir, f), 'utf8')).join('');
writeFileSync(join(root, 'app.js'), header + body);
console.log(`app.js: ${files.length} files, ${body.length} bytes`);

// Run Tailwind's CLI with this same node binary: node_modules/.bin/tailwindcss is a shell
// script that Windows can't execute directly.
execFileSync(
  process.execPath,
  [join(root, 'node_modules/tailwindcss/lib/cli.js'), '-c', join(root, 'tailwind.config.cjs'), '-i', join(root, 'src/css/tailwind.css'), '-o', join(root, 'styles.css'), '--minify'],
  { stdio: 'inherit' }
);
