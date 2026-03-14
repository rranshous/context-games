// ── Input ──
// Keyboard input for player car.

const held = new Set<string>();
const justPressed = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }
  if (!held.has(e.key)) {
    justPressed.add(e.key);
  }
  held.add(e.key);
});

window.addEventListener('keyup', (e) => {
  held.delete(e.key);
});

export function isHeld(key: string): boolean {
  return held.has(key);
}

export function wasPressed(key: string): boolean {
  return justPressed.has(key);
}

export function clearFrame(): void {
  justPressed.clear();
}

// Convenience for car controls
export function getPlayerControls(): { steer: number; accel: number; brake: number } {
  let steer = 0;
  let accel = 0;
  let brake = 0;

  if (isHeld('ArrowLeft') || isHeld('a')) steer -= 1;
  if (isHeld('ArrowRight') || isHeld('d')) steer += 1;
  if (isHeld('ArrowUp') || isHeld('w')) accel = 1;
  if (isHeld('ArrowDown') || isHeld('s')) brake = 1;
  if (isHeld(' ')) brake = 1;

  return { steer, accel, brake };
}
