#!/usr/bin/env node
/**
 * Очистка кэша перед финальной сборкой.
 * Удаляет: .expo, node_modules/.cache, android/app/build, android/build.
 * Затем в android выполняет gradlew clean.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dirs = [
  '.expo',
  path.join('node_modules', '.cache'),
  path.join('android', 'app', 'build'),
  path.join('android', 'build'),
];

console.log('Cleaning caches...');
dirs.forEach((d) => {
  const full = path.join(root, d);
  try {
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      console.log('  removed:', d);
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('  skip', d, e.message);
  }
});

const androidDir = path.join(root, 'android');
const gradlewName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
const gradlew = path.join(androidDir, gradlewName);
if (fs.existsSync(gradlew)) {
  try {
    execSync(`${gradlewName} clean`, { cwd: androidDir, stdio: 'inherit', shell: true });
    console.log('  android: gradlew clean done');
  } catch (e) {
    console.warn('  android clean:', e.message || e);
  }
} else {
  console.log('  android: gradlew not found, skip');
}
console.log('Done. Run e.g. npx expo run:android for a clean build.');
