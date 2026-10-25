import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const P = 'prongs';
const L = 'plate';

const SECTIONS = [
  { title: 'Adapter', open: true, fields: [
    { k: 'adapter', label: 'Type', type: 'select', options: [['prongs', 'Prongs into channels'], ['plate', 'Plate (screws / keyholes)']],
      help: 'Prongs: walls hang beside the device and prongs slide through them into its channels. Plate: flat plate screwed to the device or hung on keyhole screws.' },
  ] },
  { title: 'Device', open: true, fields: [
    { k: 'device.width', label: 'Width between walls', dim: 'DW', unit: 'mm', type: 'num', when: P,
      help: 'Outer size of the device across the prongs, wall to wall. Measure the device itself; the play comes from Fit.' },
    { k: 'device.mass', label: 'Mass', unit: 'kg', type: 'num', when: P, help: 'Device weight for the prong strength estimate.' },
    { k: 'device.height', label: 'Height (preview only)', unit: 'mm', type: 'num', help: 'Only draws the dashed device outline.' },
    { k: 'device.length', label: 'Length (preview only)', unit: 'mm', type: 'num', nullable: true, when: P,
      help: 'Only draws the dashed device outline. Empty = base length + 40.' },
  ] },
  { title: 'Prongs', open: true, when: P, custom: 'prongs', fields: [
    { k: 'prong.width', label: 'Default width', dim: 'PW', unit: 'mm', type: 'num', help: 'Prong width along the wall = slot width minus play.' },
    { k: 'prong.thickness', label: 'Default thickness', dim: 'PT', unit: 'mm', type: 'num', help: 'Prong thickness = channel height minus play.' },
    { k: 'prong.offset', label: 'Default offset', dim: 'PO', unit: 'mm', type: 'num', help: 'Device top surface down to the top edge of the channel.' },
    { k: 'prong.length', label: 'Default length', dim: 'PL', unit: 'mm', type: 'num', help: 'How deep a blind (side A / B) prong goes into the device. Through-prongs ignore it.' },
    { k: 'prong.tip_chamfer', label: 'Tip chamfer', unit: 'mm', type: 'num', help: 'Lead-in chamfer on the prong tips.' },
  ] },
  { title: 'Base & walls', when: P, fields: [
    { k: 'base.length', label: 'Base length', dim: 'BL', unit: 'mm', type: 'num', auto: true, help: 'Length along the walls. auto = just covers the prong heads plus margin.' },
    { k: 'base.thickness', label: 'Base thickness', dim: 'BT', unit: 'mm', type: 'num', auto: true, help: 'auto = just deep enough for the dovetail channel.' },
    { k: 'base.frame', label: 'Frame width', unit: 'mm', type: 'num', help: 'Opens the middle of the base and keeps strips this wide along walls, ends and rails. 0 = solid base.' },
    { k: 'base.overhang', label: 'Overhang outside walls', unit: 'mm', type: 'num', help: 'Extends the base beyond the walls.' },
    { k: 'base.margin', label: 'End margin', unit: 'mm', type: 'num', help: 'Base length beyond the prong heads when length is auto.' },
    { k: 'walls.thickness', label: 'Wall thickness', dim: 'WT', unit: 'mm', type: 'num', help: 'Also the thread length for the prong screws (minus 1 mm).' },
    { k: 'walls.height', label: 'Wall height', dim: 'WH', unit: 'mm', type: 'num', auto: true, help: 'auto = as low as the windows and screws allow.' },
    { k: 'walls.sides', label: 'Walls', type: 'sides', help: 'auto = walls where prongs need them. A wall without prongs works as a side stop.' },
  ] },
  { title: 'Fit', when: P, fields: [
    { k: 'fit.side', label: 'Side play (each side)', dim: 'FS', unit: 'mm', type: 'num', help: 'Gap between device and each wall.' },
    { k: 'fit.top', label: 'Top gap', dim: 'FT', unit: 'mm', type: 'num', help: 'Gap between device top and adapter base.' },
    { k: 'fit.window', label: 'Window clearance', unit: 'mm', type: 'num', help: 'Clearance around each prong in the wall windows.' },
  ] },
  { title: 'Plate', open: true, when: L, custom: 'plateHoles', fields: [
    { k: 'plate.width', label: 'Width (X)', unit: 'mm', type: 'num', help: 'Plate size across.' },
    { k: 'plate.length', label: 'Length (Y)', unit: 'mm', type: 'num', help: 'Plate size along.' },
    { k: 'base.thickness', label: 'Thickness', unit: 'mm', type: 'num', auto: true, help: 'auto = just deep enough for the dovetail channel.' },
    { k: 'plate.hole', label: 'Hole diameter', unit: 'mm', type: 'num', help: 'Pilot hole for screws from the device side (keyholes), or clearance hole for screws into the device.' },
    { k: 'plate.head', label: 'Countersink diameter', unit: 'mm', type: 'num', help: 'Countersink on the rail side for screws going into the device. 0 = none.' },
  ] },
  { title: 'Desk rail', open: true, fields: [
    { k: 'rail.axis', label: 'Slide direction', type: 'select', options: [['y', 'Y (along the walls)'], ['x', 'X (across)']],
      help: 'The device is pushed in towards +axis; the stop and lock screw are at the front (-axis) end.' },
    { k: 'rail.positions', label: 'Rail positions', dim: 'RP', unit: 'mm', type: 'numlist', help: 'Rail centre offsets across the slide direction, e.g. "-50, 50" for two rails.' },
    { k: 'rail.length', label: 'Rail length', dim: 'RL', unit: 'mm', type: 'num', auto: true, help: 'auto = the full adapter channel.' },
    { k: 'rail.thickness', label: 'Rail plate thickness', unit: 'mm', type: 'num', help: 'Plate screwed to the desk.' },
    { k: 'rail.detent', label: 'Detent ridge height', unit: 'mm', type: 'num', help: 'Click strength. 0 = no detent. Tune with the fit test.' },
    { k: 'rail.detent_distance', label: 'Detent before stop', unit: 'mm', type: 'num', help: 'How far before the end of travel it clicks.' },
    { k: 'rail.lock_screw', label: 'Lock screw', type: 'bool', help: 'M3 screw through the adapter front into the tongue.' },
    { k: 'rail.holes.diameter', label: 'Desk screw hole', unit: 'mm', type: 'num', help: 'Through hole for the wood screws into the desk.' },
    { k: 'rail.holes.head', label: 'Desk screw head', unit: 'mm', type: 'num', help: 'Countersink diameter.' },
    { k: 'rail.holes.count', label: 'Desk screws per side', type: 'int', auto: true, help: 'auto = about one every 80 mm, at least 2.' },
  ] },
  { title: 'Prong retention', when: P, fields: [
    { k: 'head.style', label: 'Retention', type: 'select', options: [['bar', 'Head bar + screw'], ['none', 'Flush, held by the device']],
      help: 'Head bar: prongs of one side are joined by a bar outside the wall and screwed to it. Flush: plain prongs end flush with the walls and something on the device (e.g. side panels) stops them sliding out.' },
    { k: 'walls.below', label: 'Wall below windows (flush)', unit: 'mm', type: 'num', help: 'Wall material below the prong windows when the retention is flush.' },
    { k: 'head.inset', label: 'Flush inset', unit: 'mm', type: 'num', help: 'Flush prongs stop this far inside the outer wall faces.' },
    { k: 'head.thickness', label: 'Head bar thickness', unit: 'mm', type: 'num', help: 'Bar outside the wall that joins the prongs of one side.' },
    { k: 'head.margin', label: 'Head bar margin', unit: 'mm', type: 'num', help: 'Head bar length beyond the outer prongs.' },
    { k: 'head.screws', label: 'Screws per head bar', type: 'int', auto: true, help: 'auto = 1 below 50 mm bar length, else 2.' },
    { k: 'through_protrusion', label: 'Through-prong protrusion', unit: 'mm', type: 'num', help: 'How far a through-prong sticks out of wall B.' },
  ] },
  { title: 'Screws (M3)', advanced: true, fields: [
    { k: 'screw.clearance', label: 'Clearance hole', unit: 'mm', type: 'num', help: 'Hole the screw passes through.' },
    { k: 'screw.pilot', label: 'Pilot hole', unit: 'mm', type: 'num', help: 'Hole the self-tapping screw cuts its thread into.' },
    { k: 'screw.head', label: 'Head diameter', unit: 'mm', type: 'num', help: 'Used to size the head bars.' },
    { k: 'screw.edge', label: 'Edge distance', unit: 'mm', type: 'num', help: 'Material around screw holes.' },
  ] },
  { title: 'Dovetail', advanced: true, fields: [
    { k: 'dovetail.neck', label: 'Neck width', unit: 'mm', type: 'num', help: 'Tongue width where it leaves the rail plate.' },
    { k: 'dovetail.neck_height', label: 'Neck height', unit: 'mm', type: 'num', help: 'Straight part before the 45° flare.' },
    { k: 'dovetail.flare', label: 'Flare', unit: 'mm', type: 'num', help: '45° flare height = widening per side.' },
    { k: 'dovetail.land', label: 'Land', unit: 'mm', type: 'num', help: 'Straight part at the tongue tip.' },
    { k: 'dovetail.clearance', label: 'Clearance', unit: 'mm', type: 'num', help: 'Play between tongue and channel. Tune with the fit test.' },
    { k: 'dovetail.lip', label: 'Lip width', unit: 'mm', type: 'num', help: 'Material kept beside the channel.' },
    { k: 'dovetail.floor', label: 'Floor', unit: 'mm', type: 'num', help: 'Material between channel and device side.' },
    { k: 'dovetail.stop', label: 'Front stop', unit: 'mm', type: 'num', help: 'Closed front end of the channel; the lock screw passes through it.' },
  ] },
  { title: 'Strength & printer', advanced: true, fields: [
    { k: 'strength.allowable', label: 'Allowable stress', unit: 'MPa', type: 'num', when: P, help: 'Kept low because PLA / PETG creep under constant load.' },
    { k: 'strength.load_factor', label: 'Load factor', type: 'num', when: P, help: 'Multiplier on the device weight.' },
    { k: 'printer.bed', label: 'Bed size', unit: 'mm', type: 'numlist', help: 'Width, depth. Parts that do not fit get a warning.' },
  ] },
];

const TEMPLATES = {
  prongs: { adapter: 'prongs', device: { width: 120, mass: 1 }, prongs: [{ side: 'through', y: 0 }] },
  plate: { adapter: 'plate', plate: { width: 40, length: 80 } },
};

const THEMES = {
  dark: {
    adapter: '#a9aaa7', rail: '#ffd300', prongs: ['#f2f1ec', '#ff9f43', '#6fb1ff', '#ff6b6b'],
    edge: 0x0b0b0b, edgeOpacity: 0.55, grid: [0x5c5c5c, 0x363636], ghost: 0xc9c6bb, arrow: 0xffd300, desk: 0xc89f72,
  },
  light: {
    adapter: '#a3a4a6', rail: '#ffd300', prongs: ['#3a3a3a', '#e07b00', '#2f6fde', '#c2373b'],
    edge: 0x202020, edgeOpacity: 0.4, grid: [0x9a978d, 0xcfccc2], ghost: 0x5f5c54, arrow: 0xb38f00, desk: 0xc89f72,
  },
};
const THEME_MODES = ['dark', 'light', 'system'];
const THEME_LABELS = { dark: '☾ Dark', light: '☀ Light', system: '◐ System' };

const palette = () => THEMES[document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function colorFor(label, prongLabels) {
  const t = palette();
  if (label === 'adapter') return t.adapter;
  if (label.startsWith('rail')) return t.rail;
  return t.prongs[Math.max(0, prongLabels.indexOf(label)) % t.prongs.length];
}

const PRONG_COLS = [
  { k: 'side', label: 'Side', type: 'side' },
  { k: 'y', label: 'Y', def: 0, dim: 'PY' },
  { k: 'count', label: 'Count', def: 1, int: true },
  { k: 'pitch', label: 'Pitch', def: '', dim: 'PP' },
  { k: 'length', label: 'Length', from: 'length', dim: 'PL' },
  { k: 'width', label: 'Width', from: 'width', dim: 'PW' },
  { k: 'thickness', label: 'Thick', from: 'thickness', dim: 'PT' },
  { k: 'offset', label: 'Offset', from: 'offset', dim: 'PO' },
  { k: 'group', label: 'Part', text: true },
];

const DIM_NAMES = {
  DW: 'device width, wall to wall', FS: 'side play, each side', FT: 'gap device top to base', RP: 'rail offset from centre',
  BL: 'base length, along the walls', BT: 'base thickness', WT: 'wall thickness', WH: 'wall height below the base',
  PW: 'prong width', PT: 'prong thickness', PO: 'device top to top of channel', PL: 'blind prong depth',
  PY: 'prong row position', PP: 'spacing in a row', RL: 'rail length',
};

function dimBadge(code) {
  const b = document.createElement('span');
  b.className = 'dimcode';
  b.textContent = code;
  b.title = `${code}: ${DIM_NAMES[code] || ''} (click to show in the dimension guide)`;
  b.addEventListener('click', (ev) => { ev.preventDefault(); guide.show(code); });
  return b;
}

const state = {
  defaults: null,
  configs: [],
  name: null,
  values: {},
  saved: '{}',
  result: null,
  live: true,
  view: 'assembly',
  hidden: new Set(),
  refreshers: [],
};

const $ = (sel) => document.querySelector(sel);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem('deskmount.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('deskmount.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};

/* ---------- value helpers ---------- */

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { if (typeof o[k] !== 'object' || o[k] === null || Array.isArray(o[k])) o[k] = {}; o = o[k]; });
  o[keys.at(-1)] = value;
}

function delPath(obj, path) {
  const keys = path.split('.');
  const stack = [];
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o || typeof o !== 'object') return;
    stack.push([o, k]);
    o = o[k];
  }
  if (o && typeof o === 'object') delete o[keys.at(-1)];
  for (let i = stack.length - 1; i >= 0; i--) {
    const [parent, k] = stack[i];
    if (parent[k] && typeof parent[k] === 'object' && Object.keys(parent[k]).length === 0) delete parent[k];
  }
}

const effective = (path) => getPath(state.values, path) ?? getPath(state.defaults, path);
const adapterType = () => String(effective('adapter'));
const fmt = (v) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- form ---------- */

function buildForm() {
  const form = $('#form');
  form.innerHTML = '';
  state.refreshers = [];
  const openState = store.get('sections', {});
  for (const sec of SECTIONS) {
    const det = document.createElement('details');
    det.className = 'section';
    det.open = openState[sec.title] ?? !!sec.open;
    det.addEventListener('toggle', () => { const s = store.get('sections', {}); s[sec.title] = det.open; store.set('sections', s); });
    if (sec.when) det.dataset.when = sec.when;
    const sum = document.createElement('summary');
    sum.textContent = sec.title;
    if (sec.advanced) sum.insertAdjacentHTML('beforeend', '<span class="tag">advanced</span>');
    det.appendChild(sum);
    const body = document.createElement('div');
    body.className = 'body';
    for (const f of sec.fields) body.appendChild(fieldRow(f));
    if (sec.custom === 'prongs') body.appendChild(prongTable());
    if (sec.custom === 'plateHoles') body.appendChild(holeTable());
    det.appendChild(body);
    form.appendChild(det);
  }
  applyWhen();
}

function applyWhen() {
  const type = adapterType();
  document.querySelectorAll('#form [data-when]').forEach((el) => { el.hidden = el.dataset.when !== type; });
}

function defaultText(f) {
  const d = getPath(state.defaults, f.k);
  if (d === null || d === undefined) return f.nullable ? 'auto' : '';
  if (f.type === 'sides') return d === 'auto' ? 'auto' : fmt(d);
  return fmt(d);
}

function fieldRow(f) {
  const row = document.createElement('div');
  row.className = 'field';
  if (f.when) row.dataset.when = f.when;
  const id = 'f_' + f.k.replace(/\./g, '_') + '_' + Math.random().toString(36).slice(2, 6);
  const label = document.createElement('label');
  label.htmlFor = id;
  label.innerHTML = `<span class="txt"></span>`;
  label.querySelector('.txt').textContent = f.label;
  if (f.dim) {
    row.dataset.dim = f.dim;
    label.appendChild(dimBadge(f.dim));
  }
  const ctl = document.createElement('div');
  ctl.className = 'ctl';
  let input;
  if (f.type === 'select' || f.type === 'sides') {
    input = document.createElement('select');
    const opts = f.type === 'sides' ? [['auto', 'auto'], ['a', 'A only'], ['b', 'B only'], ['a,b', 'A and B']] : f.options;
    for (const [v, t] of opts) input.add(new Option(t, v));
  } else if (f.type === 'bool') {
    input = document.createElement('input');
    input.type = 'checkbox';
    ctl.classList.add('check');
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.inputMode = f.type === 'numlist' ? 'text' : 'decimal';
    input.placeholder = defaultText(f);
  }
  input.id = id;
  ctl.appendChild(input);
  if (f.unit) ctl.insertAdjacentHTML('beforeend', `<span class="unit">${f.unit}</span>`);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset';
  reset.title = 'Reset to default';
  reset.textContent = '↺';
  const help = document.createElement('div');
  help.className = 'help';
  help.textContent = f.help || '';
  row.append(label, ctl, reset, help);

  const refresh = () => {
    const v = getPath(state.values, f.k);
    row.classList.toggle('overridden', v !== undefined);
    row.classList.remove('invalid');
    if (document.activeElement === input && f.type !== 'select' && f.type !== 'sides' && f.type !== 'bool') return;
    if (f.type === 'bool') input.checked = !!effective(f.k);
    else if (f.type === 'sides') { const e = effective(f.k); input.value = e === 'auto' ? 'auto' : [...e].sort().join(','); }
    else if (f.type === 'select') input.value = String(effective(f.k));
    else input.value = fmt(v);
  };
  state.refreshers.push(refresh);

  const commit = (value) => {
    if (value === undefined || sameValue(value, getPath(state.defaults, f.k))) delPath(state.values, f.k);
    else setPath(state.values, f.k, value);
    row.classList.toggle('overridden', getPath(state.values, f.k) !== undefined);
    if (f.k === 'adapter') { applyWhen(); }
    if (f.k.startsWith('prong.')) renderProngRows();
    changed();
  };

  input.addEventListener(f.type === 'select' || f.type === 'sides' || f.type === 'bool' ? 'change' : 'input', () => {
    if (f.type === 'bool') return commit(input.checked);
    if (f.type === 'select') return commit(input.value);
    if (f.type === 'sides') return commit(input.value === 'auto' ? 'auto' : input.value.split(','));
    const text = input.value.trim();
    const parsed = parseField(f, text);
    row.classList.toggle('invalid', parsed === INVALID);
    if (parsed !== INVALID) commit(parsed);
  });
  input.addEventListener('blur', refresh);
  reset.addEventListener('click', () => { delPath(state.values, f.k); refresh(); if (f.k === 'adapter') applyWhen(); if (f.k.startsWith('prong.')) renderProngRows(); changed(); });
  refresh();
  return row;
}

const INVALID = Symbol('invalid');

function parseField(f, text) {
  if (text === '') return undefined;
  if (f.auto && text.toLowerCase() === 'auto') return 'auto';
  if (f.type === 'numlist') {
    const parts = text.split(/[,;\s]+/).filter(Boolean).map(Number);
    return parts.length && parts.every(Number.isFinite) ? parts : INVALID;
  }
  const n = Number(text.replace(',', '.'));
  if (!Number.isFinite(n)) return INVALID;
  if (f.type === 'int') return Number.isInteger(n) && n > 0 ? n : INVALID;
  return n;
}

/* prongs table */

let prongBody = null;

function prongTable() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="note" style="margin:6px 0 4px">Empty cells use the defaults above. Count + pitch make a row of prongs centred on Y. Rows with the same part name print as one piece.</div>
    <div class="cards"></div>`;
  prongBody = wrap.querySelector('.cards');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  add.textContent = '+ Add prong row';
  add.addEventListener('click', () => {
    const rows = getPath(state.values, 'prongs') || [];
    rows.push({ side: rows.at(-1)?.side || 'a', y: 0 });
    state.values.prongs = rows;
    renderProngRows();
    changed();
  });
  wrap.appendChild(add);
  state.refreshers.push(renderProngRows);
  return wrap;
}

function renderProngRows() {
  if (!prongBody) return;
  const rows = getPath(state.values, 'prongs') || [];
  prongBody.innerHTML = '';
  rows.forEach((row, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'card-head';
    head.innerHTML = `<span class="card-title">Row ${idx + 1}</span>`;
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for (const c of PRONG_COLS) {
      let input;
      if (c.type === 'side') {
        input = document.createElement('select');
        input.title = 'Side: A / B = blind prongs from that wall, through = from wall A through to wall B';
        for (const [v, t] of [['a', 'Side A'], ['b', 'Side B'], ['through', 'Through A → B']]) input.add(new Option(t, v));
        input.value = row.side || 'a';
        input.addEventListener('change', () => { row.side = input.value; renderProngRows(); changed(); });
        head.appendChild(input);
        continue;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.inputMode = c.text ? 'text' : 'decimal';
        input.value = fmt(row[c.k]);
        const def = c.from ? effective('prong.' + c.from) : c.def;
        input.placeholder = c.k === 'group' ? (row.side === 'b' ? 'b' : 'a') : fmt(def);
        if (c.k === 'length' && row.side === 'through') { input.disabled = true; input.placeholder = 'full'; input.value = ''; }
        input.addEventListener('input', () => {
          const text = input.value.trim();
          let value;
          if (text === '') value = undefined;
          else if (c.text) value = /^[A-Za-z0-9_-]+$/.test(text) ? text : INVALID;
          else { value = Number(text.replace(',', '.')); if (!Number.isFinite(value) || (c.int && !(Number.isInteger(value) && value > 0))) value = INVALID; }
          input.classList.toggle('invalid', value === INVALID);
          if (value === INVALID) return;
          if (value === undefined) delete row[c.k]; else row[c.k] = value;
          changed();
        });
      }
      const cell = document.createElement('label');
      cell.className = 'mini';
      cell.innerHTML = `<span>${c.label}</span>`;
      if (c.dim) {
        cell.dataset.dim = c.dim;
        cell.firstChild.appendChild(dimBadge(c.dim));
      }
      cell.appendChild(input);
      grid.appendChild(cell);
    }
    const dup = document.createElement('button');
    dup.type = 'button';
    dup.className = 'icon';
    dup.title = 'Duplicate row';
    dup.textContent = '⧉';
    dup.addEventListener('click', () => { rows.splice(idx + 1, 0, { ...row }); renderProngRows(); changed(); });
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon';
    del.title = 'Remove row';
    del.textContent = '✕';
    del.addEventListener('click', () => { rows.splice(idx, 1); if (!rows.length) delete state.values.prongs; renderProngRows(); changed(); });
    head.append(dup, del);
    card.append(head, grid);
    prongBody.appendChild(card);
  });
}

/* plate holes table */

let holeBody = null;

function holeTable() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="note" style="margin:6px 0 4px">Holes for the device, relative to the plate centre.</div>
    <table class="tbl"><thead><tr><th>X</th><th>Y</th><th></th></tr></thead><tbody></tbody></table>`;
  holeBody = wrap.querySelector('tbody');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add';
  add.textContent = '+ Add hole';
  add.addEventListener('click', () => {
    const rows = getPath(state.values, 'plate.holes') || [];
    rows.push([0, 0]);
    setPath(state.values, 'plate.holes', rows);
    renderHoleRows();
    changed();
  });
  wrap.appendChild(add);
  state.refreshers.push(renderHoleRows);
  return wrap;
}

function renderHoleRows() {
  if (!holeBody) return;
  const rows = getPath(state.values, 'plate.holes') || [];
  holeBody.innerHTML = '';
  holeBody.closest('table').querySelector('thead').hidden = !rows.length;
  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    [0, 1].forEach((j) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = fmt(row[j]);
      input.addEventListener('input', () => {
        const n = Number(input.value.trim().replace(',', '.'));
        const ok = input.value.trim() !== '' && Number.isFinite(n);
        input.classList.toggle('invalid', !ok);
        if (ok) { row[j] = n; changed(); }
      });
      td.appendChild(input);
      tr.appendChild(td);
    });
    const del = document.createElement('td');
    del.innerHTML = '<button type="button" class="icon" title="Remove hole">✕</button>';
    del.firstChild.addEventListener('click', () => { rows.splice(idx, 1); if (!rows.length) delPath(state.values, 'plate.holes'); renderHoleRows(); changed(); });
    tr.appendChild(del);
    holeBody.appendChild(tr);
  });
}

function refreshForm() {
  state.refreshers.forEach((r) => r());
  applyWhen();
}

/* ---------- config handling ---------- */

async function api(path, body) {
  const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.status = res.status; err.config = data.config; throw err; }
  return data;
}

function isDirty() { return JSON.stringify(state.values) !== state.saved; }

function changed() {
  $('#dirty').hidden = !isDirty();
  scheduleBuild();
}

function fillConfigSelect() {
  const sel = $('#configSelect');
  sel.innerHTML = '';
  if (!state.name) sel.add(new Option('untitled (not saved)', ''));
  for (const c of state.configs) sel.add(new Option(c, c));
  sel.value = state.name || '';
}

function setConfig(name, values) {
  state.name = name;
  state.values = structuredClone(values || {});
  delete state.values.name;
  state.saved = name ? JSON.stringify(state.values) : '';
  fillConfigSelect();
  refreshForm();
  $('#dirty').hidden = !isDirty();
  state.exported = null;
  if (name) store.set('last', name);
  firstFit = true;
  runBuild();
}

async function loadConfig(name) {
  const data = await api(`/api/config?name=${encodeURIComponent(name)}`);
  setConfig(data.name, data.values);
}

function confirmDiscard() {
  return !isDirty() || confirm('Discard unsaved changes?');
}

async function save(asNew) {
  let name = state.name;
  let overwrite = true;
  if (asNew || !name) {
    name = await askName(asNew && state.name ? state.name + '_copy' : '');
    if (!name) return;
    overwrite = false;
  }
  try {
    const data = await api('/api/save', { name, values: state.values, overwrite });
    state.configs = data.configs;
    state.name = name;
    state.saved = JSON.stringify(state.values);
    store.set('last', name);
    fillConfigSelect();
    $('#dirty').hidden = true;
    toast(`Saved configs/${name}.yaml`);
  } catch (e) {
    if (e.status === 409 && confirm(`${name} already exists. Overwrite it?`)) {
      const data = await api('/api/save', { name, values: state.values, overwrite: true });
      state.configs = data.configs;
      state.name = name;
      state.saved = JSON.stringify(state.values);
      fillConfigSelect();
      $('#dirty').hidden = true;
      toast(`Saved configs/${name}.yaml`);
    } else if (e.status !== 409) {
      showError(e.message);
    }
  }
}

function askName(initial) {
  const dlg = $('#nameDialog');
  const input = $('#nameInput');
  input.value = initial;
  return new Promise((resolve) => {
    const done = (v) => { dlg.close(); resolve(v); };
    $('#nameCancel').onclick = () => done(null);
    $('#nameForm').onsubmit = (ev) => { ev.preventDefault(); if (input.checkValidity()) done(input.value.trim()); };
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
    input.select();
  });
}

/* ---------- building ---------- */

let buildTimer = null;
let building = false;
let pending = false;
let buildSeq = 0;
let firstFit = true;

function scheduleBuild() {
  clearTimeout(buildTimer);
  if (!state.live) { $('.viewer').classList.add('stale'); return; }
  buildTimer = setTimeout(runBuild, 450);
}

async function runBuild() {
  clearTimeout(buildTimer);
  if (building) { pending = true; return; }
  building = true;
  pending = false;
  const seq = ++buildSeq;
  $('#busy').hidden = false;
  try {
    const result = await api('/api/build', { name: state.name || 'untitled', values: state.values });
    if (seq === buildSeq) {
      state.result = result;
      hideError();
      $('.viewer').classList.remove('stale');
      viewer.setResult(result);
      renderReport();
    }
  } catch (e) {
    showError(e.message);
    $('.viewer').classList.add('stale');
    renderReport(e.message);
  } finally {
    building = false;
    $('#busy').hidden = true;
    if (pending) runBuild();
  }
}

function showError(msg) { const b = $('#errorBanner'); b.textContent = msg; b.hidden = false; }
function hideError() { $('#errorBanner').hidden = true; }

let toastTimer = null;
function toast(msg) {
  const b = $('#busy');
  b.innerHTML = `✓ ${msg}`;
  b.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { b.hidden = true; b.innerHTML = '<span class="spinner"></span>Building…'; }, 1800);
}

/* ---------- report ---------- */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderReport(error) {
  const r = state.result;
  const el = $('#report');
  const name = state.name || 'untitled';
  let html = `<div class="status"><span class="name">${esc(name)}</span>`;
  html += r ? `<span class="muted">built in ${(r.ms / 1000).toFixed(1)} s</span>` : '';
  html += '</div>';
  if (error) html += `<div class="warn" style="background:var(--bad-soft);color:var(--bad)">${esc(error)}</div>`;
  if (!r) { el.innerHTML = html + '<p class="empty">Nothing built yet.</p>'; return; }
  if (error) html += '<p class="empty">Showing the last successful build.</p>';
  html += `<div class="kpis">
    <div class="kpi"><div class="v">${r.material.cm3}</div><div class="l">cm³ solid</div></div>
    <div class="kpi"><div class="v">~${r.material.pla} g</div><div class="l">PLA, 100 % infill</div></div>
    <div class="kpi"><div class="v">${r.rail.count * r.rail.screws}</div><div class="l">desk screws</div></div>
  </div>`;
  if (r.warnings.length) {
    html += '<h2>Warnings</h2>' + r.warnings.map((w) => `<div class="warn">${esc(w)}</div>`).join('');
  }
  html += '<h2>Parts to print</h2><table class="rtable"><thead><tr><th>Part</th><th class="num">Qty</th><th class="num">Size mm</th><th class="num">cm³</th></tr></thead><tbody>';
  for (const p of r.parts) html += `<tr><td>${esc(p.label)}</td><td class="num">${p.count}</td><td class="num">${p.size.map((v) => Math.round(v)).join(' × ')}</td><td class="num">${p.volume}</td></tr>`;
  html += '</tbody></table>';
  if (r.strength.length) {
    html += `<h2>Prong strength</h2><table class="rtable"><thead><tr><th>Prong</th><th>Load case</th><th class="num">N</th><th class="num">MPa</th><th></th></tr></thead><tbody>`;
    for (const s of r.strength) html += `<tr><td>${esc(s.label)} ${esc(s.side)}</td><td>${esc(s.kind)}</td><td class="num">${s.load}</td><td class="num">${s.stress}</td><td><span class="badge ${s.ok ? 'ok' : 'bad'}">${s.ok ? 'ok' : 'high'}</span></td></tr>`;
    html += `</tbody></table><p class="note">Allowable ${r.allowable} MPa (creep-safe for PLA / PETG).</p>`;
  }
  html += `<h2>Mounting</h2><dl class="facts">
    <dt>Rails</dt><dd>${r.rail.count} × ${r.rail.length} mm, slide along ${r.rail.axis.toUpperCase()}</dd>
    <dt>Desk screws</dt><dd>${r.rail.screws} per rail, countersunk</dd>
    <dt>Locking</dt><dd>${esc(r.locking)}</dd>
  </dl>`;
  html += `<details class="raw"><summary>Full report</summary><pre>${esc(r.details.join('\n'))}</pre></details>`;
  html += '<h2>Export</h2>';
  if (state.exported && state.exported.name === (state.name || 'untitled')) {
    const ex = state.exported;
    html += `<div class="file-actions"><a href="/api/zip/${encodeURIComponent(ex.name)}"><button type="button">Download ZIP</button></a><button type="button" id="openFolder">Open folder</button></div><div class="files">`;
    for (const f of ex.files) html += `<a href="/out/${encodeURIComponent(ex.name)}/${encodeURIComponent(f)}" ${f.endsWith('.png') || f.endsWith('.txt') ? 'target="_blank"' : ''}>${esc(f)}</a>`;
    html += '</div>';
    const png = ex.files.find((f) => f.endsWith('_preview.png'));
    if (png) html += `<img class="preview-img" alt="Preview" src="/out/${encodeURIComponent(ex.name)}/${encodeURIComponent(png)}?t=${Date.now()}">`;
  } else {
    html += '<p class="empty">Export writes STL files (print orientation), a STEP assembly, a preview and the report to out/&lt;name&gt;/.</p>';
  }
  el.innerHTML = html;
  const open = $('#openFolder');
  if (open) open.addEventListener('click', () => api('/api/open', { name: state.exported.name }).catch((e) => showError(e.message)));
}

async function exportFiles() {
  if (!state.name) {
    const name = await askName('');
    if (!name) return;
    state.name = name;
    fillConfigSelect();
  }
  const btn = $('#exportBtn');
  btn.disabled = true;
  btn.textContent = 'Exporting…';
  try {
    state.exported = await api('/api/export', { name: state.name, values: state.values });
    renderReport();
    toast(`Exported to out/${state.name}/`);
  } catch (e) {
    showError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export files';
  }
}

/* ---------- 3D viewer ---------- */

const viewer = (() => {
  const host = $('#canvasHost');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  camera.up.set(0, 1, 0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(300, 500, 400);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-400, -200, -300);
  scene.add(fill);

  const assembly = new THREE.Group();
  assembly.rotation.x = Math.PI / 2;
  const layout = new THREE.Group();
  layout.rotation.x = -Math.PI / 2;
  scene.add(assembly, layout);
  let grid = null;
  function makeGrid() {
    const keep = grid ? { visible: grid.visible, position: grid.position.clone() } : null;
    if (grid) dispose(grid);
    grid = new THREE.GridHelper(1000, 100, ...palette().grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    if (keep) { grid.visible = keep.visible; grid.position.copy(keep.position); }
    scene.add(grid);
  }

  const clipPlanes = [];
  let parts = [];
  let extras = [];
  let explode = 0;

  function material(color, opts = {}) {
    const c = new THREE.Color(color);
    const cut = c.clone().multiplyScalar(0.55);
    const m = new THREE.MeshStandardMaterial({
      color: c, roughness: 0.62, metalness: 0.04, side: THREE.DoubleSide, flatShading: true,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipPlanes, ...opts,
    });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
        `#include <dithering_fragment>\n if (!gl_FrontFacing) gl_FragColor = vec4(${cut.r.toFixed(3)}, ${cut.g.toFixed(3)}, ${cut.b.toFixed(3)}, 1.0);`);
    };
    return m;
  }

  function geometry(item) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(item.p, 3));
    g.setIndex(item.i);
    g.computeVertexNormals();
    return g;
  }

  function partMesh(item, key, color) {
    const g = geometry(item);
    const mesh = new THREE.Mesh(g, material(color));
    const t = palette();
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25),
      new THREE.LineBasicMaterial({ color: t.edge, transparent: true, opacity: t.edgeOpacity, clippingPlanes: clipPlanes }));
    const obj = new THREE.Group();
    obj.add(mesh, edges);
    obj.userData = { key, label: item.label, bbox: item.bbox, explode: item.explode || [0, 0, 0] };
    mesh.userData = obj.userData;
    return obj;
  }

  function dispose(obj) {
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    obj.removeFromParent();
  }

  function keyOf(label) { return label.startsWith('rail') ? 'rail' : label; }

  function setResult(r) {
    parts.forEach(dispose);
    extras.forEach(dispose);
    parts = [];
    extras = [];
    const t = palette();
    const prongLabels = r.assembly.filter((a) => a.role === 'prongs').map((a) => a.label);
    for (const item of r.assembly) {
      const obj = partMesh(item, keyOf(item.label), colorFor(item.label, prongLabels));
      assembly.add(obj);
      parts.push(obj);
    }
    for (const item of r.layout) {
      const obj = partMesh(item, keyOf(item.label), colorFor(item.label, prongLabels));
      layout.add(obj);
      parts.push(obj);
    }
    const [x0, x1, y0, y1, z0, z1] = r.ghost;
    const ghostGeo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    const ghost = new THREE.Group();
    ghost.add(new THREE.Mesh(ghostGeo, new THREE.MeshBasicMaterial({ color: t.ghost, transparent: true, opacity: 0.06, depthWrite: false })));
    const ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(ghostGeo), new THREE.LineDashedMaterial({ color: t.ghost, dashSize: 6, gapSize: 4 }));
    ghostEdges.computeLineDistances();
    ghost.add(ghostEdges);
    ghost.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    ghost.userData = { key: 'device' };
    assembly.add(ghost);
    extras.push(ghost);

    const box = new THREE.Box3();
    r.assembly.forEach((a) => box.union(new THREE.Box3(new THREE.Vector3(a.bbox[0], a.bbox[1], a.bbox[2]), new THREE.Vector3(a.bbox[3], a.bbox[4], a.bbox[5]))));
    const pad = 40;
    const deskGeo = new THREE.BoxGeometry(box.max.x - box.min.x + 2 * pad, box.max.y - box.min.y + 2 * pad, 18);
    const desk = new THREE.Group();
    desk.add(new THREE.Mesh(deskGeo, new THREE.MeshStandardMaterial({ color: t.desk, roughness: 0.8, transparent: true, opacity: 0.28, depthWrite: false })));
    desk.add(new THREE.LineSegments(new THREE.EdgesGeometry(deskGeo), new THREE.LineBasicMaterial({ color: 0x9a7650, transparent: true, opacity: 0.6 })));
    desk.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, r.deskZ - 9);
    desk.userData = { key: 'desk' };
    assembly.add(desk);
    extras.push(desk);

    const arrow = new THREE.ArrowHelper(new THREE.Vector3(...r.arrow.dir), new THREE.Vector3(...r.arrow.origin), 30, t.arrow, 9, 6);
    arrow.userData = { key: 'arrow' };
    assembly.add(arrow);
    extras.push(arrow);

    applyExplode();
    applyVisibility();
    buildLegend(r);
    setView(state.view, firstFit);
    firstFit = false;
  }

  function applyExplode() {
    for (const obj of parts) {
      if (obj.parent !== assembly) continue;
      const e = obj.userData.explode;
      obj.position.set(e[0] * explode, e[1] * explode, e[2] * explode);
    }
  }

  function applyVisibility() {
    for (const obj of [...parts, ...extras]) obj.visible = !state.hidden.has(obj.userData.key);
  }

  function buildLegend(r) {
    const el = $('#legend');
    const items = [];
    const seen = new Set();
    const t = palette();
    const prongLabels = r.assembly.filter((a) => a.role === 'prongs').map((a) => a.label);
    for (const a of r.assembly) {
      const key = keyOf(a.label);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ key, label: key === 'rail' ? (r.rail.count > 1 ? `rails (${r.rail.count})` : 'rail') : a.label.replace('_', ' '), color: colorFor(a.label, prongLabels) });
    }
    items.push({ key: 'device', label: 'device', color: hex(t.ghost) }, { key: 'desk', label: 'desk', color: hex(t.desk) });
    el.innerHTML = '';
    for (const it of items) {
      const chip = document.createElement('span');
      chip.className = 'chip' + (state.hidden.has(it.key) ? ' off' : '');
      if (it.key === 'device' || it.key === 'desk') chip.dataset.only = 'assembly';
      chip.innerHTML = `<span class="sw" style="background:${it.color}"></span>${esc(it.label)}`;
      chip.addEventListener('click', () => {
        if (state.hidden.has(it.key)) state.hidden.delete(it.key); else state.hidden.add(it.key);
        chip.classList.toggle('off');
        if (it.key === 'desk') state.hidden.has('desk') ? state.hidden.add('arrow') : state.hidden.delete('arrow');
        applyVisibility();
      });
      el.appendChild(chip);
    }
    syncOnly();
  }

  function syncOnly() {
    document.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== state.view; });
  }

  function activeGroup() { return state.view === 'layout' ? layout : assembly; }

  function setView(view, refit = true) {
    state.view = view;
    store.set('view', view);
    assembly.visible = view === 'assembly';
    layout.visible = view === 'layout';
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    syncOnly();
    const box = new THREE.Box3().setFromObject(activeGroup());
    grid.visible = view === 'layout';
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      grid.position.set(c.x, -0.05, c.z);
    }
    updateSection();
    if (refit) fit();
  }

  function fit() {
    const box = new THREE.Box3().setFromObject(activeGroup());
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = state.view === 'layout' ? new THREE.Vector3(0.35, 1.0, 0.9) : new THREE.Vector3(0.9, 0.55, 1.25);
    dir.normalize();
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = radius / Math.sin(Math.min(vHalf, hHalf)) * 1.02;
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.near = Math.max(0.5, dist / 100);
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
  }

  function updateSection() {
    const axis = $('#sectionAxis').value;
    const pos = Number($('#sectionPos').value);
    $('#sectionPos').disabled = axis === 'off';
    clipPlanes.length = 0;
    if (axis !== 'off') {
      const box = new THREE.Box3().setFromObject(activeGroup());
      if (!box.isEmpty()) {
        if (axis === 'x') clipPlanes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), box.min.x + (box.max.x - box.min.x) * pos));
        else clipPlanes.push(new THREE.Plane(new THREE.Vector3(0, 0, -1), box.min.z + (box.max.z - box.min.z) * pos));
      }
    }
    scene.traverse((o) => { if (o.material && 'clippingPlanes' in o.material && o.material.clippingPlanes === clipPlanes) o.material.needsUpdate = true; });
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hover = $('#hoverLabel');
  let hoverRaf = 0;
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const meshes = [];
      activeGroup().traverseVisible((o) => { if (o.isMesh && o.userData.label) meshes.push(o); });
      const hit = raycaster.intersectObjects(meshes, false).find((h) => clipPlanes.every((p) => p.distanceToPoint(h.point) >= 0));
      if (!hit || ev.buttons) { hover.hidden = true; return; }
      const d = hit.object.userData;
      const b = d.bbox;
      hover.textContent = b ? `${d.label} · ${Math.round(b[3] - b[0])} × ${Math.round(b[4] - b[1])} × ${Math.round(b[5] - b[2])} mm` : d.label;
      hover.style.left = `${ev.clientX - rect.left + 14}px`;
      hover.style.top = `${ev.clientY - rect.top + 12}px`;
      hover.hidden = false;
    });
  });
  renderer.domElement.addEventListener('pointerleave', () => { hover.hidden = true; });

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function tick() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  makeGrid();

  return {
    setResult,
    setTheme() {
      makeGrid();
      if (state.result) setResult(state.result);
    },
    setView: (v) => setView(v, true),
    setExplode(v) { explode = v; applyExplode(); },
    updateSection,
    fit,
  };
})();

/* ---------- dimension guide ---------- */

const guide = (() => {
  const panel = $('#guide');
  const host = $('#guideSvg');
  let loading = null;
  let current = null;

  function highlight(code) {
    host.querySelectorAll('[data-dim]').forEach((el) => el.classList.toggle('on', !!code && el.dataset.dim === code));
  }

  function load() {
    if (!loading) {
      loading = fetch('dimensions.svg').then((r) => r.text()).then((text) => {
        host.innerHTML = text;
        host.querySelectorAll('.leg').forEach((g) => {
          g.addEventListener('mouseenter', () => highlight(g.dataset.dim));
          g.addEventListener('mouseleave', () => highlight(current));
          g.addEventListener('click', () => { current = g.dataset.dim; highlight(current); });
        });
        highlight(current);
      }).catch(() => { host.textContent = 'Could not load dimensions.svg'; });
    }
    return loading;
  }

  function setOpen(open) {
    panel.hidden = !open;
    $('#guideBtn').classList.toggle('on', open);
    store.set('guide', open);
    if (open) load();
  }

  return {
    init() {
      $('#guideBtn').addEventListener('click', () => setOpen(panel.hidden));
      $('#guideClose').addEventListener('click', () => setOpen(false));
      $('#form').addEventListener('focusin', (ev) => {
        const el = ev.target.closest('[data-dim]');
        current = el ? el.dataset.dim : null;
        highlight(current);
      });
      setOpen(store.get('guide', true));
    },
    show(code) {
      current = code;
      setOpen(true);
      load().then(() => highlight(code));
    },
  };
})();

/* ---------- wiring ---------- */

function wire() {
  $('#configSelect').addEventListener('change', async (ev) => {
    const name = ev.target.value;
    if (!name) return;
    if (!confirmDiscard()) { ev.target.value = state.name || ''; return; }
    try { await loadConfig(name); } catch (e) { showError(e.message); }
  });
  const menu = $('#newMenu');
  $('#newBtn').addEventListener('click', (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    menu.hidden = true;
    if (!confirmDiscard()) return;
    const t = b.dataset.template;
    setConfig(null, t === 'copy' ? state.values : TEMPLATES[t]);
    $('#dirty').hidden = false;
  }));
  $('#saveBtn').addEventListener('click', () => save(false));
  $('#saveAsBtn').addEventListener('click', () => save(true));
  $('#buildBtn').addEventListener('click', runBuild);
  $('#exportBtn').addEventListener('click', exportFiles);
  const live = $('#liveToggle');
  live.checked = state.live = store.get('live', true);
  live.addEventListener('change', () => { state.live = live.checked; store.set('live', state.live); if (state.live) runBuild(); });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => viewer.setView(b.dataset.view)));
  $('#explode').addEventListener('input', (ev) => viewer.setExplode(Number(ev.target.value)));
  $('#sectionAxis').addEventListener('change', viewer.updateSection);
  $('#sectionPos').addEventListener('input', viewer.updateSection);
  $('#fitBtn').addEventListener('click', viewer.fit);
  let themeMode = store.get('theme', 'dark');
  const applyTheme = () => {
    const light = themeMode === 'light' || (themeMode === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    $('#themeBtn').textContent = THEME_LABELS[themeMode];
    viewer.setTheme();
  };
  $('#themeBtn').addEventListener('click', () => {
    themeMode = THEME_MODES[(THEME_MODES.indexOf(themeMode) + 1) % THEME_MODES.length];
    store.set('theme', themeMode);
    applyTheme();
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (themeMode === 'system') applyTheme(); });
  applyTheme();
  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); save(false); }
  });
  window.addEventListener('beforeunload', (ev) => { if (isDirty()) { ev.preventDefault(); ev.returnValue = ''; } });
}

async function init() {
  wire();
  guide.init();
  state.view = store.get('view', 'assembly');
  try {
    const data = await api('/api/init');
    state.defaults = data.defaults;
    state.configs = data.configs;
    buildForm();
    const last = store.get('last', null);
    const first = state.configs.includes(last) ? last : state.configs[0];
    if (first) await loadConfig(first); else setConfig(null, TEMPLATES.prongs);
  } catch (e) {
    showError(`Cannot reach the DeskMount server: ${e.message}`);
  }
}

init();
