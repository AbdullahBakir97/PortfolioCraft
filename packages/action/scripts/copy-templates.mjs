import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = resolve(here, '../../renderers/dist/templates');
const dest = resolve(here, '../../../dist/templates');

if (!existsSync(src)) {
  console.error(`templates source not found at ${src}; did renderers build run?`);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });
console.log(`copied templates: ${src} -> ${dest}`);
