import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const wasmFiles = ['sql-wasm.wasm', 'sql-wasm-browser.wasm'];
const srcDir = resolve(__dirname, 'node_modules/sql.js/dist');
const destDir = resolve(__dirname, 'public');

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

for (const file of wasmFiles) {
  const src = resolve(srcDir, file);
  const dest = resolve(destDir, file);
  try {
    copyFileSync(src, dest);
    console.log(`✓ copied ${file}`);
  } catch (err) {
    console.error(`✗ failed to copy ${file}: ${err.message}`);
  }
}
