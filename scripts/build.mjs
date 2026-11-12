// Builds the two generated files that index.html loads:
//   app.js     – all of src/js/*.js concatenated in filename order (one classic script,
//                so every function and variable stays global exactly like before the split)
//   styles.css – Tailwind CSS generated from the classes used in index.html and src/js
// Run with: npm run build:assets
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const srcDir = join(root, 'src/js');
const files = readdirSync(srcDir).filter(f => f.endsWith('.js')).sort();

const header = '// GENERATED FILE – do not edit. Edit src/js/*.js and run `npm run build:assets`.\n';
const body = files.map(f => readFileSync(join(srcDir, f), 'utf8')).join('');
writeFileSync(join(root, 'app.js'), header + body);
console.log(`app.js: ${files.length} files, ${body.length} bytes`);

execFileSync(
  join(root, 'node_modules/.bin/tailwindcss'),
  ['-c', join(root, 'tailwind.config.cjs'), '-i', join(root, 'src/css/tailwind.css'), '-o', join(root, 'styles.css'), '--minify'],
  { stdio: 'inherit' }
);
