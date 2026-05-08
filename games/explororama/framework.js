// Explororama — a tiny framework for ASCII point-and-click adventures.
//
// A game is a flat .expr text file split into directives. The clickable
// hotspots in any scene are characters in the ASCII art: every instance
// of that character in the scene becomes a clickable region linking to
// another scene. Hotspot meaning is per-scene (D in one scene can be a
// door inward, in another a door outward).
//
// Directives:
//   @palette          color map, char = #rrggbb (one per line)
//   @start <scene>    which scene to open with
//   @scene <name>     begin a new scene (collects until next @scene)
//     @title <text>   one-line title shown above the art
//     @art            multi-line ASCII art
//     @hotspots       lines of "<char> -> <scene>"

class Explororama {
  constructor() {
    this.scenes = {};
    this.palette = {};
    this.startScene = null;
    this.currentScene = null;
    this.history = [];
    this.container = null;
  }

  parse(text) {
    const lines = text.split('\n');
    let scene = null;
    let section = null;
    let buffer = [];

    const flushSection = () => {
      if (!section || !buffer.length) { buffer = []; return; }

      if (section === 'art' && scene) {
        while (buffer.length && buffer[0].trim() === '') buffer.shift();
        while (buffer.length && buffer[buffer.length - 1].trim() === '') buffer.pop();
        scene.art = buffer.join('\n');
      } else if (section === 'hotspots' && scene) {
        for (const ln of buffer) {
          const m = ln.match(/^\s*(\S)\s*->\s*(\S+)/);
          if (m) scene.hotspots[m[1]] = m[2];
        }
      } else if (section === 'palette') {
        for (const ln of buffer) {
          const m = ln.match(/^\s*(\S)\s*=\s*(\S+)/);
          if (m) this.palette[m[1]] = m[2];
        }
      }
      buffer = [];
    };

    const commitScene = () => {
      if (scene) this.scenes[scene.name] = scene;
    };

    for (const line of lines) {
      const stripped = line.trimStart();
      if (stripped.startsWith('@')) {
        flushSection();
        const parts = stripped.slice(1).split(/\s+/);
        const cmd = parts[0];
        const arg = parts.slice(1).join(' ');

        if (cmd === 'scene') {
          commitScene();
          scene = { name: arg, title: '', art: '', hotspots: {} };
          section = null;
        } else if (cmd === 'title' && scene) {
          scene.title = arg;
        } else if (cmd === 'start') {
          this.startScene = arg;
        } else if (cmd === 'art' || cmd === 'hotspots' || cmd === 'palette') {
          section = cmd;
        }
      } else if (section) {
        buffer.push(line);
      }
    }

    flushSection();
    commitScene();
  }

  mount(container) {
    this.container = container;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (this.history.length > 0) {
          e.preventDefault();
          const prev = this.history.pop();
          this.render(prev);
        }
      }
    });
  }

  start() {
    const first = this.startScene || Object.keys(this.scenes)[0];
    this.render(first);
  }

  goTo(name) {
    if (!this.scenes[name]) {
      console.warn('Unknown scene:', name);
      return;
    }
    this.history.push(this.currentScene);
    this.render(name);
  }

  render(name) {
    const scene = this.scenes[name];
    if (!scene) return;
    this.currentScene = name;

    let html = '';
    if (scene.title) {
      html += `<div class="title">${escapeHtml(scene.title)}</div>`;
    }
    html += '<pre class="scene">';

    for (const ch of scene.art) {
      if (ch === '\n') { html += '\n'; continue; }
      const target = scene.hotspots[ch];
      const color = this.palette[ch];

      if (target) {
        const style = color ? ` style="color: ${color}"` : '';
        html += `<span class="hotspot" data-target="${escapeAttr(target)}" data-char="${escapeAttr(ch)}"${style}>${escapeHtml(ch)}</span>`;
      } else if (color) {
        html += `<span style="color: ${color}">${escapeHtml(ch)}</span>`;
      } else {
        html += escapeHtml(ch);
      }
    }
    html += '</pre>';

    this.container.innerHTML = html;
    this.attachHandlers();
  }

  attachHandlers() {
    const hotspots = this.container.querySelectorAll('.hotspot');
    hotspots.forEach(el => {
      el.addEventListener('click', () => this.goTo(el.dataset.target));
      el.addEventListener('mouseenter', () => {
        const ch = el.dataset.char;
        this.container.querySelectorAll(`.hotspot[data-char="${cssEscape(ch)}"]`).forEach(s => s.classList.add('active'));
      });
      el.addEventListener('mouseleave', () => {
        const ch = el.dataset.char;
        this.container.querySelectorAll(`.hotspot[data-char="${cssEscape(ch)}"]`).forEach(s => s.classList.remove('active'));
      });
    });
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return s.replace(/["\\]/g, '\\$&');
}

window.Explororama = Explororama;
