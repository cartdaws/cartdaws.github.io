import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';
import { loadKit } from './world/kit.js';
import { loadHand } from './presentation/hand.js';
import { loadRobots } from './game/enemies/robotAsset.js';
import { loadTentacle } from './presentation/tentacles.js';
import { loadHome } from './world/home.js';
import { loadCreatureAsset } from './creature/shape.js';

const [geos, kit, hand, robots, tentacle, home, creature] = await Promise.all([loadArmModels(), loadKit(), loadHand(), loadRobots(), loadTentacle(), loadHome(), loadCreatureAsset()]);
new Game(document.getElementById('game'), geos, kit, hand, robots, tentacle, home, creature);
