// Build script - 将源文件打包到 dist/ 目录，可选生成 zip
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ZIP_FLAG = process.argv.includes('--zip');

const COPY_LIST = [
  'manifest.json',
  'popup/',
  'background/',
  'offscreen/',
  'utils/',
  'icons/'
];

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest, excludePatterns) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      if (excludePatterns && excludePatterns.some(p => item.match(p))) continue;
      copyRecursive(path.join(src, item), path.join(dest, item), excludePatterns);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function createZip(sourceDir, outputPath) {
  const { execSync } = require('child_process');
  const cwd = path.dirname(sourceDir);
  const dirName = path.basename(sourceDir);
  try {
    execSync(`cd "${cwd}" && zip -r "${outputPath}" "${dirName}"`, { stdio: 'pipe' });
    return true;
  } catch {
    console.warn('zip command not available, skipping zip creation');
    return false;
  }
}

console.log('Building ClipStash...');
cleanDir(DIST);

// Exclude macOS-specific icons from the extension build (only used by desktop)
const ICON_EXCLUDES = [/^icon-macos-/];

for (const item of COPY_LIST) {
  const src = path.join(ROOT, item);
  const dest = path.join(DIST, item);
  if (!fs.existsSync(src)) {
    console.warn(`Warning: ${item} not found, skipping`);
    continue;
  }
  const excludes = item === 'icons/' ? ICON_EXCLUDES : null;
  copyRecursive(src, dest, excludes);
  console.log(`  Copied ${item}`);
}

let totalSize = 0;
function countSize(dir) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) countSize(full);
    else totalSize += stat.size;
  }
}
countSize(DIST);
console.log(`\nBuild output: ${DIST}`);
console.log(`Total size: ${(totalSize / 1024).toFixed(1)} KB`);

if (ZIP_FLAG) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const zipName = `clipstash-v${pkg.version}.zip`;
  const zipPath = path.join(ROOT, zipName);
  if (createZip(DIST, zipPath)) {
    const zipSize = fs.statSync(zipPath).size;
    console.log(`\nZip created: ${zipName} (${(zipSize / 1024).toFixed(1)} KB)`);
  }
}

console.log('\nDone!');
