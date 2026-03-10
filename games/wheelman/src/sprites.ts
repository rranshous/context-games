// ── Sprite System ──
// Loads sprite sheets from raceon's mini-pixel-pack.
// Cars use frame 0 + canvas rotation (smooth, like raceon).
// Desert details are 16×16 tiles for terrain props.

const ASSET_BASE = 'assets/mini-pixel-pack-2';

// Sprite images — loaded once
let playerCarImg: HTMLImageElement | null = null;
let policeCarImg: HTMLImageElement | null = null;
let desertDetailsImg: HTMLImageElement | null = null;
let npcCarsImg: HTMLImageElement | null = null;
let desertRoadImg: HTMLImageElement | null = null;
let miscPropsImg: HTMLImageElement | null = null;
let waterTileImg: HTMLImageElement | null = null;
let loadPromise: Promise<void> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

export async function loadSprites(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      [playerCarImg, policeCarImg, desertDetailsImg, npcCarsImg, desertRoadImg, miscPropsImg, waterTileImg] = await Promise.all([
        loadImage(`${ASSET_BASE}/Cars/Player_red%20(16%20x%2016).png`),
        loadImage(`${ASSET_BASE}/Cars/Police%20(16%20x%2016).png`),
        loadImage(`${ASSET_BASE}/Levels/Desert_details%20(16%20x%2016).png`),
        loadImage(`${ASSET_BASE}/Cars/NPC_cars%20(16%20x%2016).png`),
        loadImage(`${ASSET_BASE}/Levels/Desert_road%20(64%20x%2064).png`),
        loadImage(`${ASSET_BASE}/Props/Misc_props%20(16%20x%2016).png`),
        loadImage(`${ASSET_BASE}/Levels/Highway_water_color%20(16%20x%2016).png`),
      ]);
      console.log('[SPRITES] All sprites loaded');
    } catch (err) {
      console.warn('[SPRITES] Failed to load sprites, falling back to shapes:', err);
    }
  })();
  return loadPromise;
}

export function spritesLoaded(): boolean {
  return playerCarImg !== null && policeCarImg !== null;
}

// ── Car Rendering — Canvas Rotation ──
// Uses frame 0 (up-facing) + ctx.rotate(), same as raceon.
// Sprite faces up, so offset by +π/2 to align with world coords (0 = east).

const FRAME_SIZE = 16;
const CAR_SCALE = 1.8; // slightly larger than raceon's 1.5, fits wheelman's camera distance

function renderCarRotated(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  screenX: number,
  screenY: number,
  angle: number,
  row: number = 0,
): void {
  if (!img) return;
  const scaledW = FRAME_SIZE * CAR_SCALE;
  const scaledH = FRAME_SIZE * CAR_SCALE;

  ctx.save();
  ctx.translate(screenX, screenY);
  // Sprite faces up; world angle 0 = east → rotate by angle + π/2
  ctx.rotate(angle + Math.PI / 2);
  ctx.drawImage(
    img,
    0, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE, // frame 0 only
    -scaledW / 2, -scaledH / 2, scaledW, scaledH,
  );
  ctx.restore();
}

export function renderPlayerCar(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  angle: number,
): void {
  renderCarRotated(ctx, playerCarImg, screenX, screenY, angle);
}

export function renderPoliceCar(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  angle: number,
): void {
  renderCarRotated(ctx, policeCarImg, screenX, screenY, angle);
}

// ── Desert Detail Sprites ──
// Desert_details sprite sheet: 16×16 tiles in a row
// Tile 0 = blank sand, 1 = textured sand (brown specs), 2 = cactus, 3 = rock, 4-7 = empty

const DETAIL_SCALE = 2.0;
const DETAIL_TILE = FRAME_SIZE * DETAIL_SCALE; // 32px on screen

export function renderTexturedSandTile(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
): void {
  if (!desertDetailsImg) return;
  // Tile 1 = textured sand (small brown specs on sand bg)
  ctx.drawImage(
    desertDetailsImg,
    1 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
    screenX - DETAIL_TILE / 2, screenY - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
  );
}

export function renderCactus(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  _variant: number = 0,
): void {
  if (!desertDetailsImg) return;
  // Tile 2 = cactus (the only cactus tile)
  ctx.drawImage(
    desertDetailsImg,
    2 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
    screenX - DETAIL_TILE / 2, screenY - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
  );
}

export function renderRock(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  _variant: number = 0,
): void {
  if (!desertDetailsImg) return;
  // Tile 3 = rock (the only rock tile)
  ctx.drawImage(
    desertDetailsImg,
    3 * FRAME_SIZE, 0, FRAME_SIZE, FRAME_SIZE,
    screenX - DETAIL_TILE / 2, screenY - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
  );
}

export function renderWaterTile(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
): void {
  if (!waterTileImg) return;
  // Water tile is a single 16×16 tile, render at 2× scale
  ctx.drawImage(
    waterTileImg,
    0, 0, FRAME_SIZE, FRAME_SIZE,
    screenX - DETAIL_TILE / 2, screenY - DETAIL_TILE / 2, DETAIL_TILE, DETAIL_TILE,
  );
}

// Get the raw images for external use
export function getPlayerCarImg(): HTMLImageElement | null { return playerCarImg; }
export function getPoliceCarImg(): HTMLImageElement | null { return policeCarImg; }
export function getDesertDetailsImg(): HTMLImageElement | null { return desertDetailsImg; }
export function getNpcCarsImg(): HTMLImageElement | null { return npcCarsImg; }
export function getDesertRoadImg(): HTMLImageElement | null { return desertRoadImg; }
