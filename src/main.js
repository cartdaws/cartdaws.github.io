import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';
import { loadKit } from './world/kit.js';
import { loadHand } from './presentation/hand.js';
import { loadRobots } from './game/enemies/robotAsset.js';
import { loadTentacle } from './presentation/tentacles.js';
import { loadHome } from './world/home.js';
import { loadCreatureAsset } from './creature/shape.js';
import { loadParts } from './creature/parts.js';
import { save } from './core/save.js';

const [geos, kit, hand, robots, tentacle, home, creature] = await Promise.all([loadArmModels(), loadKit(), loadHand(), loadRobots(), loadTentacle(), loadHome(), loadCreatureAsset()]);
creature.parts = await loadParts();
// a saved creature with a non-default hand structure needs it before the first frame
{ const a = save.creature.arms; await hand.ensure(a.hand[0] + a.digits); }
new Game(document.getElementById('game'), geos, kit, hand, robots, tentacle, home, creature);
