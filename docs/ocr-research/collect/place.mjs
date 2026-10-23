import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
const out = '<repo>/tests/example_images/wikimedia_commons';
mkdirSync(out, { recursive: true });
const ids = {
  '02': 'IBACT-SBAPNP49', '04': 'PDD-AR5B93', '08': 'A3LSGHD900I', '09': 'S4LONE-CK', '11': 'QDS-BRCM1020',
  '23': 'BCG-E2643B', '24': 'PD911230BNHU', '27': 'FBX5E9DFK515AT', '28': 'FMA44HKB6151', '29': 'QDJ-200205EDS01',
  '30': 'PPIRM-217', '32': 'PP2RX03031', '38': 'PD98260NG', '48': 'C3K7PN9937', '50': 'BR98YV1764',
  '51': 'PD962205ANHU', '52': 'QDS-BRCM1046LE', '58': 'QISEM770', '64': 'PBY1130401', '70': 'CSYSC-428PT',
  '71': 'RAXWN4501DARC', '72': 'PY71130601', '73': 'ZNFE960', '74': 'PD96235ANH', '75': 'NOI9900-11215-000',
  '79': 'E5XKBM10510', '80': 'PD9AX211NG',
};
const notes = {
  PDD_AR5B93: 0,
  'PDD-AR5B93': 'Not on fccid.io (HTTP 300; suggests LZ-AR5B93). Label is clearly PDD-AR5B93.',
  'PP2RX03031': 'Not on fccid.io (HTTP 404). Label is clearly PP2RX03031.',
  'QDJ-200205EDS01': 'Label prints the ID with a space: "QDJ-200205 EDS01".',
  'BR98YV1764': 'Label reads "FCC ID. NO. BR98YV1764".',
  'QDS-BRCM1020': 'Label is rotated 90 degrees.',
  'ZNFE960': 'Small light-on-dark text on a phone back.',
  'NOI9900-11215-000': 'Silkscreened on the PCB.',
  'C3K7PN9937': 'Scan/render of a label, not a photo.',
};
const meta = JSON.parse(readFileSync('meta.json', 'utf8'));
const byLocal = Object.fromEntries(Object.entries(meta).map(([t, m]) => [m.local.split('.')[0], { title: t, ...m }]));
const manifest = [];
for (const [n, id] of Object.entries(ids)) {
  const m = byLocal[n];
  const ext = m.local.split('.')[1];
  copyFileSync('cand/' + m.local, `${out}/${id}.${ext}`);
  manifest.push({ file: `${id}.${ext}`, fccId: id, onFccidIo: !['PDD-AR5B93', 'PP2RX03031'].includes(id),
    note: notes[id] ?? undefined, source: m.page, author: m.artist, license: m.license });
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(manifest.length, 'files'); console.log([...new Set(manifest.map((x) => x.license))]);
