import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';
import { loadKit } from './world/kit.js';

const [geos, kit] = await Promise.all([loadArmModels(), loadKit()]);
new Game(document.getElementById('game'), geos, kit);
