// The creature definition: ONE small, versioned record that drives the editor preview, the playable body, the first-person arms,
// the absorption tentacles and the weapon anatomy. Everything here is cosmetic: movement, collision, damage, health and reach never read it.
//
// The schema below is data: each control has a safe range, a default and a player-facing hint. The editor builds its sliders from it,
// sanitize() clamps imported or stored data to it, and the runtime reads the sanitized result. Nothing outside this file knows a range.

export const VERSION = 1;

const num = (path, label, min, max, def, step, hint, when) => ({ kind: 'num', path, label, min, max, def, step, hint, when });
const opt = (path, label, options, def, hint) => ({ kind: 'opt', path, label, options, def, hint });
const bool = (path, label, def, hint) => ({ kind: 'bool', path, label, def, hint });
const col = (path, label, def, hint) => ({ kind: 'col', path, label, def, hint });

// Sections, in editor order. `ready` marks sections whose controls all drive the playable model.
export const SECTIONS = [
  { id: 'body', label: 'Body', blurb: 'The gel mass everything grows from. Every slider reshapes one continuous mesh.' },
  { id: 'arms', label: 'Arms & Hands', blurb: 'Both arms are your weapon and your mouth. Only variants that can fire and absorb are offered.' },
  { id: 'tentacles', label: 'Tentacles', blurb: 'Feeding tentacles grow from the left arm. Reach and timing never change.' },
  { id: 'head', label: 'Head & Senses', blurb: 'An optional sensory region that blends into the body, kept clear of your aim.' },
  { id: 'skin', label: 'Skin & Light', blurb: 'Colour, translucency, patterns and inner light. They apply to every part, including the weapon.' },
];

export const CONTROLS = {
  body: [
    num('body.height', 'Height', 0.75, 1.0, 0.92, 0.01, 'Short to tall.'),
    num('body.width', 'Width', 0.85, 1.3, 1.0, 0.01, 'Side to side.'),
    num('body.depth', 'Depth', 0.85, 1.3, 1.0, 0.01, 'Front to back.'),
    num('body.shoulderWidth', 'Shoulders', -0.4, 0.8, 0.15, 0.01, 'How broad the shoulders stand.'),
    num('body.lean', 'Forward lean', -0.3, 0.6, 0, 0.01),
    num('body.curve', 'Belly', -0.5, 1, 0, 0.01),
    num('body.armRootHeight', 'Arm-root height', 0, 1, 0.9, 0.01),
  ],
  arms: [
    num('arms.length', 'Arm length', 0.8, 1.25, 1.12, 0.01, 'The visible forearm. Reach and hand contact never change.'),
    num('arms.thickness', 'Arm thickness', 0.75, 1.4, 1, 0.01),
    num('arms.upperRatio', 'Upper arm / forearm', -1, 1, 0, 0.01, 'Slide the arm mass toward the shoulder or toward the wrist.'),
    num('arms.handSize', 'Hand size', 0.75, 1.35, 1, 0.01),
    opt('arms.hand', 'Hand structure', [['slender', 'Slender'], ['broad', 'Broad paw']], 'slender', 'Both fold around the barrel and grip a target.'),
    opt('arms.digits', 'Digits', [[2, 'Two'], [3, 'Three'], [4, 'Four']], 3, 'Fewer digits means a stronger pincer look; the weapon still grows from the palm.'),
    num('arms.fingerLength', 'Finger length', -1, 1, 0, 0.01),
    num('arms.fingerThickness', 'Finger thickness', -1, 1, 0, 0.01),
    num('arms.fingerSpacing', 'Finger spacing', -1, 1, 0, 0.01),
    bool('arms.symmetry', 'Symmetry', true, 'On: both arms match. Off: the right (weapon) arm can differ.'),
    num('arms.rightLength', 'Right arm length', 0.8, 1.25, 1.12, 0.01, 'Only used when symmetry is off.', 'asym'),
    num('arms.rightHandSize', 'Right hand size', 0.75, 1.35, 1, 0.01, 'Only used when symmetry is off.', 'asym'),
  ],
  tentacles: [
    num('tentacles.count', 'Tentacles', 3, 6, 6, 1, 'Absorption uses what it needs; the rest rest on the arm.'),
    opt('tentacles.region', 'Attachment', [['wrist', 'Near the wrist'], ['mid', 'Mid-forearm'], ['elbow', 'Near the elbow']], 'wrist', 'Sockets stay on the left forearm.'),
    num('tentacles.arc', 'Spread around the arm', 0.35, 1, 0.7, 0.01),
    num('tentacles.length', 'Length', 0.6, 1.6, 1, 0.01, 'The resting length. Their reach to a target never changes.'),
    num('tentacles.thickness', 'Thickness', 0.6, 1.8, 1, 0.01),
    num('tentacles.taper', 'Taper', -0.5, 1, 0.5, 0.01),
    num('tentacles.curl', 'Resting curl', 0, 1, 0.7, 0.01, 'How tightly they coil at rest.'),
    opt('tentacles.surface', 'Surface', [['ridged', 'Ridged'], ['smooth', 'Smooth']], 'ridged'),
  ],
  head: [
    num('head.size', 'Size', 0.8, 1.25, 1, 0.01),
    num('head.width', 'Width', -1, 1, 0, 0.01),
    num('head.length', 'Forward length', -1, 1, 0, 0.01, 'Capped so it never blocks your aim.'),
    opt('head.eyes', 'Eyes', [['none', 'Eyeless'], ['pair', 'Pair'], ['trio', 'Three'], ['cyclops', 'Single'], ['cluster', 'Cluster']], 'pair'),
    num('head.eyeSize', 'Eye size', 0.6, 1.6, 1, 0.01),
    col('head.eyeColor', 'Eye colour', '#baff5a'),
    opt('head.crest', 'Crest', [['none', 'None'], ['ridge', 'Ridge'], ['fan', 'Fan']], 'none'),
    num('head.feelers', 'Feelers', 0, 4, 0, 1),
    num('head.fins', 'Side fins', 0, 2, 0, 1, 'Pairs of soft fins.'),
  ],
  skin: [
    opt('skin.style', 'Style', [['smooth', 'Smooth'], ['ridged', 'Subtly ridged'], ['luminous', 'Luminous'], ['dark', 'Dark'], ['translucent', 'Softly translucent']], 'smooth', 'A starting point; every slider below still works.'),
    col('skin.primary', 'Primary colour', '#0d6560'),
    col('skin.secondary', 'Secondary colour', '#2fb89a'),
    col('skin.marking', 'Marking colour', '#b8fff4'),
    num('skin.gradient', 'Gradient', 0, 1, 0.5, 0.01, 'Blend from primary at the base to secondary at the crown.'),
    opt('skin.pattern', 'Pattern', [['none', 'None'], ['bands', 'Bands'], ['spots', 'Spots'], ['stripes', 'Stripes'], ['veins', 'Veins']], 'none'),
    num('skin.patternScale', 'Pattern size', 0.5, 2, 1, 0.01),
    num('skin.translucency', 'Translucency', 0.3, 0.85, 0.58, 0.01, 'Kept above a floor so your body is always visible.'),
    num('skin.roughness', 'Surface roughness', 0, 1, 0.3, 0.01, 'Glossy gel to a matte skin.'),
    col('skin.glow', 'Inner glow colour', '#6ff0e0'),
    num('skin.glowIntensity', 'Inner glow', 0, 1, 0.35, 0.01, 'Restrained on purpose; it never lights the room.'),
    num('skin.ridge', 'Skin ridging', 0, 1, 0.25, 0.01, 'Fine surface ridges in the shading.'),
    bool('skin.core', 'Inner core', true, 'The luminous organ inside the body.'),
    bool('skin.organs', 'Inner structures', true, 'Veins and small organs visible through the skin.'),
    col('tentacles.color', 'Tentacle colour', '#147a6c'),
    col('tentacles.glow', 'Tentacle inner light', '#d2fff0'),
  ],
};

export const ALL_CONTROLS = Object.values(CONTROLS).flat();
const BY_PATH = Object.fromEntries(ALL_CONTROLS.map((c) => [c.path, c]));
export const controlFor = (path) => BY_PATH[path];

// ---- plain-object helpers ----
export function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o, path, v) {
  const ks = path.split('.'); let a = o;
  for (let i = 0; i < ks.length - 1; i++) { if (typeof a[ks[i]] !== 'object' || a[ks[i]] === null) a[ks[i]] = {}; a = a[ks[i]]; }
  a[ks[ks.length - 1]] = v;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

export function defaults() {
  const d = { version: VERSION, name: 'Warden' };
  for (const c of ALL_CONTROLS) setPath(d, c.path, c.def);
  return d;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Clamp/repair anything: stored saves, imported files, randomised values. Never throws; unknown keys are dropped.
export function sanitize(input) {
  const out = defaults();
  if (!input || typeof input !== 'object') return out;
  if (typeof input.name === 'string') out.name = input.name.replace(/[^\w \-.']/g, '').slice(0, 24) || 'Specimen';
  for (const c of ALL_CONTROLS) {
    const v = getPath(input, c.path);
    if (v === undefined) continue;
    if (c.kind === 'num') { const n = Number(v); if (Number.isFinite(n)) setPath(out, c.path, Math.min(c.max, Math.max(c.min, c.step >= 1 ? Math.round(n) : n))); }
    else if (c.kind === 'opt') { const hit = c.options.find(([k]) => k === v || String(k) === String(v)); if (hit) setPath(out, c.path, hit[0]); }
    else if (c.kind === 'bool') { if (typeof v === 'boolean') setPath(out, c.path, v); }
    else if (c.kind === 'col') { if (typeof v === 'string' && HEX.test(v)) setPath(out, c.path, v.toLowerCase()); }
  }
  if (out.arms.symmetry) { out.arms.rightLength = out.arms.length; out.arms.rightHandSize = out.arms.handSize; }
  return out;
}

// Strict validation for imports: says exactly what is wrong instead of silently repairing.
export function validateImport(text) {
  let o;
  if (typeof text !== 'string' || text.length > 20000) return { error: 'That file is too large to be a creature preset.' };
  try { o = JSON.parse(text); } catch (e) { return { error: 'That file is not valid JSON.' }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'The file does not contain a creature.' };
  if (o.kind !== 'intruder-creature') return { error: 'This is not an INTRUDER creature preset.' };
  if (!Number.isInteger(o.version) || o.version < 1) return { error: 'The preset has no valid version.' };
  if (o.version > VERSION) return { error: 'This preset was made by a newer version of the game.' };
  const d = o.creature;
  if (!d || typeof d !== 'object') return { error: 'The preset has no creature data.' };
  for (const c of ALL_CONTROLS) {
    const v = getPath(d, c.path);
    if (v === undefined) continue; // missing values fall back to defaults
    if (c.kind === 'num' && !(typeof v === 'number' && Number.isFinite(v))) return { error: `"${c.label}" must be a number.` };
    if (c.kind === 'num' && (v < c.min - 1e-6 || v > c.max + 1e-6)) return { error: `"${c.label}" is out of range (${c.min} to ${c.max}).` };
    if (c.kind === 'opt' && !c.options.some(([k]) => String(k) === String(v))) return { error: `"${c.label}" has an unsupported value.` };
    if (c.kind === 'bool' && typeof v !== 'boolean') return { error: `"${c.label}" must be on or off.` };
    if (c.kind === 'col' && !(typeof v === 'string' && HEX.test(v))) return { error: `"${c.label}" must be a colour like #1a2b3c.` };
  }
  return { creature: sanitize(d) };
}

export function exportText(def) {
  return JSON.stringify({ kind: 'intruder-creature', version: VERSION, creature: sanitize(def) }, null, 1);
}

// ---- constrained randomisation: every value is drawn inside its range, with a pull toward the middle so results look like a creature ----
export function randomCreature(rng = Math.random, base = defaults()) {
  const d = sanitize(base);
  const r = () => (rng() + rng() + rng()) / 3;                               // bell-shaped 0..1
  for (const c of [...CONTROLS.body, ...CONTROLS.arms, ...CONTROLS.tentacles, ...CONTROLS.head, ...CONTROLS.skin]) {
    if (c.kind === 'num') {
      let v = c.min + r() * (c.max - c.min);
      if (c.step >= 1) v = Math.round(v);
      setPath(d, c.path, v);
    } else if (c.kind === 'opt') setPath(d, c.path, c.options[Math.floor(rng() * c.options.length)][0]);
    else if (c.kind === 'bool' && c.path !== 'arms.symmetry') setPath(d, c.path, rng() < 0.6);
  }
  const hue = rng() * 360, hsl = (h, s, l) => hslHex(((h % 360) + 360) % 360, s, l);
  d.skin.primary = hsl(hue, 0.7, 0.22 + rng() * 0.12); d.skin.secondary = hsl(hue + 30 + rng() * 50, 0.65, 0.4 + rng() * 0.15);
  d.skin.marking = hsl(hue + 160 + rng() * 40, 0.8, 0.72); d.skin.glow = hsl(hue + rng() * 40 - 20, 0.85, 0.65);
  d.head.eyeColor = hsl(hue + 180 + rng() * 60, 0.9, 0.62);
  d.tentacles.color = hsl(hue + 10, 0.6, 0.3); d.tentacles.glow = hsl(hue + 20, 0.7, 0.85);
  d.body.height = Math.min(d.body.height, 1.7);
  d.arms.symmetry = true;
  return sanitize(d);
}

export function hslHex(h, s, l) {
  const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  const x = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return '#' + x(f(0)) + x(f(8)) + x(f(4));
}

// Style presets set several appearance values at once.
export const STYLES = {
  smooth: { 'skin.ridge': 0.05, 'skin.roughness': 0.25, 'skin.glowIntensity': 0.3, 'skin.translucency': 0.58 },
  ridged: { 'skin.ridge': 0.7, 'skin.roughness': 0.4, 'skin.glowIntensity': 0.3, 'skin.translucency': 0.6 },
  luminous: { 'skin.ridge': 0.2, 'skin.roughness': 0.15, 'skin.glowIntensity': 0.8, 'skin.translucency': 0.7, 'skin.gradient': 0.8 },
  dark: { 'skin.ridge': 0.35, 'skin.roughness': 0.6, 'skin.glowIntensity': 0.12, 'skin.translucency': 0.34, 'skin.primary': '#10151d', 'skin.secondary': '#2a3a4d' },
  translucent: { 'skin.ridge': 0.1, 'skin.roughness': 0.1, 'skin.glowIntensity': 0.4, 'skin.translucency': 0.82, 'skin.gradient': 0.3 },
};
export function applyStyle(def, style) {
  const s = STYLES[style]; if (!s) return def;
  const d = clone(def); for (const [p, v] of Object.entries(s)) setPath(d, p, v); d.skin.style = style; return sanitize(d);
}

const P = (name, patch) => { const d = defaults(); d.name = name; for (const [p, v] of Object.entries(patch)) setPath(d, p, v); return sanitize(d); };

// Humanoid starting points. The first one is the default for new and existing saves.
export const PRESETS = [
  P('Warden', { 'body.height': 0.94, 'body.shoulderWidth': 0.25, 'arms.digits': 3, 'tentacles.count': 6, 'head.eyes': 'pair', 'head.crest': 'none',
    'skin.style': 'smooth', 'skin.primary': '#0d6560', 'skin.secondary': '#2fb89a', 'skin.marking': '#b8fff4', 'skin.glow': '#6ff0e0', 'skin.glowIntensity': 0.35, 'skin.pattern': 'none' }),
  P('Wraith', { 'body.height': 1.0, 'body.width': 0.88, 'body.depth': 0.9, 'body.shoulderWidth': -0.1, 'arms.thickness': 0.8, 'arms.digits': 3, 'arms.fingerLength': 0.6, 'arms.fingerThickness': -0.4,
    'tentacles.count': 5, 'tentacles.length': 1.4, 'tentacles.surface': 'smooth', 'tentacles.curl': 0.9, 'head.eyes': 'cyclops', 'head.feelers': 2, 'head.size': 1.1,
    'skin.style': 'translucent', 'skin.primary': '#4a2a8a', 'skin.secondary': '#c79bff', 'skin.marking': '#ffffff', 'skin.glow': '#d9a0ff', 'skin.glowIntensity': 0.55, 'skin.pattern': 'veins', 'tentacles.color': '#6a44b0', 'tentacles.glow': '#f1dcff' }),
  P('Brute', { 'body.height': 0.84, 'body.width': 1.25, 'body.depth': 1.2, 'body.shoulderWidth': 0.75, 'body.curve': 0.5, 'arms.thickness': 1.3, 'arms.handSize': 1.25, 'arms.hand': 'broad', 'arms.digits': 3,
    'tentacles.count': 3, 'tentacles.thickness': 1.5, 'tentacles.region': 'mid', 'head.eyes': 'trio', 'head.crest': 'ridge', 'head.size': 0.9,
    'skin.style': 'dark', 'skin.primary': '#2a1a14', 'skin.secondary': '#8a4a2a', 'skin.marking': '#ffb36a', 'skin.glow': '#ff8a3a', 'skin.glowIntensity': 0.25, 'skin.pattern': 'stripes', 'tentacles.color': '#4a2a1a', 'tentacles.glow': '#ffd9a0' }),
  P('Mantis', { 'body.height': 0.98, 'body.width': 0.92, 'body.depth': 0.92, 'body.shoulderWidth': 0.0, 'body.lean': 0.25, 'arms.length': 1.15, 'arms.thickness': 0.85, 'arms.hand': 'slender', 'arms.digits': 2, 'arms.fingerLength': 0.7,
    'tentacles.count': 4, 'head.eyes': 'cluster', 'head.crest': 'fan', 'head.feelers': 2, 'head.size': 1.05,
    'skin.style': 'ridged', 'skin.primary': '#16401a', 'skin.secondary': '#8ad04a', 'skin.marking': '#e6ff9a', 'skin.glow': '#b8ff5a', 'skin.glowIntensity': 0.45, 'skin.pattern': 'bands', 'tentacles.color': '#2a6a22', 'tentacles.glow': '#e6ffc0' }),
  P('Siren', { 'body.height': 0.9, 'body.width': 0.95, 'body.shoulderWidth': 0.0, 'body.curve': 0.2, 'arms.length': 1.1, 'arms.thickness': 0.9, 'arms.digits': 4, 'arms.fingerSpacing': 0.3,
    'tentacles.count': 6, 'tentacles.length': 1.3, 'tentacles.surface': 'smooth', 'head.eyes': 'pair', 'head.fins': 2, 'head.crest': 'fan', 'head.size': 1.05,
    'skin.style': 'luminous', 'skin.primary': '#0e3a6a', 'skin.secondary': '#4ad0e8', 'skin.marking': '#d6fbff', 'skin.glow': '#6ae0ff', 'skin.glowIntensity': 0.75, 'skin.pattern': 'spots', 'tentacles.color': '#1f6aa0', 'tentacles.glow': '#d6fbff' }),
  P('Ember', { 'body.height': 0.9, 'body.width': 1.08, 'body.shoulderWidth': 0.4, 'arms.hand': 'broad', 'arms.digits': 4, 'tentacles.count': 4, 'tentacles.curl': 0.4,
    'head.eyes': 'trio', 'head.crest': 'ridge', 'head.fins': 1,
    'skin.style': 'luminous', 'skin.primary': '#4a1a10', 'skin.secondary': '#e0702a', 'skin.marking': '#ffd56a', 'skin.glow': '#ff8a3a', 'skin.glowIntensity': 0.7, 'skin.pattern': 'bands', 'tentacles.color': '#7a2e14', 'tentacles.glow': '#ffd9a0' }),
];

// Body limits depend on how much the player's own camera needs: derived, never user-set. Used by the layout and the tests.
export const CAMERA = { eye: 1.6, clearance: 0.18 };
