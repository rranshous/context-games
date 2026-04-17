import { sendCommand, getLookText, getTurnCount } from '../engine/game-api.js';
import { GameOutput } from '../engine/types.js';

const MODEL = 'anthropic/claude-haiku-4.5';
const API_URL = '/api/inference/openrouter/chat/completions';

export interface ActantTurn {
  turn: number;
  prompt: string;
  response: string;
  command: string;
  gameOutput: string;
  gameOutputs: GameOutput[];
  timestamp: number;
}

export type ActantListener = (turn: ActantTurn) => void;

// ─── State ──────────────────────────────────────────────────

let transcript: string[] = [];
let history: ActantTurn[] = [];
let listeners: ActantListener[] = [];
let thinking = false;

export function getHistory(): ActantTurn[] {
  return history;
}

export function isThinking(): boolean {
  return thinking;
}

export function onTurn(fn: ActantListener): void {
  listeners.push(fn);
}

// ─── Inference ──────────────────────────────────────────────

function buildPrompt(): string {
  // Give the actant the recent transcript (last 30 lines to keep context reasonable)
  const recent = transcript.slice(-30).join('\n');

  return `You are playing a text adventure game. Here is what you see:

${recent}

Based on what you see, decide what command to type next. You can use commands like: look, go <direction>, take <item>, drop <item>, examine <item>, inventory, status, help.

Directions: north/south/east/west (or n/s/e/w).

Explore the world. Pick up interesting items. Try to visit every room.

Respond with ONLY the command you want to type. Nothing else. Just the command.`;
}

async function callModel(prompt: string): Promise<string> {
  const body = {
    model: MODEL,
    messages: [
      { role: 'user', content: prompt },
    ],
    max_tokens: 50,
    temperature: 0.7,
  };

  console.log('[ACTANT] Calling model...', MODEL);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Inference failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() ?? '';
  console.log('[ACTANT] Model responded:', content);
  return content;
}

function parseModelResponse(raw: string): string {
  // The model should return just a command, but clean it up
  // Remove any markdown formatting, quotes, extra whitespace
  let cmd = raw.replace(/^```\w*\n?/gm, '').replace(/```$/gm, '').trim();
  cmd = cmd.replace(/^["'>]+/, '').replace(/["']+$/, '').trim();
  // Take only the first line if multi-line
  cmd = cmd.split('\n')[0].trim();
  // Remove any leading prompt char
  cmd = cmd.replace(/^>\s*/, '');
  return cmd.toLowerCase();
}

// ─── Step ───────────────────────────────────────────────────

export async function step(): Promise<ActantTurn> {
  if (thinking) throw new Error('Already thinking');
  thinking = true;

  try {
    // If transcript is empty, do an initial "look"
    if (transcript.length === 0) {
      const lookResult = sendCommand('look');
      transcript.push(`> look\n${lookResult.text}`);
    }

    const prompt = buildPrompt();
    const raw = await callModel(prompt);
    const command = parseModelResponse(raw);

    console.log(`[ACTANT] Executing: "${command}"`);

    // Execute the command through the game API
    const result = sendCommand(command);

    // Add to transcript
    transcript.push(`> ${command}\n${result.text}`);

    const turn: ActantTurn = {
      turn: getTurnCount(),
      prompt,
      response: raw,
      command,
      gameOutput: result.text,
      gameOutputs: result.outputs,
      timestamp: Date.now(),
    };

    history.push(turn);
    for (const fn of listeners) fn(turn);

    return turn;
  } finally {
    thinking = false;
  }
}
