// The game controls window: the game's own gamepad layout, as a reference while mapping.
import { TARGET_BY_ID } from '../shared/controls.js';
import { GAMES } from '../shared/games.js';
import { targetIcon } from './icons.js';

const game = GAMES.find((g) => g.id === new URLSearchParams(location.search).get('game')) ?? GAMES[0];
const $ = (selector) => document.querySelector(selector);

document.title = `${game.name} controls`;
$('#ref-title').textContent = game.name;
$('#ref-sub').textContent = game.source;

for (const { action, target } of game.controls) {
  const row = document.createElement('li');
  row.className = 'ref-row';
  row.innerHTML = `<span class="ref-action"></span><span class="ref-button">${targetIcon(target)}<span class="ref-button-name"></span></span>`;
  row.querySelector('.ref-action').textContent = action;
  row.querySelector('.ref-button-name').textContent = TARGET_BY_ID[target].name;
  $('#ref-list').append(row);
}
