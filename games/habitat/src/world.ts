// world.ts — Shared world object. Both human UI and actants get the same instance.

import { TicTacToeServer, type Game } from './game-server';

export interface World {
  games: {
    ticTacToe: {
      createGame(handle: string): Game;
      joinGame(gameId: string, handle: string): Game;
      makeMove(gameId: string, handle: string, position: number): Game;
      getGame(gameId: string): Game | null;
      listGames(): Game[];
    };
  };
}

export function buildWorld(tttServer: TicTacToeServer): World {
  return {
    games: {
      ticTacToe: {
        createGame: (handle) => tttServer.createGame(handle),
        joinGame: (gameId, handle) => tttServer.joinGame(gameId, handle),
        makeMove: (gameId, handle, pos) => tttServer.makeMove(gameId, handle, pos),
        getGame: (gameId) => tttServer.getGame(gameId),
        listGames: () => tttServer.listGames(),
      },
    },
  };
}
