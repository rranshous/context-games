// Client persistence (v0): one IndexedDB record holding the whole save.
// Everything here is either the player's secret (the aura key), their signed
// claims, or maps of work done. The universe itself is never stored.
import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, facetForm, hexToBytes, signNameClaim, spiritAt, wordBar, type NameClaim, type Spirit } from '@truenames/universe';
import type { WireSpirit } from '@truenames/meditation';
import { toWire, fromWire } from '@truenames/meditation';

export interface KnownSpirit {
  spirit: WireSpirit;
  source: 'lore' | 'scry' | 'shrine' | 'shared';
  foundAt: number;
  seen?: boolean;
}

/** A word of power you hold: the signed claim, its truths, and the facet it touched. Keyed by `cell#facet`. */
export interface NameRecord {
  claim: NameClaim;
  strength: number;
  facet: number;
}

/** A word's key: the being's cell and the facet. Loadout, deck and name book all hold these. */
export const wordKey = (cell: string, facet: number) => `${cell}#${facet}`;
export function splitWord(key: string): { cell: string; facet: number | null } {
  const i = key.indexOf('#');
  return i < 0 ? { cell: key, facet: null } : { cell: key.slice(0, i), facet: Number(key.slice(i + 1)) };
}

export interface RunRecord {
  at: number;
  world?: 'dark' | 'bastion' | 'council' | 'racer';
  descent?: number;
  wave: number;
  won: boolean;
  kills: number;
  finds: number;
}

export interface ScryPlan {
  prefix: string;
  depth: number;
  running: boolean;
}

export interface CodexView {
  tab: 'names' | 'spirits';
  q: string;
  elements: number[];
  forms: number[];
  minMag: number;
  status: 'any' | 'meditating' | 'seeking' | 'unnamed' | 'bound' | 'unbound' | 'focused';
  sort: 'truth' | 'might' | 'newest' | 'soonest' | 'generous' | 'light' | 'name';
}

export interface SaveData {
  /** 2: spec v2 (the pyramid, words of power). Older saves keep only their aura. */
  version: 2;
  aura: { secret: string; pub: string; element: number; createdAt: number } | null;
  spirits: Record<string, KnownSpirit>;
  names: Record<string, NameRecord>;
  /** `${prefix}|${depth}` -> contiguous scanned frontier (decimal) */
  scans: Record<string, string>;
  meditating: string[];
  /** Meditations given a larger share of the work. */
  focus: string[];
  scrying: ScryPlan[];
  loadout: (string | null)[];
  runs: RunRecord[];
  workers: number | null;
  /** Highest descent unlocked (0-based). */
  descent: number;
  lastDescent: number;
  /** Name Book view: tab, filters, sort. */
  codex?: CodexView;
  /** Progress in worlds beyond the Dark (whose progress is `descent` / `lastDescent`). */
  worlds?: { bastion?: { descent: number; last: number }; council?: { descent: number; last: number }; racer?: { descent: number; last: number } };
  lastWorld?: 'dark' | 'bastion' | 'council' | 'racer';
  /** The Council deck: up to twelve grasped words (`cell#facet`), played as cards. */
  councilDeck?: string[];
  /** The sanctum plan (aims), the tasks the planner owns, and the sanctum's history (see plan.ts). */
  plan?: import('./plan.ts').Aim[];
  planOwned?: { names: string[]; scries: string[] };
  history?: import('./plan.ts').HistoryLine[];
  /** An actant tending this sanctum: its goal, model, notes, and whether it is awake. */
  actant?: { on: boolean; goal: string; model: string; notes: string; lastReview?: number; joinRaces?: boolean; driving?: string; joinDark?: boolean; fighting?: string; recent?: { at: number; line: string }[] };
  /** How this sanctum is known in a choir. */
  handle?: string;
  /** The altars this sanctum belongs to (addresses, with keys); the first is home. Default: this machine's own. */
  altars?: string[];
  /** Lent meditation: whom we meditate for (renewed on reconnect), and those we accepted to meditate for us (by aura). */
  lend?: { accepted: string[]; to?: { aura: string; handle: string; altar: string; share: number } };
  /** Drop to one voice while in a world (default on). */
  quietPlay?: boolean;
  /** Set once, when a v1 save was carried into the v2 astral. */
  sundered?: boolean;
}

export function emptySave(): SaveData {
  return { version: 2, aura: null, spirits: {}, names: {}, scans: {}, meditating: [], focus: [], scrying: [], loadout: [null, null, null, null], runs: [], workers: null, descent: 0, lastDescent: 0 };
}

const DB = 'truenames';
const STORE = 'kv';
const KEY = 'save';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function loadSave(): Promise<SaveData> {
  try {
    const db = await openDb();
    const v = await new Promise<SaveData | undefined>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result as SaveData | undefined);
      r.onerror = () => rej(r.error);
    });
    if (!v) return emptySave();
    if ((v as { version: number }).version !== 2) {
      // a new universe (spec v2): every spirit moved and every name is gone. Keep only who you are.
      console.info('[save] spec v1 save: keeping the aura, starting the new astral fresh');
      return { ...emptySave(), aura: v.aura, sundered: true } as SaveData;
    }
    const save = { ...emptySave(), ...v };
    // older saves had six slots: keep four, moving any stranded names into free slots
    const keep = save.loadout.slice(0, 4);
    for (const extra of save.loadout.slice(4)) {
      const free = keep.indexOf(null);
      if (extra && free >= 0 && !keep.includes(extra)) keep[free] = extra;
    }
    while (keep.length < 4) keep.push(null);
    save.loadout = keep;
    return save;
  } catch (e) {
    console.warn('[save] load failed, starting fresh', e);
    return emptySave();
  }
}

let pending: SaveData | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function writeSave(s: SaveData): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(s)), KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Debounced save (at most every 1.5s). */
export function persist(s: SaveData) {
  pending = s;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const p = pending;
    pending = null;
    if (p) writeSave(p).catch((e) => console.warn('[save] write failed', e));
  }, 1500);
}

export async function wipeSave() {
  const db = await openDb();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => res();
  });
}

// ---------- aura ----------

export function newAura(element: number) {
  const sk = ed25519.utils.randomSecretKey();
  return { secret: bytesToHex(sk), pub: bytesToHex(ed25519.getPublicKey(sk)), element, createdAt: Date.now() };
}

export function signClaim(save: SaveData, cell: string, nonce: bigint): NameClaim {
  if (!save.aura) throw new Error('no aura');
  return signNameClaim(cell, nonce, hexToBytes(save.aura.secret));
}

// ---------- spirits ----------

export function rememberSpirit(save: SaveData, s: Spirit, source: KnownSpirit['source']): boolean {
  if (save.spirits[s.cell]) return false;
  save.spirits[s.cell] = { spirit: toWire(s), source, foundAt: Date.now() };
  return true;
}

/** The being for a cell or a word key. */
export function spiritOf(save: SaveData, cellOrWord: string): Spirit | null {
  const k = save.spirits[splitWord(cellOrWord).cell];
  return k ? fromWire(k.spirit) : null;
}

/** A word as the client draws it: its being, with `form` set to this facet's form. */
export function wordView(save: SaveData, key: string): (Spirit & { facet: number; bar: number }) | null {
  const { cell, facet } = splitWord(key);
  const sp = spiritOf(save, cell) ?? spiritAt(cell);
  if (!sp) return null;
  const f = facet ?? 0;
  return { ...sp, facet: f, bar: wordBar(sp.magnitude), traits: { ...sp.traits, form: facetForm(sp.traits, f) } };
}
