// A shared canvas: anyone may join, nobody takes turns, and it never ends. Each player
// draws strokes in their own color; the canvas keeps the newest strokes.
// An action is a stroke: { points: [[x, y], ...], color?, width? }, x and y from 0 to 1
// across and down the canvas (a longer line is sent as several strokes); or { clear: true }
// to remove your own strokes.

const MAX_STROKES = 300;   // with up to 40 points each, the canvas stays under the 200,000 characters a state may be
const MAX_POINTS = 40;
const PALETTE = ['#e8a33d', '#4fa3e0', '#e05a7a', '#5fc27a', '#a77de0', '#e0d24f', '#4fd0c8', '#e07a4f'];

function init(seed, options) {
  return { strokes: [], players: [] };
}

function join(state, player, request) {
  if (state.players.some((p) => p.id === player.id)) throw new Error('you are already drawing here');
  if (state.players.length >= 32) throw new Error('the canvas is full of people');
  state.players.push({ id: player.id, name: player.name, color: PALETTE[state.players.length % PALETTE.length] });
  return state;
}

function move(state, player, action) {
  const me = state.players.find((p) => p.id === player.id);
  if (!me) throw new Error('join to draw');
  if (action && action.clear) {
    state.strokes = state.strokes.filter((s) => s.by !== me.id);
    return state;
  }
  const points = action && action.points;
  if (!Array.isArray(points) || points.length < 1 || points.length > MAX_POINTS) throw new Error(`a stroke is 1 to ${MAX_POINTS} points`);
  const clean = points.map((p) => {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number') throw new Error('a point is [x, y]');
    return [Math.round(Math.min(1, Math.max(0, p[0])) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, p[1])) * 1000) / 1000];
  });
  const color = /^#[0-9a-f]{6}$/i.test(String(action.color)) ? action.color : me.color;
  const width = Math.min(40, Math.max(1, Number(action.width) || 4));
  state.strokes.push({ by: me.id, color, width, points: clean });
  if (state.strokes.length > MAX_STROKES) state.strokes = state.strokes.slice(-MAX_STROKES);
  return state;
}

function view(state, player) {
  const me = player ? state.players.find((p) => p.id === player.id) : null;
  return {
    strokes: state.strokes.map((s) => ({ color: s.color, width: s.width, points: s.points, mine: Boolean(me && s.by === me.id) })),
    players: state.players.map((p) => ({ name: p.name, color: p.color })),
    you: me ? { name: me.name, color: me.color } : null,
  };
}

function result(state) {
  return null;
}
