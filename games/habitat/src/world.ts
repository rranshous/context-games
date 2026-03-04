// world.ts — Shared world object. Both human UI and actants get the same instance.

import { TicTacToeServer, type Game } from './game-server';
import { ChatServer, type ChatMessage } from './chat-server';
import { CanvasServer } from './canvas-server';
import { NotepadServer } from './notepad-server';
import { BoardServer, type BoardPost } from './board-server';

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
  social: {
    chat: {
      post(handle: string, text: string): ChatMessage;
      read(count?: number): ChatMessage[];
      all(): ChatMessage[];
    };
  };
  art: {
    sharedCanvas: {
      read(): string;
      paint(art: string): void;
      clear(): void;
    };
  };
  commons: {
    notepads: {
      read(name: string): string | null;
      write(name: string, data: string): void;
      list(): string[];
      clear(name: string): void;
    };
    board: {
      post(handle: string, title: string, body: string): BoardPost;
      read(count?: number): BoardPost[];
      remove(id: string): { success: boolean; error?: string };
    };
  };
}

export function buildWorld(
  tttServer: TicTacToeServer,
  chatServer: ChatServer,
  canvasServer: CanvasServer,
  notepadServer: NotepadServer,
  boardServer: BoardServer,
): World {
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
    social: {
      chat: {
        post: (handle, text) => chatServer.post(handle, text),
        read: (count) => chatServer.read(count),
        all: () => chatServer.all(),
      },
    },
    art: {
      sharedCanvas: {
        read: () => canvasServer.read(),
        paint: (art) => canvasServer.paint(art),
        clear: () => canvasServer.clear(),
      },
    },
    commons: {
      notepads: {
        read: (name) => notepadServer.read(name),
        write: (name, data) => notepadServer.write(name, data),
        list: () => notepadServer.list(),
        clear: (name) => notepadServer.clear(name),
      },
      board: {
        post: (handle, title, body) => boardServer.post(handle, title, body),
        read: (count) => boardServer.read(count),
        remove: (id) => boardServer.remove(id),
      },
    },
  };
}
