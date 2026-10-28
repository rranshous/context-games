// The scripted rival: no AI, just orders. It builds down its list, holds the deposits on its
// half of the map, defends its base, sets ambushes if the map says so, and sends a wave at
// the commander's base whenever its army at home is big enough, a bigger one each time.
//
// It reads the map's true positions near its own base (it knows its own ground); beyond
// that it only goes where it's sent.

const THINK_EVERY = 1;
const HOME = 450;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Rival {
  constructor(sim, side, plan, keys) {
    this.sim = sim; this.side = side; this.plan = { ...plan };
    this.keys = keys;            // roster index → rival unit key
    this.next = 0;
    this.clock = 0;
    this.nextWave = plan.firstWave;
    this.wave = plan.wave;
    this.jobs = new Map();       // unit id → 'hold:<deposit>' | 'ambush' | 'wave'
    for (const key of plan.start) this.sim.spawn(side, sim.sides[side].roster[keys.indexOf(key)]);
  }

  tick(dt) {
    if ((this.clock += dt) < THINK_EVERY) return;
    this.clock = 0;
    const sim = this.sim, me = this.side, hq = sim.hqs[me], foe = sim.hqs[1 - me];
    const mine = sim.units(me);
    for (const id of this.jobs.keys()) if (!mine.some((u) => u.id === id)) this.jobs.delete(id);

    // Build down the list; wait for what's next rather than skipping it.
    const key = this.plan.build[this.next % this.plan.build.length];
    if (sim.produce(me, this.keys.indexOf(key))) this.next++;

    const free = () => mine.filter((u) => !this.jobs.has(u.id));

    // Hold the deposits on its own half.
    const ours = [...sim.deposits].sort((a, b) => dist(a, hq) - dist(b, hq)).slice(0, Math.ceil(sim.deposits.length / 2));
    for (const d of ours) {
      const job = `hold:${d.id}`;
      if ([...this.jobs.values()].includes(job)) continue;
      const u = free().sort((a, b) => dist(a, d) - dist(b, d))[0];
      if (!u) break;
      this.jobs.set(u.id, job);
      sim.command(me, [u.id], { kind: 'fight', x: d.x + 20, y: d.y + 20 });
    }

    // Ambushes: whatever can burrow or cloak waits along the road to the commander's base.
    if (this.plan.ambush) {
      for (const u of free().filter((x) => x.has.has('burrow') || x.has.has('cloak'))) {
        const k = 0.35 + Math.random() * 0.25, side = (Math.random() - 0.5) * 300;
        const x = hq.x + (foe.x - hq.x) * k, y = hq.y + (foe.y - hq.y) * k;
        this.jobs.set(u.id, 'ambush');
        sim.command(me, [u.id], { kind: 'fight', x: x + side * 0.6, y: y + side * 0.8 });
      }
    }

    // Defend: anything of the commander's near its base draws everyone at home onto it.
    const intruder = sim.units(1 - me).find((u) => dist(u, hq) < HOME);
    const home = free().filter((u) => dist(u, hq) < HOME + 200);
    if (intruder) { sim.command(me, home.map((u) => u.id), { kind: 'fight', x: intruder.x, y: intruder.y }); return; }

    // A wave, when it's time and there are enough at home.
    const strength = home.reduce((n, u) => n + (u.young ? 0 : u.design.priced.supply), 0);
    if (sim.t >= this.nextWave && strength >= this.wave) {
      for (const u of home) this.jobs.set(u.id, 'wave');
      this.launched = { t: sim.t, x: hq.x, y: hq.y };   // for the commander's scouts to hear of
      sim.command(me, home.map((u) => u.id), { kind: 'fight', x: foe.x, y: foe.y });
      this.nextWave = sim.t + this.plan.every;
      this.wave += this.plan.grow;
    }
    // Waves that are done (nothing left to fight where they were sent) go on to the base.
    for (const u of mine) if (this.jobs.get(u.id) === 'wave' && u.order.kind === 'idle') sim.command(me, [u.id], { kind: 'fight', x: foe.x, y: foe.y });
  }
}
