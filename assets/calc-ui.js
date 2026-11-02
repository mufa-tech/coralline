// Coralline web calculators: page wiring. The maths lives in reefcalc.js (a port of the app's
// engine, packages/reef_chem). Adapted from Tubwise's tools/site/static/calc-ui.js.
// Reads the page's strings from <script type="application/json" id="calc-i18n">, recomputes on
// every input and writes each result into its own aria-live box. Nothing is stored or sent.
import * as C from './reefcalc.js';

const T = JSON.parse(document.getElementById('calc-i18n').textContent);
const P = T.page;
document.getElementById('calc-nojs')?.remove();

// ---- formatting ---------------------------------------------------------------------------------

const NB = ' ';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nfCache = new Map();
const num = (x, digits = 1) => {
  const k = digits;
  if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat(T.locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }));
  return nfCache.get(k).format(Math.abs(x) < 0.5 * 10 ** -digits ? 0 : x);
};
/** Fixed decimals, for SG (1.0264 never becomes 1.026). */
const fixed = (x, digits) => new Intl.NumberFormat(T.locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
/** Template with {name} slots; values are inserted as bold text. Units keep a no-break space. */
const tpl = (s, vars = {}) => esc(s)
  .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? `<b>${esc(vars[k])}</b>` : m))
  .replace(/(\d|\d<\/b>) (?=[\p{L}%°(])/gu, `$1${NB}`);
const tplText = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const plural = (n, forms) => forms[new Intl.PluralRules(T.locale).select(n)] ?? forms.other;
const digitsFor = (x) => (x < 1 ? 2 : x < 100 ? 1 : 0);

/** "12.8 g", or "12.8 g (0.45 oz)" when the volume is in US gallons. */
function grams(x, gal) {
  const metric = `${num(x, digitsFor(x))}${NB}${T.g}`;
  if (!gal) return metric;
  const oz = C.gramsToOunces(x);
  return `${metric} (${num(oz, oz < 10 ? 2 : 1)}${NB}${T.oz})`;
}

const ICON = {
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  good: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};
/** A status line: icon + label word + text, never colour alone. */
const flag = (kind, html) => `<p class="flag ${kind}">${ICON[kind]}<span><b class="flag-word">${esc(T.flags[kind])}:</b> ${html}</span></p>`;
const muted = (s) => `<p class="muted">${esc(s)}</p>`;
const empty = () => muted(T.fillIn);
const fix = () => muted(T.fixErrors);

// ---- inputs -------------------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const radio = (form, name) => form.querySelector(`input[name="${name}"]:checked`)?.value;

function setError(id, msg) {
  const input = $(id), err = $(`${id}-err`);
  if (!input || !err) return;
  if (msg) { err.textContent = msg; err.hidden = false; input.setAttribute('aria-invalid', 'true'); }
  else { err.textContent = ''; err.hidden = true; input.removeAttribute('aria-invalid'); }
}

/** Reads a number field. Empty → null; bad or out of range → NaN with the error shown. */
function read(id, min, max, { grouping = true } = {}) {
  const input = $(id);
  if (!input || input.closest('[hidden]')) return null;
  const raw = input.value.trim();
  if (!raw) { setError(id, ''); return null; }
  const v = C.parseNumber(raw, T.decimal, { grouping });
  if (!Number.isFinite(v)) { setError(id, T.errNumber); return NaN; }
  if (v < min || v > max) { setError(id, tplText(T.errRange, { min: num(min, 3), max: num(max, 3) })); return NaN; }
  setError(id, '');
  return v;
}
const bad = (...xs) => xs.some((x) => Number.isNaN(x));
const missing = (...xs) => xs.some((x) => x === null);

/** Volume in litres from <p>-vol and <p>-vol-unit, or null/NaN. */
function volume(p) {
  const gal = $(`${p}-vol-unit`).value === 'gal';
  const k = gal ? C.LITRES_PER_US_GALLON : 1;
  const v = read(`${p}-vol`, gal ? 0.3 : 1, gal ? 26000 : 100000);
  return { litres: Number.isFinite(v) ? v * k : v, gal };
}

const show = (form, sel, on) => form.querySelectorAll(sel).forEach((el) => { el.hidden = !on; });

// ---- alkalinity ---------------------------------------------------------------------------------

const ALK_DIGITS = { dkh: 2, meq: 2, ppm: 1 };
const ALK_MAX_DKH = 30;
const alkMax = (unit) => C.meqToAlk(C.dkhToMeq(ALK_MAX_DKH), unit);
const alkText = (meq, unit) => `${num(C.meqToAlk(meq, unit), ALK_DIGITS[unit])}${NB}${P.units[unit]}`;

/** Linked fields: the last one typed in drives the others. */
function linked(ids, last, convert, opts = {}) {
  const from = ids.includes(last) ? last : ids[0];
  const v = opts.read(from);
  const others = ids.filter((i) => i !== from);
  if (v === null || Number.isNaN(v)) {
    if (v === null) for (const o of others) { $(o).value = ''; setError(o, ''); }
    return v;
  }
  const vals = convert(from, v);
  if (vals === null) { for (const o of others) $(o).value = ''; return NaN; }
  for (const o of others) { setError(o, ''); $(o).value = vals[o]; }
  return vals;
}

const last = {};

function alkconv(form) {
  const ids = ['ac-dkh', 'ac-meq', 'ac-ppm'];
  const unitOf = { 'ac-dkh': 'dkh', 'ac-meq': 'meq', 'ac-ppm': 'ppm' };
  let meq;
  const r = linked(ids, last.alkconv, (from, v) => {
    meq = C.alkToMeq(v, unitOf[from]);
    return Object.fromEntries(ids.map((i) => [i, num(C.meqToAlk(meq, unitOf[i]), ALK_DIGITS[unitOf[i]])]));
  }, { read: (id) => read(id, 0, alkMax(unitOf[id])) });
  if (r === null) return empty();
  if (Number.isNaN(r)) return fix();
  return `<p class="res-line">${tpl(P.conv, { dkh: num(C.meqToDkh(meq), 2), meq: num(meq, 2), ppm: num(C.meqToPpmCaCO3(meq), 1) })}</p>`;
}

let alkUnit = null;
function alkraise(form) {
  const unit = $('ar-unit').value;
  // Switching the unit converts what is already typed, so the numbers keep their meaning.
  if (alkUnit && alkUnit !== unit) {
    for (const id of ['ar-cur', 'ar-tgt']) {
      const v = C.parseNumber($(id).value, T.decimal);
      if (Number.isFinite(v)) $(id).value = num(C.meqToAlk(C.alkToMeq(v, alkUnit), unit), ALK_DIGITS[unit]);
    }
  }
  alkUnit = unit;
  const V = volume('ar');
  const cur = read('ar-cur', 0, alkMax(unit)), tgt = read('ar-tgt', 0, alkMax(unit));
  if (missing(V.litres, cur, tgt)) return empty();
  if (bad(V.litres, cur, tgt)) return fix();
  const salt = radio(form, 'ar-salt') === 'sodaash' ? 'sodaash' : 'bicarb';
  const curMeq = C.alkToMeq(cur, unit), tgtMeq = C.alkToMeq(tgt, unit);
  const r = C.raiseAlkalinity({ volumeL: V.litres, currentMeq: curMeq, targetMeq: tgtMeq, salt: salt === 'sodaash' ? C.AlkSalt.sodiumCarbonate : C.AlkSalt.sodiumBicarbonate });
  if (!r.ok) return flag('info', esc(P.noRaise));
  const out = [
    `<p class="big">${esc(grams(r.totalGrams, V.gal))}</p>`,
    `<p class="res-what">${tpl(P.add, { salt: P.salts[salt] })}</p>`,
    `<p>${tpl(P.total, { from: alkText(curMeq, unit), to: alkText(tgtMeq, unit) })}</p>`,
  ];
  const cap = alkText(C.MAX_DAILY_RISE.alkalinityMeq, unit);
  out.push(r.mustSplit
    ? flag('warn', tpl(P.split, { cap, perDay: grams(r.gramsPerDay, V.gal), n: num(r.days, 0), days: plural(r.days, T.days), rise: alkText(r.risePerDay, unit) }))
    : flag('good', tpl(P.oneDay, { cap })));
  if (salt === 'sodaash') out.push(muted(P.sodaNote));
  return out.join('');
}

// ---- calcium and magnesium ----------------------------------------------------------------------

function element(form, { cur, tgt, max, h, run, cap }) {
  const a = read(cur, 0, max), b = read(tgt, 0, max);
  if (a === null && b === null) return null;
  const head = (from, to) => `<h3>${esc(tplText(h, { from, to }))}</h3>`;
  if (missing(a, b)) return head('…', '…') + empty();
  if (bad(a, b)) return head('…', '…') + fix();
  const out = [head(num(a, 0), num(b, 0))];
  const r = run(a, b);
  if (r === undefined) return out.join('') + fix();
  if (!r.result.ok) return out.join('') + flag('info', esc(P.noRaise));
  out.push(`<p class="big">${esc(r.big)}</p>`, `<p class="res-what">${r.what}</p>`);
  out.push(r.result.mustSplit
    ? flag('warn', tpl(P.split, { cap: num(cap, 0), perDay: r.perDay, n: num(r.result.days, 0), days: plural(r.result.days, T.days), rise: num(r.result.risePerDay, 1) }))
    : flag('good', tpl(P.oneDay, { cap: num(cap, 0) })));
  if (r.note) out.push(muted(r.note));
  return out.join('');
}

function camg(form) {
  const mgSalt = radio(form, 'cm-mg-salt');
  show(form, '[data-show="mix"]', mgSalt === 'mix');
  const V = volume('cm');
  const parts = [];
  const ca = element(form, {
    cur: 'cm-ca-cur', tgt: 'cm-ca-tgt', max: 1000, h: P.caH, cap: C.MAX_DAILY_RISE.calciumPpm,
    run: (a, b) => {
      if (!Number.isFinite(V.litres)) return undefined;
      const salt = radio(form, 'cm-ca-salt') === 'anhydrous' ? 'anhydrous' : 'dihydrate';
      const result = C.raiseCalcium({ volumeL: V.litres, currentPpm: a, targetPpm: b, salt: C.CaSalt[salt] });
      return { result, big: grams(result.totalGrams, V.gal), what: tpl(P.add, { salt: P.salts[salt] }), perDay: grams(result.gramsPerDay, V.gal), note: P.caNote };
    },
  });
  const mg = element(form, {
    cur: 'cm-mg-cur', tgt: 'cm-mg-tgt', max: 3000, h: P.mgH, cap: C.MAX_DAILY_RISE.magnesiumPpm,
    run: (a, b) => {
      if (!Number.isFinite(V.litres)) return undefined;
      let share = mgSalt === 'sulfate' ? 0 : 1;
      if (mgSalt === 'mix') {
        const pct = read('cm-mg-mix', 0, 100);
        if (pct === null || Number.isNaN(pct)) return undefined;
        share = pct / 100;
      }
      const result = C.raiseMagnesium({ volumeL: V.litres, currentPpm: a, targetPpm: b, chlorideFraction: share });
      const g = result.grams;
      const what = g.magnesiumChloride && g.magnesiumSulfate
        ? tpl(P.both, { a: grams(g.magnesiumChloride, V.gal), b: grams(g.magnesiumSulfate, V.gal) })
        : tpl(P.add, { salt: P.salts[g.magnesiumSulfate ? 'sulfate' : 'chloride'] });
      return { result, big: grams(result.totalGrams, V.gal), what, perDay: grams(result.gramsPerDay, V.gal) };
    },
  });
  if (ca === null && mg === null) return empty();
  if (V.litres === null) return empty();
  if (Number.isNaN(V.litres)) return fix();
  if (ca) parts.push(ca);
  if (mg) parts.push(mg);
  return parts.join('');
}

// ---- salinity -----------------------------------------------------------------------------------

function sal(form) {
  const ref = radio(form, 'sl-ref') || 'c25';
  const refC = C.SgReference[ref];
  let ppt;
  const r = linked(['sl-ppt', 'sl-sg'], last.sal, (from, v) => {
    if (from === 'sl-ppt') ppt = v;
    else {
      ppt = C.salinityFromSg(v, refC);
      if (ppt === null) { setError('sl-sg', P.outOfRange); return null; }
    }
    return { 'sl-ppt': num(ppt, 2), 'sl-sg': fixed(C.specificGravity(ppt, refC), 4) };
  }, { read: (id) => (id === 'sl-ppt' ? read(id, 0, 50) : read(id, 0.9, 1.2, { grouping: false })) });
  if (r === null) return empty();
  if (Number.isNaN(r)) return fix();
  const refName = P.refs[ref];
  return [
    `<p class="big">${esc(fixed(C.specificGravity(ppt, refC), 4))} <small>SG</small></p>`,
    `<p class="res-line">${tpl(P.result, { ppt: num(ppt, 2), sg: fixed(C.specificGravity(ppt, refC), 4), ref: refName })}</p>`,
    muted(tplText(P.density, { rho: num(C.seawaterDensity(ppt, refC), 3) })),
    muted(tplText(P.seawater, { sg35: fixed(C.specificGravity(35, refC), 4), ref: refName })),
  ].join('').replace(/(\d) (?=[\p{L}%°])/gu, `$1${NB}`);
}

// ---- test kits ----------------------------------------------------------------------------------

function po4() {
  let ppb;
  const r = linked(['kt-p', 'kt-po4'], last.po4, (from, v) => {
    ppb = from === 'kt-p' ? v : C.phosphatePpmToPhosphorusPpb(v);
    return { 'kt-p': num(ppb, 1), 'kt-po4': num(C.phosphorusPpbToPhosphatePpm(ppb), 3) };
  }, { read: (id) => (id === 'kt-p' ? read(id, 0, 10000) : read(id, 0, 30)) });
  if (r === null) return empty();
  if (Number.isNaN(r)) return fix();
  return `<p class="res-line">${tpl(P.po4, { p: num(ppb, 1), po4: num(C.phosphorusPpbToPhosphatePpm(ppb), 3) })}</p>`;
}

function no3() {
  let n;
  const r = linked(['kt-n', 'kt-no3'], last.no3, (from, v) => {
    n = from === 'kt-n' ? v : C.nitrateToNitrateN(v);
    return { 'kt-n': num(n, 2), 'kt-no3': num(C.nitrateNToNitrate(n), 2) };
  }, { read: (id) => (id === 'kt-n' ? read(id, 0, 200) : read(id, 0, 1000)) });
  if (r === null) return empty();
  if (Number.isNaN(r)) return fix();
  return `<p class="res-line">${tpl(P.no3, { n: num(n, 2), no3: num(C.nitrateNToNitrate(n), 2) })}</p>`;
}

// ---- kalkwasser ---------------------------------------------------------------------------------

function kalk() {
  const V = volume('kk');
  const topGal = $('kk-top-unit').value === 'gal';
  const kTop = topGal ? C.LITRES_PER_US_GALLON : 1;
  const top = read('kk-top', 0, topGal ? 260 : 1000);
  const sat = read('kk-sat', 1, 100);
  const use = read('kk-use', 0, 10);
  if (missing(V.litres, top, sat)) return empty();
  if (bad(V.litres, top, sat, use)) return fix();
  const k = C.kalkContribution({ litresPerDay: top * kTop, volumeL: V.litres, saturation: sat / 100 });
  const out = [];
  if (k.caPpmPerDay === 0) out.push(muted(P.noUse));
  else {
    out.push(`<p class="big">${tpl(P.ca, { ca: num(k.caPpmPerDay, 1) }).replace(/<\/?b>/g, '')}</p>`);
    out.push(`<p class="res-line">${tpl(P.alk, { dkh: num(C.meqToDkh(k.alkMeqPerDay), 2), meq: num(k.alkMeqPerDay, 3) })}</p>`);
    const alkCap = C.MAX_DAILY_RISE.alkalinityMeq, caCap = C.MAX_DAILY_RISE.calciumPpm;
    if (k.alkMeqPerDay > alkCap + 1e-12 || k.caPpmPerDay > caCap + 1e-12) {
      const cap = k.alkMeqPerDay > alkCap ? `${num(C.meqToDkh(alkCap), 1)}${NB}dKH` : `${num(caCap, 0)}${NB}ppm`;
      out.push(flag('warn', tpl(P.fast, { cap })));
    }
  }
  if (use !== null && use > 0) {
    const litres = C.kalkLitresForAlk({ alkMeqPerDay: C.dkhToMeq(use), volumeL: V.litres, saturation: sat / 100 });
    const shown = litres / kTop;
    out.push(flag('info', tpl(P.need, { use: num(use, 2), top: `${num(shown, shown < 10 ? 2 : 1)}${NB}${topGal ? T.gal : T.l}` })));
  }
  return out.join('');
}

// ---- run ----------------------------------------------------------------------------------------

const RUN = { alkconv, alkraise, camg, sal, po4, no3, kalk };
for (const form of document.querySelectorAll('form[data-calc]')) {
  const kind = form.dataset.calc;
  const res = document.getElementById(`res-${kind}`);
  res.hidden = false;
  const update = (e) => {
    if (e?.target?.matches?.('input[type="text"]') && e.type === 'input') last[kind] = e.target.id;
    res.innerHTML = RUN[kind](form);
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  update();
}
