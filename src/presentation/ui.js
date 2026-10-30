const $ = (id) => document.getElementById(id);

// All DOM presentation: menus, HUD, hints, banners, hit markers.
export class UI {
  constructor() {
    this.hud = $('hud');
    this.menus = { start: $('menu-start'), pause: $('menu-pause'), dead: $('menu-dead'), complete: $('menu-complete') };
    this.fadeEl = $('fade');
    this.skipEl = $('skip');
    this.hitEl = $('hitmarker');
    this.vig = $('vignette');
    this.lowEl = $('lowhp');
    this.dirEl = $('dmgdir');
    this.dirT = 0;
    this.bannerEl = $('banner');
    this.subEl = $('subtitle');
    this.subT = 0;
    this.hintEl = $('hint');
    this.hintQueue = [];
    this.hintTimer = 0;
    this.hitT = 0; this.vigT = 0; this.bannerT = 0;
    this.lastHealth = -1;
  }

  showMenu(name) {
    for (const [k, el] of Object.entries(this.menus)) el.classList.toggle('hidden', k !== name);
  }
  hideMenus() { for (const el of Object.values(this.menus)) el.classList.add('hidden'); }
  showHud(v) { this.hud.classList.toggle('hidden', !v); }
  showSkip(v) { this.skipEl.classList.toggle('hidden', !v); }
  fade(a) { this.fadeEl.style.opacity = a; }

  setHealth(h, max) {
    const v = Math.max(0, Math.ceil(h));
    if (v === this.lastHealth) return;
    this.lastHealth = v;
    $('healthFill').style.width = `${(v / max) * 100}%`;
    $('healthFill').classList.toggle('low', v <= 30);
    $('healthNum').textContent = v;
  }

  setDash(ready) {
    const f = $('dashFill');
    f.style.width = `${ready * 100}%`;
    f.classList.toggle('cooling', ready < 1);
  }

  flash(color, dur = 0.5) {
    const el = this.fadeEl;
    el.style.transition = 'none';
    el.style.background = color; el.style.opacity = 0.85;
    void el.offsetWidth;
    el.style.transition = `opacity ${dur}s ease-out`;
    el.style.opacity = 0;
    setTimeout(() => { el.style.transition = 'none'; el.style.background = '#000'; }, dur * 1000 + 50);
  }

  setPrompt(t) { const el = $('prompt'); if (el.textContent !== t) el.textContent = t; el.style.opacity = t ? 1 : 0; }
  setObjective(t) { $('objective').textContent = t; }

  hitMarker(kill) {
    this.hitEl.classList.toggle('kill', !!kill);
    this.hitEl.style.opacity = 1;
    this.hitT = kill ? 0.32 : 0.12;
  }

  damageFlash(a = 1) { this.vigT = 0.5; this.vigPeak = Math.min(1, a); }

  // angle: radians, 0 = from ahead, positive = from the right
  damageDir(angle) {
    this.dirEl.style.transform = `rotate(${angle}rad)`;
    this.dirEl.style.opacity = 1;
    this.dirT = 1.1;
  }

  setLowHealth(sev, pulse) {
    this.lowEl.style.opacity = sev > 0 ? Math.min(1, 0.25 + sev * 0.45 + pulse * 0.45 * sev) : 0;
    $('health').classList.toggle('critical', sev > 0.4);
  }

  // Subtitles for story-critical speech; speaker is a short label ('SHIP AI'), thought=true for the alien's own voice.
  subtitle(text, speaker = '', dur = 3, thought = false) {
    this.subEl.querySelector('b').textContent = speaker;
    this.subEl.querySelector('span').textContent = text;
    this.subEl.classList.toggle('thought', thought);
    this.subEl.classList.remove('hidden');
    this.subT = dur;
  }
  clearSubtitle() { this.subT = 0; this.subEl.classList.add('hidden'); }

  banner(text, color, dur) {
    this.bannerEl.textContent = text;
    this.bannerEl.className = color; // e.g. 'green goal'
    this.bannerT = dur;
    this.bannerDur = dur;
  }

  hint(text, dur = 3.5) { this.hintQueue.push({ text, dur }); }
  clearHints() { this.hintQueue.length = 0; this.hintTimer = 0; this.hintEl.classList.remove('show'); }

  clearTransient() {
    this.clearHints();
    this.hitEl.style.opacity = 0;
    this.vig.style.opacity = 0;
    this.bannerEl.style.opacity = 0;
    this.bannerT = 0; this.hitT = 0; this.vigT = 0;
    this.dirEl.style.opacity = 0; this.dirT = 0;
    this.setLowHealth(0, 0);
    this.clearSubtitle();
  }

  update(dt) {
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hitEl.style.opacity = 0; else this.hitEl.style.opacity = Math.min(1, this.hitT * 8); }
    if (this.vigT > 0) { this.vigT -= dt; this.vig.style.opacity = Math.max(0, this.vigT / 0.5) * (this.vigPeak ?? 1); }
    else if (this.vig.style.opacity !== '0') this.vig.style.opacity = 0;
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.subEl.classList.add('hidden'); }
    if (this.dirT > 0) { this.dirT -= dt; this.dirEl.style.opacity = Math.max(0, this.dirT / 1.1); }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      const k = this.bannerT / this.bannerDur;
      this.bannerEl.style.opacity = this.bannerT <= 0 ? 0 : Math.min(1, k * 4, (1 - k) * 8);
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintEl.classList.remove('show');
    } else if (this.hintQueue.length) {
      const h = this.hintQueue.shift();
      this.hintEl.textContent = h.text;
      this.hintEl.classList.add('show');
      this.hintTimer = h.dur;
    }
  }
}
