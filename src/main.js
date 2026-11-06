import * as THREE from 'three';
import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';
import { loadKit } from './world/kit.js';
import { loadHand } from './presentation/hand.js';
import { loadHome } from './world/home.js';
import { loadLander, loadVessel, loadWarship } from './game/flight.js';
import { loadInterceptor } from './game/flightCombat.js';
import { loadAlien } from './game/alien.js';
import { loadV2Assets } from './v2/assets.js';
import { LAB } from './v2/flags.js';
import { loadWorlds } from './world/surface.js';

// loading progress: everything goes through the default loading manager, so the bar simply follows it
THREE.DefaultLoadingManager.onProgress = (url, done, total) => window.__intruderLoad?.(0.92 * done / total, 'LOADING  ' + Math.round(100 * done / total) + '%');

const [geos, kit, hand, home] = await Promise.all([loadArmModels(), loadKit(), loadHand(), loadHome(), LAB ? loadV2Assets() : null, loadLander().catch((e) => console.warn('lander model unavailable, using the stand-in', e)), loadVessel().catch((e) => console.warn('vessel model unavailable, using the stand-in', e)), loadWarship().catch((e) => console.warn('warship model unavailable', e)), loadInterceptor().catch((e) => console.warn('interceptor model unavailable', e)), loadAlien().catch((e) => console.warn('creature model unavailable, using the old body', e)), loadWorlds().catch((e) => console.warn('worlds unavailable', e))]);
window.__intruderLoad?.(0.95, 'BUILDING THE SHIP');
await new Promise((r) => setTimeout(r, 40));            // let the message paint: the next step takes a moment on a phone
new Game(document.getElementById('game'), geos, kit, hand, home);
window.__intruderDone?.();

// Installable and playable offline once loaded (network first, so a new build always wins when online).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  saveForOffline();     // this line runs after everything above has loaded, so the page's load event is already over
}

// One visit is enough to play with no signal: save every file on the device, then say so on the start menu.
// The worker alone cannot do this, because it only starts watching after the first page has already loaded.
async function saveForOffline() {
  if (!('caches' in window)) return;
  const say = (t) => { const el = document.querySelector('.build-tag'); if (el) { el.dataset.base = el.dataset.base || el.textContent; el.textContent = el.dataset.base + '  ·  ' + t; } };
  try {
    const list = await (await fetch('precache.json', { cache: 'no-store' })).json();
    const cache = await caches.open('intruderv2-v1');
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('intruderv2-saved') || '{}'); } catch { /* private mode */ }
    let done = 0;
    for (const f of list) {
      const url = new URL(f.u, document.baseURI).href;
      if (saved[f.u] !== f.h || !(await cache.match(url, { ignoreVary: true }))) {
        const res = await fetch(url, { cache: 'reload' });
        if (!res.ok) throw new Error(f.u);
        await cache.put(url, res);
        saved[f.u] = f.h;
        try { localStorage.setItem('intruderv2-saved', JSON.stringify(saved)); } catch { /* private mode */ }
      }
      say('SAVING FOR OFFLINE ' + Math.round(++done / list.length * 100) + '%');
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    try { localStorage.setItem('intruderv2-saved-all', '1'); } catch { /* private mode */ }
    say('READY OFFLINE');
  } catch {
    // no network right now: fine if an earlier visit finished saving
    let all = false; try { all = !!localStorage.getItem('intruderv2-saved-all'); } catch { /* private mode */ }
    say(all ? 'READY OFFLINE' : 'NOT SAVED YET  ·  NEEDS SIGNAL');
  }
}

// A browser's own bars eat a phone's screen: say how to get the fullscreen version.
{
  const standalone = navigator.standalone || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  if (document.body.classList.contains('touch') && !standalone) {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const tip = document.createElement('div'); tip.id = 'pwa-tip';
    tip.textContent = ios ? 'For fullscreen: Share, then Add to Home Screen' : 'For fullscreen: browser menu, then Add to Home Screen';
    document.getElementById('menu-start')?.appendChild(tip);
  }
}
