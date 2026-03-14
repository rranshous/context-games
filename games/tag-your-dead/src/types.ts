export interface Position {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'cactus' | 'barrel';
}

export interface CarState {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  isIt: boolean;
  alive: boolean;
  itTimer: number;        // seconds left if "it"
  immuneTimer: number;    // seconds of tag immunity remaining
  color: CarColor;
}

export type CarColor = 'red' | 'blue' | 'green' | 'yellow' | 'police' | 'npc';

export interface SomaSection {
  content: string;
}

export interface CarSoma {
  identity: SomaSection;
  on_tick: SomaSection;
  memory: SomaSection;
}

export interface RoundResult {
  roundNumber: number;
  placement: number;         // 1 = winner
  totalCars: number;
  survivedSeconds: number;
  tagsGiven: number;
  tagsReceived: number;
  wasEliminated: boolean;
}

export type GamePhase = 'title' | 'countdown' | 'playing' | 'round_over' | 'reflecting' | 'game_over';
