// Coralline web calculators: the maths. A line-by-line port of the app's engine,
// packages/reef_chem/lib/src/{constants,units,dosing,kalkwasser,salinity,finite,parameters}.dart,
// so the site and the app give the same numbers. Specification: CLAUDE.md §3.
// Tested by tools/site/calc.test.mjs (node --test), which also parses the Dart sources and fails
// when a constant here drifts from the engine.
//
// Canonical units, as in the engine: volume in litres; alkalinity in meq/L; calcium and magnesium
// in mg/L (ppm); salinity as practical salinity (ppt); temperature in °C; amounts in grams.
// No DOM here: tools/site/static/calc-ui.js wires these functions to the pages.

// --- constants.dart ------------------------------------------------------------------------------

/** Molar masses, g/mol (IUPAC standard atomic weights; hydrates include their water). */
export const MolarMass = Object.freeze({
  calcium: 40.078,
  magnesium: 24.305,
  sodiumBicarbonate: 84.007, // NaHCO3, baking soda
  sodiumCarbonate: 105.988, // Na2CO3, soda ash
  calciumChlorideDihydrate: 147.01, // CaCl2·2H2O
  calciumChloride: 110.98, // CaCl2, anhydrous
  magnesiumChlorideHexahydrate: 203.30, // MgCl2·6H2O
  magnesiumSulfateHeptahydrate: 246.47, // MgSO4·7H2O
  calciumHydroxide: 74.093, // Ca(OH)2
  phosphate: 94.971, // PO4
  phosphorus: 30.974, // P
  nitrate: 62.004, // NO3
  nitrogen: 14.007, // N
});

/** 1 US liquid gallon in litres (exact by definition: 231 in³). */
export const LITRES_PER_US_GALLON = 3.785411784;
/** 1 avoirdupois ounce in grams (exact). Display only; the engine works in grams. */
export const GRAMS_PER_OUNCE = 28.349523125;

/** Alkalinity: 1 meq/L = 2.8 dKH = 50.0 ppm as CaCO3.
 *  Source: R. Holmes-Farley, "Chemistry and the Aquarium: What is Alkalinity?", Advanced Aquarist
 *  (2002). 1 dKH is defined as 10 mg/L CaO (0.3566 meq/L); the hobby rounds the inverse to 2.8. */
export const DKH_PER_MEQ = 2.8;
export const PPM_CACO3_PER_MEQ = 50.0;

// --- parameters.dart: default daily rise limits (canonical units) -------------------------------
// Conservative defaults, the same the app uses (Settings → Dosing safety): big corrections are
// split over days, following Holmes-Farley's advice to correct in steps and test in between.

export const MAX_DAILY_RISE = Object.freeze({
  alkalinityMeq: 1.4 / DKH_PER_MEQ, // 1.4 dKH a day
  calciumPpm: 20,
  magnesiumPpm: 100,
});

// --- units.dart ----------------------------------------------------------------------------------

export const dkhToMeq = (dkh) => dkh / DKH_PER_MEQ;
export const meqToDkh = (meq) => meq * DKH_PER_MEQ;
export const ppmCaCO3ToMeq = (ppm) => ppm / PPM_CACO3_PER_MEQ;
export const meqToPpmCaCO3 = (meq) => meq * PPM_CACO3_PER_MEQ;

/** Alkalinity in [unit] ('dkh' | 'meq' | 'ppm') → meq/L. */
export function alkToMeq(value, unit) {
  if (unit === 'dkh') return dkhToMeq(value);
  if (unit === 'ppm') return ppmCaCO3ToMeq(value);
  if (unit === 'meq') return value;
  throw new RangeError(`unknown alkalinity unit ${unit}`);
}
/** meq/L → alkalinity in [unit]. */
export function meqToAlk(meq, unit) {
  if (unit === 'dkh') return meqToDkh(meq);
  if (unit === 'ppm') return meqToPpmCaCO3(meq);
  if (unit === 'meq') return meq;
  throw new RangeError(`unknown alkalinity unit ${unit}`);
}

/** Phosphorus in ppb (µg/L P) → phosphate in ppm (mg/L PO4). PO4/P = 94.971 / 30.974 = 3.0662. */
export const phosphorusPpbToPhosphatePpm = (ppbP) => (ppbP * (MolarMass.phosphate / MolarMass.phosphorus)) / 1000;
/** Phosphate ppm (PO4) → phosphorus ppb (P). */
export const phosphatePpmToPhosphorusPpb = (ppmPo4) => ppmPo4 * 1000 * (MolarMass.phosphorus / MolarMass.phosphate);
/** Nitrate as nitrogen (NO3-N) → nitrate ion (NO3). Ratio 62.004 / 14.007 = 4.4266. */
export const nitrateNToNitrate = (no3n) => no3n * (MolarMass.nitrate / MolarMass.nitrogen);
/** Nitrate ion (NO3) → nitrate as nitrogen (NO3-N). */
export const nitrateToNitrateN = (no3) => no3 * (MolarMass.nitrogen / MolarMass.nitrate);

export const gallonsToLitres = (gal) => gal * LITRES_PER_US_GALLON;
export const litresToGallons = (l) => l / LITRES_PER_US_GALLON;
export const gramsToOunces = (g) => g / GRAMS_PER_OUNCE;

// --- finite.dart ---------------------------------------------------------------------------------

/** A usable amount, volume, rise or strength: a real number > 0 (NaN and ±∞ rejected). */
export const isPositiveFinite = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

// --- dosing.dart ---------------------------------------------------------------------------------
// Sources: R. Holmes-Farley, "Solving Calcium and Alkalinity Problems", Advanced Aquarist (2002);
// "An Improved Do-it-Yourself Two-Part Calcium and Alkalinity Supplement System", Reefkeeping
// (2006). 1 mmol of NaHCO3 adds 1 meq of alkalinity, 1 mmol of Na2CO3 adds 2 meq.

export const AlkSalt = Object.freeze({
  sodiumBicarbonate: Object.freeze({ name: 'sodiumBicarbonate', molarMass: MolarMass.sodiumBicarbonate, meqPerMmol: 1 }),
  sodiumCarbonate: Object.freeze({ name: 'sodiumCarbonate', molarMass: MolarMass.sodiumCarbonate, meqPerMmol: 2 }),
});
/** Grams of salt per meq of alkalinity. */
export const gramsPerMeq = (salt) => salt.molarMass / salt.meqPerMmol / 1000;

export const CaSalt = Object.freeze({
  dihydrate: Object.freeze({ name: 'dihydrate', molarMass: MolarMass.calciumChlorideDihydrate }),
  anhydrous: Object.freeze({ name: 'anhydrous', molarMass: MolarMass.calciumChloride }),
});

/** Why a dose could not be computed (DoseIssue). */
export const DoseIssue = Object.freeze({
  /** Target at or below the current value. Nothing to add; a water change is the way down. */
  noRaiseNeeded: 'noRaiseNeeded',
  /** Volume is zero, negative or not a finite number. */
  invalidVolume: 'invalidVolume',
});

const MAX_DAYS = 2 ** 30;

/** A NaN limit throws; +∞ or ≤ 0 means "no limit" (one day). */
function daysFor(delta, maxPerDay) {
  if (Number.isNaN(maxPerDay)) throw new RangeError('maxDaily must be a number');
  if (maxPerDay <= 0) return 1;
  // Small epsilon so 1.4 dKH with a 1.4 dKH limit stays one day.
  const ratio = delta / maxPerDay - 1e-9;
  if (!(ratio < MAX_DAYS)) return MAX_DAYS;
  return Math.min(Math.max(Math.ceil(ratio), 1), MAX_DAYS);
}

/** DoseResult: { delta, totalGrams, grams, days, issue, ok, mustSplit, gramsPerDay, risePerDay }. */
function result({ delta, totalGrams = 0, grams = {}, days = 0, issue = null }) {
  return Object.freeze({
    delta,
    totalGrams,
    grams: Object.freeze(grams),
    days,
    issue,
    ok: issue === null,
    mustSplit: days > 1,
    gramsPerDay: days === 0 ? 0 : totalGrams / days,
    risePerDay: days === 0 ? 0 : delta / days,
  });
}

/** Non-finite levels are a caller bug, so they throw; a bad volume maps to DoseIssue. */
function guard(volumeL, current, target) {
  if (!Number.isFinite(current)) throw new RangeError('current must be finite');
  if (!Number.isFinite(target)) throw new RangeError('target must be finite');
  if (!isPositiveFinite(volumeL)) return result({ delta: 0, issue: DoseIssue.invalidVolume });
  const delta = target - current;
  if (delta <= 0) return result({ delta, issue: DoseIssue.noRaiseNeeded });
  return null;
}

/** Grams of [salt] to raise alkalinity from currentMeq to targetMeq.
 *  g = Δmeq · V · M / (meq per mmol) / 1000. */
export function raiseAlkalinity({ volumeL, currentMeq, targetMeq, salt = AlkSalt.sodiumBicarbonate, maxDailyMeq }) {
  const delta = targetMeq - currentMeq;
  const bad = guard(volumeL, currentMeq, targetMeq);
  if (bad) return bad;
  const g = delta * volumeL * gramsPerMeq(salt);
  return result({ delta, totalGrams: g, grams: { [salt.name]: g }, days: daysFor(delta, maxDailyMeq ?? MAX_DAILY_RISE.alkalinityMeq) });
}

/** Grams of calcium chloride to raise calcium from currentPpm to targetPpm.
 *  mmol = Δppm · V / 40.078; g = mmol · M / 1000. */
export function raiseCalcium({ volumeL, currentPpm, targetPpm, salt = CaSalt.dihydrate, maxDailyPpm }) {
  const delta = targetPpm - currentPpm;
  const bad = guard(volumeL, currentPpm, targetPpm);
  if (bad) return bad;
  const mmol = (delta * volumeL) / MolarMass.calcium;
  const g = (mmol * salt.molarMass) / 1000;
  return result({ delta, totalGrams: g, grams: { [salt.name]: g }, days: daysFor(delta, maxDailyPpm ?? MAX_DAILY_RISE.calciumPpm) });
}

/** Grams of magnesium salts to raise magnesium from currentPpm to targetPpm.
 *  mmol = Δppm · V / 24.305, split by chlorideFraction (share of Mg ions from MgCl2·6H2O:
 *  1 = chloride only, 0 = sulfate only). A fraction outside 0–1 (or NaN) throws. */
export function raiseMagnesium({ volumeL, currentPpm, targetPpm, chlorideFraction = 1, maxDailyPpm }) {
  const c = chlorideFraction;
  if (!(c >= 0 && c <= 1)) throw new RangeError('chlorideFraction must be 0–1');
  const delta = targetPpm - currentPpm;
  const bad = guard(volumeL, currentPpm, targetPpm);
  if (bad) return bad;
  const mmol = (delta * volumeL) / MolarMass.magnesium;
  // A share of 0 contributes exactly 0 even when mmol overflows (∞ · 0 = NaN).
  const chloride = c > 0 ? (mmol * c * MolarMass.magnesiumChlorideHexahydrate) / 1000 : 0;
  const sulfate = c < 1 ? (mmol * (1 - c) * MolarMass.magnesiumSulfateHeptahydrate) / 1000 : 0;
  const grams = {};
  if (chloride > 0) grams.magnesiumChloride = chloride;
  if (sulfate > 0) grams.magnesiumSulfate = sulfate;
  return result({ delta, totalGrams: chloride + sulfate, grams, days: daysFor(delta, maxDailyPpm ?? MAX_DAILY_RISE.magnesiumPpm) });
}

// --- kalkwasser.dart -----------------------------------------------------------------------------
// Source: R. Holmes-Farley (Reefkeeping, Advanced Aquarist). Saturated limewater at room
// temperature holds about 800 mg/L calcium and about 40 meq/L alkalinity (≈ 112 dKH). Ca(OH)2 adds
// 2 meq per mmol Ca, so the two are always added in balance.

export const KALK_SATURATED_CA_PPM = 800;
export const KALK_SATURATED_ALK_MEQ = 40;

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

/** Daily contribution of litresPerDay of limewater at saturation (0–1) in volumeL litres.
 *  Any input that is not a positive finite number contributes nothing. */
export function kalkContribution({ litresPerDay, volumeL, saturation = 1 }) {
  if (!isPositiveFinite(volumeL) || !isPositiveFinite(litresPerDay) || !isPositiveFinite(saturation)) {
    return { caPpmPerDay: 0, alkMeqPerDay: 0 };
  }
  const s = clamp01(saturation);
  return {
    caPpmPerDay: (KALK_SATURATED_CA_PPM * s * litresPerDay) / volumeL,
    alkMeqPerDay: (KALK_SATURATED_ALK_MEQ * s * litresPerDay) / volumeL,
  };
}

/** Litres of limewater a day that supply alkMeqPerDay of alkalinity use in volumeL. 0 for no
 *  consumption or any input that is not a positive finite number. */
export function kalkLitresForAlk({ alkMeqPerDay, volumeL, saturation = 1 }) {
  if (!isPositiveFinite(alkMeqPerDay) || !isPositiveFinite(volumeL) || !isPositiveFinite(saturation)) return 0;
  return (alkMeqPerDay * volumeL) / (KALK_SATURATED_ALK_MEQ * clamp01(saturation));
}

// --- salinity.dart -------------------------------------------------------------------------------
// EOS-80 equation of state at one standard atmosphere. Source: UNESCO (1981) Technical Papers in
// Marine Science 36 and 38; Millero & Poisson (1981), Deep-Sea Research 28A, 625–629. Valid for
// practical salinity 0–42 and temperature −2–40 °C.

/** Reference temperatures (t/t) for a specific-gravity reading, in °C. */
export const SgReference = Object.freeze({
  c25: 25.0, // 25 °C / 25 °C (default)
  f60: ((60 - 32) * 5) / 9, // 60 °F / 60 °F = 15.556 °C
  f77: ((77 - 32) * 5) / 9, // 77 °F / 77 °F = 25 °C
});

/** Density of pure (SMOW) water in kg/m³ at t °C (EOS-80 ρw). */
export const pureWaterDensity = (t) =>
  999.842594 +
  6.793952e-2 * t -
  9.095290e-3 * t * t +
  1.001685e-4 * t * t * t -
  1.120083e-6 * t * t * t * t +
  6.536332e-9 * t * t * t * t * t;

/** Density of seawater in kg/m³ at practical salinity s and t °C, 1 atm. */
export function seawaterDensity(s, t) {
  const a =
    8.24493e-1 -
    4.0899e-3 * t +
    7.6438e-5 * t * t -
    8.2467e-7 * t * t * t +
    5.3875e-9 * t * t * t * t;
  const b = -5.72466e-3 + 1.0227e-4 * t - 1.6546e-6 * t * t;
  const c = 4.8314e-4;
  return pureWaterDensity(t) + a * s + b * Math.pow(s, 1.5) + c * s * s;
}

/** Specific gravity (t/t) of seawater with salinity ppt at reference temperature refC. */
export const specificGravity = (ppt, refC = SgReference.c25) => seawaterDensity(ppt, refC) / pureWaterDensity(refC);

/** Inverse of specificGravity: salinity (ppt) for an SG reading. SG rises monotonically with
 *  salinity, so bisection on 0–50 ppt always converges; 60 halvings give < 1e-13 ppt. Returns null
 *  when the reading is outside what seawater from 0 to 50 ppt can produce (and for NaN). */
export function salinityFromSg(sg, refC = SgReference.c25) {
  const lo0 = 0, hi0 = 50;
  if (typeof sg !== 'number' || Number.isNaN(sg)) return null;
  if (sg < specificGravity(lo0, refC) - 1e-9 || sg > specificGravity(hi0, refC) + 1e-9) return null;
  let lo = lo0, hi = hi0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (specificGravity(mid, refC) < sg) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// --- input parsing (site only) -------------------------------------------------------------------

/** Parses what a person types: "8,5", "8.5", "1.000" (de: one thousand), "1,000" (en), "0.030"
 *  (never thirty), "+3", "−2". With grouping: false every single separator is a decimal point
 *  (used for SG, where "1.025" means 1,025 in every language). Returns NaN for anything else.
 *  Adapted from Tubwise's tools/site/static/tubcalc.js parseNumber. */
export function parseNumber(text, decimal = '.', { grouping = true } = {}) {
  let s = String(text ?? '').trim().replace(/[\s  ']/g, '').replace(/^\+/, '').replace(/−/g, '-');
  if (!s) return NaN;
  const group = decimal === ',' ? '.' : ',';
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // The separator that comes last is the decimal one.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    // A thousands group never starts with 0 ("0.030" is a decimal everywhere).
    const grouped = grouping && new RegExp(`^-?[1-9]\\d{0,2}(\\${sep}\\d{3})+$`).test(s);
    if (sep === group && grouped) s = s.split(sep).join('');
    else if ((s.match(new RegExp(`\\${sep}`, 'g')) || []).length > 1) return NaN;
    else s = s.replace(sep, '.');
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}
