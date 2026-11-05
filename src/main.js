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

// loading progress: everything goes through the default loading manager, so the bar simply follows it
THREE.DefaultLoadingManager.onProgress = (url, done, total) => window.__intruderLoad?.(0.92 * done / total, 'LOADING  ' + Math.round(100 * done / total) + '%');

const [geos, kit, hand, home] = await Promise.all([loadArmModels(), loadKit(), loadHand(), loadHome(), loadLander().catch((e) => console.warn('lander model unavailable, using the stand-in', e)), loadVessel().catch((e) => console.warn('vessel model unavailable, using the stand-in', e)), loadWarship().catch((e) => console.warn('warship model unavailable', e)), loadInterceptor().catch((e) => console.warn('interceptor model unavailable', e)), loadAlien().catch((e) => console.warn('creature model unavailable, using the old body', e))]);
window.__intruderLoad?.(0.95, 'BUILDING THE SHIP');
await new Promise((r) => setTimeout(r, 40));            // let the message paint: the next step takes a moment on a phone
new Game(document.getElementById('game'), geos, kit, hand, home);
window.__intruderDone?.();

// Installable and playable offline once loaded (network first, so a new build always wins when online).
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});

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
