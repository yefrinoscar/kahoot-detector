#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {detectScoreUpload, parseKahoot} from '../src/index.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Uso: kahoot-detector <reporte.xlsx> [otro.xlsx ...]');
  process.exit(2);
}
let failed = false;
for (const file of files) {
  try {
    const bytes = new Uint8Array(readFileSync(file));
    const kind = detectScoreUpload(bytes);
    const result = kind === 'kahoot' ? {file, kind, ...parseKahoot(bytes)} : {file, kind};
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    failed = true;
    console.error(`${file}: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed ? 1 : 0);
