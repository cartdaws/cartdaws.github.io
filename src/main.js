import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';
import { loadKit } from './world/kit.js';
import { loadHand } from './presentation/hand.js';
import { loadHome } from './world/home.js';
import { loadLander, loadVessel } from './game/flight.js';
import { loadAlien } from './game/alien.js';

const [geos, kit, hand, home] = await Promise.all([loadArmModels(), loadKit(), loadHand(), loadHome(), loadLander().catch((e) => console.warn('lander model unavailable, using the stand-in', e)), loadVessel().catch((e) => console.warn('vessel model unavailable, using the stand-in', e)), loadAlien().catch((e) => console.warn('creature model unavailable, using the old body', e))]);
new Game(document.getElementById('game'), geos, kit, hand, home);
