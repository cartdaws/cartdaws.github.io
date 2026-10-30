import './presentation/style.css';
import { Game } from './game/game.js';
import { loadArmModels } from './presentation/models.js';

const geos = await loadArmModels();
new Game(document.getElementById('game'), geos);
