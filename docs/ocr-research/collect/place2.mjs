import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
const out = '<repo>/tests/example_images/web_batch2';
mkdirSync(out, { recursive: true });
const picks = [
  ['meta2.json', '117', 'DKD529MPU-401', 'Printed with spaces: "DKD 529 MPU-401".'],
  ['meta2.json', '121', 'O8FMADECA', null],
  ['meta2.json', '123', 'AQ659ZRT-101A', null],
  ['meta2.json', '131', 'C3K1008', null],
  ['meta2.json', '137', 'C3K1409', 'Small label rotated 90 degrees on a PCB.'],
  ['meta2.json', '138', 'E2KWM3945ABG', 'Laptop underside with several labels.'],
  ['meta2.json', '140', 'AZD216', null],
  ['meta2.json', '157', 'TV7RB951UI-2ND', 'Label also shows "ID:RB951Ui-2nD" (mixed case).'],
  ['meta2.json', '174', 'JNZYR0015', null],
  ['meta3.json', '325', 'PD97260NGU', 'Label is rotated 90 degrees.'],
  ['meta3.json', '327', 'PD9512ANXMU', null],
  ['meta3.json', '331', 'PD92230BNH', null],
  ['meta3.json', '339', 'PD9AX201NG', 'Small text in a corner of the label.'],
  ['meta2.json', '148', 'A3LGTI9100', 'Small low-contrast text inside a phone battery bay.'],
  ['meta3.json', '320', null, null],
  ['meta5.json', '508', 'VHE-3', 'Label is upside down. Short ID.'],
  ['meta7.json', '765', 'RYYEYSHCN', 'Laser-engraved on a metal RF shield.'],
  ['meta7.json', '838', 'BCG6LWM0117', null],
  ['meta7.json', '839', 'BTW8XENUMERICPAD', null],
  ['meta7.json', '840', 'FSQ4VYFK-2000PLUS', 'Printed with spaces: "FSQ4VY FK-2000 PLUS". fccid.io /FSQ4VY alone returns HTTP 300.'],
  ['meta7.json', '845', 'B7ZAPC-H412', 'White text on a black box.'],
  ['meta7.json', '860', '2AFWN-EL016F5C4C', 'Printed with spaced dash: "2AFWN - EL016F5C4C". Two copies of the label in frame.'],
  ['meta7.json', '890', 'EVOKD-1731', null],
  ['meta7.json', '893', '2AYMH-NP-154', 'Two copies of the label in frame.'],
  ['meta7.json', '957', 'PD98265NGU', null],
  ['meta6.json', '602', 'J9CFBC1', 'From Flickr via Openverse.'],
  ['meta2.json', '104', null, null],
].filter((p) => p[2]);
const manifest = [];
for (const [mf, n, id, note] of picks) {
  const meta = JSON.parse(readFileSync(mf, 'utf8'));
  const [title, m] = Object.entries(meta).find(([, v]) => v.local.split('.')[0] === n);
  const ext = m.local.split('.')[1];
  copyFileSync((mf === 'meta2.json' ? 'cand2/' : mf === 'meta3.json' ? 'cand3/' : mf === 'meta5.json' ? 'cand5/' : mf === 'meta6.json' ? 'cand6/' : 'cand7/') + m.local, `${out}/${id}.${ext}`);
  manifest.push({ file: `${id}.${ext}`, fccId: id, onFccidIo: true, ...(note ? { note } : {}), source: m.page, author: m.artist, license: m.license });
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(manifest.length, 'files'); console.log([...new Set(manifest.map((x) => x.license))]);
