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

function getScreenText(): string {
  // Grab the actual text from the game output, exactly as the player sees it
  const outputEl = document.getElementById('output');
  return outputEl?.innerText ?? '';
}

function buildPrompt(): string {
  const screen = transcript.length === 0 ? getScreenText() : transcript.slice(-40).join('\n');
  return screen + '\n\n>';
}

async function callModel(prompt: string): Promise<string> {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: 'You are playing a text adventure. Respond with only a short command (1-4 words). No prose, no narration, no markdown.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 20,
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
  // Strip everything that isn't the command
  let cmd = raw
    .replace(/```[\s\S]*?```/g, '')     // code blocks
    .replace(/^#+\s*/gm, '')            // markdown headers
    .replace(/^[*_~`>]+/gm, '')         // markdown formatting at line start
    .replace(/[*_~`]+$/gm, '')          // markdown formatting at line end
    .replace(/^["']+|["']+$/g, '')      // quotes
    .trim();
  // Take only the first non-empty line
  cmd = cmd.split('\n').map(l => l.trim()).filter(l => l.length > 0)[0] || '';
  // Remove leading prompt char
  cmd = cmd.replace(/^>\s*/, '');
  return cmd.toLowerCase();
}

// ─── Step ───────────────────────────────────────────────────

export async function step(): Promise<ActantTurn> {
  if (thinking) throw new Error('Already thinking');
  thinking = true;

  try {
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
