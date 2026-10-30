import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';
import { loadKit } from './world/kit.js';
import { loadHand } from './presentation/hand.js';

const [geos, kit, hand] = await Promise.all([loadArmModels(), loadKit(), loadHand()]);
new Game(document.getElementById('game'), geos, kit, hand);
