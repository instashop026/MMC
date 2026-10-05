import * as fs from 'fs';
const p = 'artifacts/model-feed/netlify/functions/zerostorage-browser.mts';
let s = fs.readFileSync(p, 'utf8');
const old = '    global: { headers: { Authorization: *** ${match[1]}` } },';
const newLine = '    global: { headers: { Authorization: `Bearer ${match[1]}` } },';
console.log('old in s:', s.includes(old));
s = s.replace(old, newLine);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
