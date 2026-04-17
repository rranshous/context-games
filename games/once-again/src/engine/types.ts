export interface Room {
  id: string;
  name: string;
  description: string;
  exits: Record<string, string>; // direction → roomId
  items: string[];               // item IDs present in the room
  firstVisit: boolean;
  onEnter?: (state: GameState) => GameOutput[];
}

export interface Item {
  id: string;
  name: string;
  description: string;
  systemDescription: string; // the over-grandiose System version
  takeable: boolean;
  effects: Record<string, number>; // stat → modifier
  usable: boolean;
  onUse?: (state: GameState) => GameOutput[];
}

export interface GameState {
  currentRoom: string;
  inventory: string[];
  statusScreen: Record<string, number>;
  visitedRooms: Set<string>;
  flags: Record<string, any>;
  turnCount: number;
}

export interface Command {
  verb: string;
  noun: string;
  fullInput: string;
}

export type OutputType = 'normal' | 'system' | 'error' | 'narration';

export interface GameOutput {
  text: string;
  type: OutputType;
}
