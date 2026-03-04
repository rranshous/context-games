// game-server.ts — Pure tic-tac-toe state machine. No AI knowledge.

export interface Game {
  id: string;
  board: (string | null)[];  // 9 cells, null=empty, otherwise playerHandle
  players: { X: string; O: string | null };
  turn: 'X' | 'O';
  status: 'waiting' | 'active' | 'finished';
  winner: string | null;  // winning handle, 'draw', or null
}

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // cols
  [0, 4, 8], [2, 4, 6],             // diags
];

let nextId = 1;

export class TicTacToeServer {
  private games: Map<string, Game> = new Map();

  createGame(playerHandle: string): Game {
    const id = `g${nextId++}`;
    const game: Game = {
      id,
      board: Array(9).fill(null),
      players: { X: playerHandle, O: null },
      turn: 'X',
      status: 'waiting',
      winner: null,
    };
    this.games.set(id, game);
    console.log(`[TTT] Game ${id}: created by "${playerHandle}" (waiting for opponent)`);
    return structuredClone(game);
  }

  joinGame(gameId: string, playerHandle: string): Game {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    if (game.status !== 'waiting') throw new Error(`Game ${gameId} is not waiting for players`);
    if (game.players.X === playerHandle) throw new Error(`Cannot play against yourself`);

    game.players.O = playerHandle;
    game.status = 'active';
    console.log(`[TTT] Game ${gameId}: "${playerHandle}" joined (X: "${game.players.X}", O: "${playerHandle}")`);
    return structuredClone(game);
  }

  makeMove(gameId: string, playerHandle: string, position: number): Game {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    if (game.status !== 'active') throw new Error(`Game ${gameId} is not active`);
    if (position < 0 || position > 8) throw new Error(`Invalid position ${position} (must be 0-8)`);
    if (game.board[position] !== null) throw new Error(`Position ${position} is already taken`);

    // Check it's this player's turn
    const currentPlayer = game.turn === 'X' ? game.players.X : game.players.O;
    if (currentPlayer !== playerHandle) {
      throw new Error(`Not your turn (current turn: "${currentPlayer}")`);
    }

    // Place the mark
    game.board[position] = playerHandle;
    console.log(`[TTT] Game ${gameId}: "${playerHandle}" plays position ${position}`);

    // Check for win
    const winnerHandle = this.checkWinner(game);
    if (winnerHandle) {
      game.status = 'finished';
      game.winner = winnerHandle;
      console.log(`[TTT] Game ${gameId}: "${winnerHandle}" wins!`);
    } else if (game.board.every(cell => cell !== null)) {
      game.status = 'finished';
      game.winner = 'draw';
      console.log(`[TTT] Game ${gameId}: draw`);
    } else {
      game.turn = game.turn === 'X' ? 'O' : 'X';
    }

    return structuredClone(game);
  }

  getGame(gameId: string): Game | null {
    const game = this.games.get(gameId);
    return game ? structuredClone(game) : null;
  }

  listGames(): Game[] {
    return Array.from(this.games.values()).map(g => structuredClone(g));
  }

  toJSON(): Game[] {
    return Array.from(this.games.values());
  }

  static fromJSON(data: Game[]): TicTacToeServer {
    const server = new TicTacToeServer();
    for (const g of data) {
      server.games.set(g.id, g);
      const num = parseInt(g.id.slice(1));
      if (num >= nextId) nextId = num + 1;
    }
    return server;
  }

  private checkWinner(game: Game): string | null {
    for (const [a, b, c] of WIN_LINES) {
      if (game.board[a] && game.board[a] === game.board[b] && game.board[b] === game.board[c]) {
        return game.board[a];
      }
    }
    return null;
  }
}
