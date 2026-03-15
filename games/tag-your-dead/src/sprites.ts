// ── Sprites ──
// Loads car + terrain sprites from raceon's mini-pixel-pack.
// Cars use frame 0 + canvas rotation for smooth turning.

import { CarColor } from './types.js';

const ASSET_BASE = 'assets/mini-pixel-pack-2';
const FRAME_SIZE = 16;
const CAR_SCALE = 1.8;

// Sprite images
let carImages: Record<string, HTMLImageElement> = {};
let desertDetailsImg: HTMLImageElement | null = null;
let miscPropsImg: HTMLImageElement | null = null;
let loaded = false;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export async function loadSprites(): Promise<void> {
  try {
    const [red, blue, green, yellow, police, npc, desert, props] = await Promise.all([
      loadImage(`${ASSET_BASE}/Cars/Player_red%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Player_blue%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Player_green%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Player_yellow%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Police%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/NPC_cars%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Levels/Desert_details%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Props/Misc_props%20(16%20x%2016).png`),
    ]);
    carImages = { red, blue, green, yellow, police, npc };
    desertDetailsImg = desert;
    miscPropsImg = props;
    loaded = true;
    console.log('[SPRITES] All sprites loaded');
  } catch (err) {
    console.warn('[SPRITES] Failed to load sprites, using shape fallbacks:', err);
  }
}

export function spritesLoaded(): boolean {
  return loaded;
}

const COLOR_MAP: Record<CarColor, string> = {
  red: '#c03030',
  blue: '#3050c0',
  green: '#30a040',
  yellow: '#c0a020',
  police: '#2060a0',
  npc: '#808080',
};

export function renderCar(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  angle: number,
  color: CarColor,
  isIt: boolean,
  immuneTimer: number,
): void {
  const scaledW = FRAME_SIZE * CAR_SCALE;
  const scaledH = FRAME_SIZE * CAR_SCALE;

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angle + Math.PI / 2);

  const img = carImages[color];
  if (img) {
    ctx.drawImage(
      img,
      0, 0, FRAME_SIZE, FRAME_SIZE,
      -scaledW / 2, -scaledH / 2, scaledW, scaledH,
    );
  } else {
    // Shape fallback
    ctx.fillStyle = COLOR_MAP[color] || '#888';
    ctx.fillRect(-10, -6, 20, 12);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(6, -3);
    ctx.lineTo(6, 3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  // "IT" indicator — red glow ring
  if (isIt) {
    ctx.save();
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    ctx.beginPath();
    ctx.arc(screenX, screenY, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Immunity shimmer
  if (immuneTimer > 0) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(performance.now() / 80);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(screenX, screenY, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Desert terrain tiles
const DETAIL_SCALE = 2.0;
const DETAIL_TILE = FRAME_SIZE * DETAIL_SCALE;

export function renderRock(ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number): void {
  if (desertDetailsImg) {
    const scale = (radius * 2) / FRAME_SIZE;
    const size = FRAME_SIZE * scale;
    ctx.drawImage(
      desertDetailsImg,
      3 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
      sx - size / 2, sy - size / 2, size, size,
    );
  } else {
    ctx.fillStyle = '#8b7355';
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderCactus(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  if (desertDetailsImg) {
    ctx.drawImage(
      desertDetailsImg,
      2 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
      sx - DETAIL_TILE / 2, sy - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
    );
  } else {
    ctx.fillStyle = '#2d5a1e';
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderBarrel(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  if (miscPropsImg) {
    // Tile 2 = traffic cone (tile 0 was hazard chevron, wrong sprite)
    ctx.drawImage(
      miscPropsImg,
      2 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
      sx - DETAIL_TILE / 2, sy - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
    );
  } else {
    ctx.fillStyle = '#a05020';
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#604020';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function renderSandPatch(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  if (desertDetailsImg) {
    ctx.drawImage(
      desertDetailsImg,
      1 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
      sx - DETAIL_TILE / 2, sy - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
    );
  }
}
