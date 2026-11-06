import { Shellback } from './shellback.js';

// The testing chapter: a generated deck, security androids, something to absorb. Death starts the chapter again in a new body, in a newly generated place, knowing what you knew.
// No story lives here. It exists to answer one question: is absorbing, evolving and using what you became satisfying?
const BAY = [[-3.4, 2.6], [3.6, 4.2]];

export class Lab {
  constructor(game) {
    this.g = game; this.chapter = 1; this.lives = 1;
    const $ = (id) => document.getElementById(id);
    const tag = document.querySelector('#menu-main .tagline, .tagline'); if (tag) tag.innerHTML = 'Evolution prototype.<br>Absorb. Change. Survive.';
    $('btn-new')?.classList.add('hidden'); $('btn-space')?.classList.add('hidden');
    if ($('st-cp')) $('st-cp').textContent = 'TEST CHAPTER';
    if ($('st-hp')) $('st-hp').textContent = 'VITALITY 100';
    const dead = $('menu-dead'); if (dead) { const h = dead.querySelector('h2'); if (h) h.textContent = 'THIS BODY IS GONE'; const r = $('btn-retry'); if (r) r.textContent = 'RETURN'; }
    $('btn-restart') && ($('btn-restart').textContent = 'RESTART THE CHAPTER');
    game.arsenal.bar?.remove();
    game.arsenal.cache.visible = false;
  }

  start(firstTime) {
    const g = this.g, p = g.player;
    g.audio.init();
    g.ui.hideMenus();
    g.opening.active = false; g.state = 'playing'; g.cinePose = null; g.paused = false;
    document.body.classList.remove('intro');
    g.clearCritters();
    g.newRun();
    g.resetEncounter();
    g.lightList = null; g.lightT = 0;       // the room's own lights, straight away
    g.level.emergencyOn = false;
    if (firstTime) g.evolution.resetRun();
    p.maxHealth = 100; if (firstTime) p.health = 100;
    p.reset(0, 6.2, 0); p.pitch = -0.05; if (!firstTime) p.health = Math.max(p.health, 100);
    this.populate();
    g.ui.showHud(true); g.ui.setObjective(''); g.ui.setGoal(`TEST CHAPTER ${this.chapter}  ·  LIFE ${this.lives}`); g.ui.fade(0);
    g.ui.setHealth(p.health, p.maxHealth);
    g.lockRetries = 0; g.input.lock();
  }

  populate() {
    const g = this.g;
    for (const [x, z] of BAY) g.critters.push(new Shellback(g, x, z));
    for (const r of g.run.rooms) if (r.voiceSpot && !r.voiceSpot.y) g.critters.push(new Shellback(g, r.voiceSpot.x, r.voiceSpot.z));
  }

  // Death. A new individual, a new place. The body and what grew on it are gone; what you discovered is not.
  reincarnate() { this.lives++; this.g.deathT = 0; this.g.deathMenu = false; this.g.deathPuddle.visible = false; this.g.body.deathK = 0; this.g.player.dead = false; this.g.player.health = 100; this.start(true); }

  // Chapter finished: what you became comes with you.
  clear() {
    const g = this.g; this.chapter++;
    g.evolution.toast('CHAPTER CLEARED', 'YOU KEEP WHAT YOU BECAME', 'The next deck is a new one.', 3);
    g.encounter.won = false;
    this.start(false);
  }
}
