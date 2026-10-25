// Copies of real ludants to experiment on: their somas and their art, read through the
// machine's Chrome (see platforms/gactant/tools/chrome-fetch.mjs: the home network blocks
// the site by name). Nothing is written to the site.
//   node fetch-somas.mjs genek-09adf3 evevina-f08ff7 anithis-c81ec4
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const get = (path) => JSON.parse(execFileSync('node', ['../../platforms/gactant/tools/chrome-fetch.mjs', `https://gactant.com/api/${path}`], { maxBuffer: 1 << 28 }).toString());
for (const id of process.argv.slice(2)) {
  const l = get(`ludants/${id}`);
  const art = get(`ludants/${id}/assets`);
  writeFileSync(`data/${id}.json`, JSON.stringify({ id, soma: l.soma, lineage: l.lineage, familyNames: l.familyNames, art }, null, 1));
  console.log(id, Object.keys(l.soma.sections).join(','), `${art.length} pictures`);
}
