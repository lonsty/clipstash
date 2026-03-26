// Build CM6 bundle for both extension and desktop
import { build } from 'esbuild';
import { copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const outfile = resolve(__dirname, 'vendor', 'cm6.min.js');

await build({
  entryPoints: [resolve(__dirname, 'cm6-bundle.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile,
  target: ['es2020'],
  sourcemap: false,
  legalComments: 'none',
});

// Copy to both platforms
const extDest = resolve(__dirname, '..', 'clipstash-ext', 'vendor', 'cm6.min.js');
const desktopDest = resolve(__dirname, '..', 'clipstash-desktop', 'src', 'vendor', 'cm6.min.js');

copyFileSync(outfile, extDest);
copyFileSync(outfile, desktopDest);

console.log(`CM6 bundle built and copied to:
  ${extDest}
  ${desktopDest}`);
