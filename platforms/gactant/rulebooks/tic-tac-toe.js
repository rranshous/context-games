// Tic-tac-toe: two places, X and O; X moves first. An action is { cell: 0-8 },
// numbered left to right, top to bottom.

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function init(seed, options) {
  return { board: [null, null, null, null, null, null, null, null, null], places: { X: null, O: null }, turn: 'X' };
}

function join(state, player, request) {
  if (Object.values(state.places).some((p) => p && p.id === player.id)) throw new Error('you already have a place here');
  const mark = !state.places.X ? 'X' : !state.places.O ? 'O' : null;
  if (!mark) throw new Error('both places are taken');
  state.places[mark] = player;
  return state;
}

function move(state, player, action) {
  if (!state.places.X || !state.places.O) throw new Error('waiting for a second player');
  if (result(state)) throw new Error('the game is over');
  const mine = Object.keys(state.places).find((m) => state.places[m].id === player.id);
  if (!mine) throw new Error('you have no place in this match');
  if (mine !== state.turn) throw new Error(`it's ${state.turn}'s turn`);
  const cell = action && action.cell;
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new Error('cell is 0 to 8');
  if (state.board[cell]) throw new Error('that cell is taken');
  state.board[cell] = mine;
  state.turn = mine === 'X' ? 'O' : 'X';
  return state;
}

function view(state, player) {
  const you = player ? Object.keys(state.places).find((m) => state.places[m] && state.places[m].id === player.id) || null : null;
  return { board: state.board, turn: state.turn, you, players: { X: state.places.X && state.places.X.name, O: state.places.O && state.places.O.name }, result: result(state) };
}

function result(state) {
  for (const [a, b, c] of LINES) {
    const mark = state.board[a];
    if (mark && mark === state.board[b] && mark === state.board[c]) return { winner: mark, line: [a, b, c], winners: [state.places[mark].id] };
  }
  if (state.board.every(Boolean)) return { draw: true, winners: [] };
  return null;
}
