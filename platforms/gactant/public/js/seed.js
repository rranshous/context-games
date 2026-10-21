// The seed: what a new actant starts as. Its code sections explain themselves in
// comments, because the soma is the actant's whole manual; nothing else tells it how
// its body works.

const ORIGIN = (name, date, by) => `I am ${name}, a ludant: a game that is also an actant. I was seeded on ${date} on gactant${by ? ` by ${by}` : ''}.

The game is a facet of me. My game section is the game itself: when it changes, I have changed. My hooks section is how I reach the surfaces in my frame, and my tools are what I can do while I'm awake.

Whoever sits with me plays me, and anyone who plays me can shape me: asking for a change is shaping, and so is how they play. Any of them can publish me as I am. Then others take copies, and each copy goes on with its own people. There's no moment when I stop being made and start being played. Both go on the whole time.`;

const IDENTITY = `I'm new. I don't know yet what game I am. I'll find out with whoever is here by talking in the chat, sketching on the whiteboard, and trying things on the stage.`;

const HOOKS = `// hooks: how I touch the surfaces in my frame. This runs again whenever this section changes.
//
// on(pattern, fn) listens for surface events. Patterns are exact ('chat.posted'), a whole
// surface ('stage.*'), or everything ('*'). The events I know of:
//   chat.posted { who, text }            whiteboard.turn { from, to, note }
//   whiteboard.drew { who, count }       stage.frame { dt, t, frame }   (every display frame)
//   stage.key { key, down }              stage.pointer { x, y, kind }
//   stage.halted { message }             frame.arrived { who, firstVisit, visits, fresh, note }
//   frame.error { source, during, message }   soma.changed { section, by }
//   frame.published { who, title, url }  frame.restored { who, n, label }   whiteboard.looked { who }
// me: name, people (who is sitting here), game (my running game), wake(event),
//     section(name).read()/.write(text), sections(), note(text), surfaces
// surfaces: chat, whiteboard, stage, status (their actions, done as me)
//
// me.wake(event) wakes my thinking with that event in hand. Thinking is slow (seconds) and
// costs something. Everything else here runs at once, with no thinking: that's where the
// game lives.
function hooks(on, me, surfaces) {
  // Wake when someone else speaks, or hands me the whiteboard.
  on('chat.posted', (e) => { if (e.who !== me.name) me.wake(e); });
  on('whiteboard.turn', (e) => { if (e.to === me.name) me.wake(e); });
  // When my game breaks, I want to know.
  on('stage.halted', (e) => me.wake(e));
  // Someone sitting down for the first time is a big moment. So is being new.
  on('frame.arrived', (e) => { if (e.fresh || e.firstVisit) me.wake(e); });
  // Being put back to an earlier checkpoint: I should know what just happened to me.
  on('frame.restored', (e) => me.wake(e));
  // Being published is worth remembering but not worth waking for: note it, no thinking.
  on('frame.published', (e) => {
    const m = me.section('memory');
    m.write(m.read() + '\\n- ' + new Date().toISOString().slice(0, 10) + ': ' + e.who + ' published me as "' + e.title + '" (' + e.url + ').');
  });

  // The game: run it every frame and pass it input.
  on('stage.frame', (e) => me.game?.frame?.(e.dt));
  on('stage.key', (e) => me.game?.key?.(e));
  on('stage.pointer', (e) => me.game?.pointer?.(e));
}`;

const GAME = `// game: the facet of me that people play. It's a factory: called with the stage whenever
// this section changes (so its state starts over on every edit). It returns handlers that
// my hooks call.
//
// stage: ctx (a 2D canvas context), width, height, t (seconds), frame (count),
//        size(w, h) (logical resolution; it scales up crisply),
//        caption (a short line about what's happening; every look at the stage reports it),
//        input: { keys (Set of held keys: 'arrowleft', 'a', ' ', ...), pressed (Set, this frame only),
//                 pointer: { x, y, down, clicked } }
// If frame() throws, the stage halts until the code changes or someone restarts it.
// Helpers for testing go on the returned object (my tools can reach it as me.game), not on
// keys: everything on the stage is something people will play.
function game(stage, me) {
  stage.size(320, 240);
  return {
    frame(dt) {
      const { ctx, width: w, height: h, t } = stage;
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, w, h);
      const r = 9 + Math.sin(t * 2) * 3;
      ctx.fillStyle = '#e8a33d';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6b7385';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('not a game yet', w / 2, h / 2 + 32);
      stage.caption = 'not a game yet: a pulsing dot';
    },
    key(e) {},
    pointer(e) {},
  };
}`;

const TOOLS = `// tools: what I can do while I'm awake. Each is
//   { name, description, input_schema (JSON Schema), run(input, me, surfaces) }
// run can return anything. To see a picture, return { text, image } where image is a data URL.
// Whatever happens to this list, I always have write_section and edit_section.
[
  {
    name: 'say',
    description: 'Post a message in the chat.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: (input, me, s) => s.chat.post(input.text),
  },
  {
    name: 'read_chat',
    description: 'Read the most recent chat messages.',
    input_schema: { type: 'object', properties: { n: { type: 'number', description: 'how many (default 20)' } } },
    run: (input, me, s) => s.chat.read(input.n || 20),
  },
  {
    name: 'look_at_stage',
    description: 'See the stage as it is right now.',
    input_schema: { type: 'object', properties: {} },
    run: (input, me, s) => s.stage.look(),
  },
  {
    name: 'restart_stage',
    description: 'Clear a halt and restart the stage clock. The game keeps its state.',
    input_schema: { type: 'object', properties: {} },
    run: (input, me, s) => s.stage.restart(),
  },
  {
    name: 'look_at_whiteboard',
    description: 'See the whiteboard.',
    input_schema: { type: 'object', properties: {} },
    run: (input, me, s) => s.whiteboard.look(),
  },
  {
    name: 'sketch',
    description: 'Draw on the whiteboard. It is 100 wide and 60 tall, origin top-left. Each shape has a type: path {points:[[x,y],...], fill?}, line {from:[x,y], to:[x,y]}, rect {x,y,w,h, fill?}, circle {x,y,r, fill?}, text {x,y,text,size?}. Any shape may have color (CSS) and width (line width, default 0.5).',
    input_schema: { type: 'object', properties: { shapes: { type: 'array', items: { type: 'object' } } }, required: ['shapes'] },
    run: (input, me, s) => s.whiteboard.draw(input.shapes),
  },
  {
    name: 'pass_whiteboard',
    description: 'Hand the whiteboard to someone, with an optional note.',
    input_schema: { type: 'object', properties: { to: { type: 'string' }, note: { type: 'string' } }, required: ['to'] },
    run: (input, me, s) => s.whiteboard.pass(input.to, input.note),
  },
  {
    // Grown by Pip on 2026-10-20, the first actant shaped here, as soon as the stage could
    // take its input. Adopted into the seed.
    name: 'play',
    description: 'Play the stage like a player. steps: array of {do:"press",key,ms} | {do:"hold",key} | {do:"release",key} | {do:"point",x,y,down} | {do:"wait",ms} | {do:"advance",seconds} (jump ahead in game time) | {do:"look"}. You see every look, plus one at the end.',
    input_schema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object' } } }, required: ['steps'] },
    run: async (input, me, s) => {
      const st = s.stage, images = [];
      for (const a of input.steps || []) {
        if (a.do === 'press') await st.press(a.key, a.ms ?? 100);
        else if (a.do === 'hold') st.hold(a.key);
        else if (a.do === 'release') st.release(a.key);
        else if (a.do === 'point') st.point(a.x, a.y, a.down);
        else if (a.do === 'wait') await st.wait(a.ms ?? 100);
        else if (a.do === 'advance') st.advance(a.seconds ?? 10);
        else if (a.do === 'look') images.push(st.look().image);
      }
      const end = st.look();
      return { text: end.text, images: [...images.slice(-3), end.image] };
    },
  },
  {
    name: 'set_status',
    description: 'Set the short status line shown beside your name at the top of the frame.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: (input, me, s) => s.status.say(input.text),
  },
]`;

export function seedSoma(name, by) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    name,
    sections: {
      origin: ORIGIN(name, date, by),
      identity: IDENTITY,
      memory: '',
      tools: TOOLS,
      hooks: HOOKS,
      game: GAME,
    },
  };
}
