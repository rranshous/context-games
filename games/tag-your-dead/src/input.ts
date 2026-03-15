// ── Input ──
// Keyboard + gamepad input for player car.

const held = new Set<string>();
const justPressed = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Escape'].includes(e.key)) {
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
  _gamepadButtonJustPressed = false;
}

// ── Gamepad ──

const DEADZONE = 0.15;
let _gamepadButtonJustPressed = false;
let _prevButtons: boolean[] = [];

function getActiveGamepad(): Gamepad | null {
  const gamepads = navigator.getGamepads();
  for (const gp of gamepads) {
    if (gp && gp.connected) return gp;
  }
  return null;
}

/** Poll gamepad state — call once per frame before reading controls */
export function pollGamepad(): void {
  const gp = getActiveGamepad();
  if (!gp) {
    _prevButtons = [];
    return;
  }

  // Detect rising-edge button presses (A=0, B=1, Start=9)
  const curr = gp.buttons.map(b => b.pressed);
  if (_prevButtons.length > 0) {
    // A button or Start → treated like Space/Enter
    for (const idx of [0, 9]) {
      if (curr[idx] && !_prevButtons[idx]) {
        _gamepadButtonJustPressed = true;
      }
    }
  }
  _prevButtons = curr;
}

/** True if gamepad A or Start was just pressed this frame */
export function gamepadWasPressed(): boolean {
  return _gamepadButtonJustPressed;
}

// Convenience for car controls (keyboard + gamepad merged)
export function getPlayerControls(): { steer: number; accel: number; brake: number } {
  let steer = 0;
  let accel = 0;
  let brake = 0;

  // Keyboard
  if (isHeld('ArrowLeft') || isHeld('a')) steer -= 1;
  if (isHeld('ArrowRight') || isHeld('d')) steer += 1;
  if (isHeld('ArrowUp') || isHeld('w')) accel = 1;
  if (isHeld('ArrowDown') || isHeld('s')) brake = 1;
  if (isHeld(' ')) brake = 1;

  // Gamepad (additive — whichever has stronger input wins)
  const gp = getActiveGamepad();
  if (gp) {
    // Left stick X → steer (analog)
    const lx = gp.axes[0] ?? 0;
    if (Math.abs(lx) > DEADZONE) {
      const gpSteer = Math.sign(lx) * ((Math.abs(lx) - DEADZONE) / (1 - DEADZONE));
      if (Math.abs(gpSteer) > Math.abs(steer)) steer = gpSteer;
    }

    // Right trigger (axis 5 or button 7) → accelerate
    // Left trigger (axis 4 or button 6) → brake
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    if (rt > accel) accel = rt;
    if (lt > brake) brake = lt;

    // D-pad: up=12, down=13, left=14, right=15
    if (gp.buttons[12]?.pressed && accel < 1) accel = 1;
    if (gp.buttons[13]?.pressed && brake < 1) brake = 1;
    if (gp.buttons[14]?.pressed && steer > -1) steer = -1;
    if (gp.buttons[15]?.pressed && steer > -1) steer = 1;
  }

  return { steer, accel, brake };
}
