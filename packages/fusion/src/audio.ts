// Sound for Fusion Engine games. Effects, unit replies and EVA speech come from the freeware
// Tiberian Dawn (Dune style) and Red Alert (RA2 style) banks built by tools/prepare-audio.py;
// sounds the classics never had (Prism, Tesla Trooper, sonic, chrono, psychic, sandworms,
// thunder...) are synthesised here. Audio is presentation only: it reads Game.effects and
// never touches the simulation, so it is safe in lockstep.
import type { Effect, Entity, Game } from './game';

// ------------------------------------------------------------------ Westwood AUD decoding

const IMA_STEP = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143,
  157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552,
  1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];
const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];

/** Decode a Westwood AUD file (IMA ADPCM, codec 99) to mono samples in -1..1. */
export function decodeAud(data: Uint8Array): { rate: number; samples: Float32Array } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const rate = view.getUint16(0, true), size = view.getUint32(2, true), outSize = view.getUint32(6, true), codec = data[11];
  if (codec !== 99) throw new Error(`Unsupported AUD codec ${codec}`);
  const samples = new Float32Array(outSize >> 1);
  let pos = 12, out = 0, index = 0, current = 0;
  const end = Math.min(data.length, 12 + size);
  while (pos + 8 <= end && out < samples.length) {
    const chunk = view.getUint16(pos, true);
    pos += 8; // compressed size, output size, 0x0000DEAF marker
    const stop = Math.min(end, pos + chunk);
    for (; pos < stop; pos++) {
      const byte = data[pos];
      for (const nibble of [byte & 15, byte >> 4]) {
        const step = IMA_STEP[index];
        let diff = step >> 3;
        if (nibble & 1) diff += step >> 2;
        if (nibble & 2) diff += step >> 1;
        if (nibble & 4) diff += step;
        current = nibble & 8 ? Math.max(-32768, current - diff) : Math.min(32767, current + diff);
        index = Math.max(0, Math.min(88, index + IMA_INDEX[nibble & 7]));
        if (out < samples.length) samples[out++] = current / 32768;
      }
    }
  }
  return { rate, samples };
}

/** Parse a bank file: u32 index length, JSON index, then AUD files back to back. */
export function parseBank(buffer: ArrayBuffer): { notice: string; sounds: Map<string, Uint8Array> } {
  const bytes = new Uint8Array(buffer);
  const length = new DataView(buffer).getUint32(0, true);
  const index = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as { notice: string; sounds: Record<string, [number, number]> };
  const sounds = new Map<string, Uint8Array>();
  for (const [name, [offset, size]] of Object.entries(index.sounds)) sounds.set(name, bytes.subarray(4 + length + offset, 4 + length + offset + size));
  return { notice: index.notice, sounds };
}

// ------------------------------------------------------------------ sound tables

type Bank = 'td' | 'ra';
/** A bank sound, several to pick from at random, or a synthesised sound ('~zap'). */
type Cue = string | string[];

interface Table {
  explosion: [Cue, Cue, Cue]; // small, medium, huge
  vehicleDeath: Cue; buildingDeath: Cue; crumble: Cue; infantryDeath: Cue; crush: Cue;
  nuke: Cue; launch: Cue; ionCharge: Cue; ionStrike: Cue; chrono: Cue; curtain: Cue; chute: Cue;
  deploy: Cue; place: Cue; sell: Cue; denied: Cue; repair: Cue; sandbag: Cue; c4: Cue;
  eva: Record<string, string>;
  replies: { select: string[]; order: string[]; vehicleSelect: string[] };
  special: Record<string, { select: string[]; order: string[] }>;
}

const TABLES: Record<Bank, Table> = {
  td: {
    explosion: ['XPLOS', 'XPLOSML2', ['XPLOBIG4', 'XPLOBIG6']], vehicleDeath: 'XPLOSML2', buildingDeath: ['XPLOBIG4', 'XPLOBIG6'], crumble: 'CRUMBLE',
    infantryDeath: ['NUYELL1', 'NUYELL3', 'NUYELL4', 'NUYELL5', 'YELL1'], crush: 'SQUISH2',
    nuke: 'NUKEXPLO', launch: 'NUKEMISL', ionCharge: 'OBELPOWR', ionStrike: 'ION1', chrono: '~chrono', curtain: '~curtain', chute: '~whoosh',
    deploy: 'HVYDOOR1', place: 'HVYDOOR1', sell: 'POWRDN1', denied: 'SCOLD2', repair: '~chime', sandbag: '~thud', c4: 'BLEEP2',
    eva: {
      construction: 'CONSTRU1', unitReady: 'UNITREDY', lowPower: 'LOPOWER1', baseAttack: 'BASEATK1', building: 'BLDGING1', training: 'BLDGING1',
      cancelled: 'CANCEL1', inProgress: 'BLDG1', cannotDeploy: 'DEPLOY1', newOptions: 'NEWOPT1', selectTarget: 'SELECT1', reinforcements: 'REINFOR1',
      unitLost: 'UNITLOST', structureLost: 'STRCLOST', enemyStructure: 'ESTRUCX', enemyUnit: 'ENMYUNIT', silos: 'SILOS1', onHold: 'ONHOLD1',
      won: 'ACCOM1', lost: 'FAIL1', captured: 'GDICAPT1', lostPower: 'NOPOWER1',
      'ready:missile': 'NUKAVAIL', 'ready:ion': 'IONREDY1', 'ready:reinforce': 'AIRREDY1', 'ready:paradrop': 'AIRREDY1', 'charging:ion': 'IONCHRG1',
      'launch:missile': 'NUKLNCH1', 'incoming:missile': 'NUKE1',
    },
    replies: { select: ['REPORT1', 'AWAIT1', 'READY', 'UNIT1', 'YESSIR1'], order: ['ACKNO', 'AFFIRM1', 'MOVOUT1', 'ROGER', 'UGOTIT', 'RITAWAY', 'NOPROB'], vehicleSelect: ['VEHIC1', 'REPORT1', 'AWAIT1', 'READY'] },
    special: {},
  },
  ra: {
    explosion: ['KABOOM30', 'KABOOM22', ['KABOOM15', 'KABOOM12']], vehicleDeath: ['KABOOM25', 'KABOOM22'], buildingDeath: ['KABOOM12', 'KABOOM15'], crumble: 'CRMBLE2',
    infantryDeath: ['DEDMAN1', 'DEDMAN2', 'DEDMAN3', 'DEDMAN4', 'DEDMAN5', 'DEDMAN6', 'DEDMAN7', 'DEDMAN8', 'DEDMAN10'], crush: 'SQUISHY2',
    nuke: ['KABOOM12', '~rumble'], launch: 'MISSILE6', ionCharge: 'TSLACHG2', ionStrike: '~ion', chrono: 'CHRONO2', curtain: 'IRONCUR9', chute: 'CHUTE1',
    deploy: 'HYDROD1', place: 'PLACBLDG', sell: 'CASHTURN', denied: 'SCOLDY1', repair: 'HEAL2', sandbag: 'SANDBAG2', c4: 'RABEEP1',
    eva: {
      construction: 'CONSCMP1', unitReady: 'UNITRDY1', lowPower: 'LOPOWER1', baseAttack: 'BASEATK1', building: 'ABLDGIN1', training: 'TRAIN1',
      cancelled: 'CANCLD1', inProgress: 'PROGRES1', cannotDeploy: 'NODEPLY1', newOptions: 'NEWOPT1', selectTarget: 'SLCTTGT1', reinforcements: 'REINFOR1',
      unitLost: 'UNITLST1', structureLost: 'STRCKIL1', silos: 'SILOND1', onHold: 'ONHOLD1', funds: 'NOFUNDS1', lostPower: 'NOPOWR1',
      won: 'MISNWON1', lost: 'MISNLST1', infiltrated: 'BLDGINF1', stolen: 'CREDIT1', charge: 'XPLOPLC1', sold: 'STRUSLD1', repairing: 'REPAIR1',
      satellite: 'SATLNCH1', aircraftLost: 'AUNITL1', shipLost: 'NAVYLST1', unitRepaired: 'UNITREP1',
      'ready:missile': 'AREADY1', 'ready:chrono': 'CHRORDY1', 'ready:curtain': 'IRONRDY1', 'charging:chrono': 'CHROCHR1', 'charging:curtain': 'IRONCHG1',
      'launch:missile': 'ALAUNCH1', 'incoming:missile': 'ATLNCH1', 'ready:paradrop': 'AARRIVE1',
    },
    replies: { select: ['REPORT1', 'AWAIT1', 'READY', 'YESSIR1'], order: ['ACKNO', 'AFFIRM1', 'ROGER', 'UGOTIT', 'RITAWAY', 'NOPROB'], vehicleSelect: ['VEHIC1', 'REPORT1', 'AWAIT1', 'READY'] },
    special: {
      tanya: { select: ['YO1', 'YES1', 'YEAH1'], order: ['ONIT1', 'ROKROLL1', 'CMON1', 'BOMBIT1', 'TUFFGUY1'] },
      seal: { select: ['YO1', 'YES1'], order: ['ONIT1', 'ROKROLL1'] },
      engineer: { select: ['EENGIN1', 'EYESSIR1'], order: ['EAFFIRM1', 'EMOVOUT1', 'EYESSIR1'] },
      spy: { select: ['SCOMND1', 'SYESSIR1'], order: ['SINDEED1', 'SONWAY1', 'SKING1'] },
      dog: { select: ['DOGW3PX'], order: ['DOGY1'] },
    },
  },
};

/** Which bank sound (or synth) fires a weapon, from its look and punch. */
function weaponCue(bank: Bank, game: Game, weaponId: string, shooter?: Entity): Cue {
  const w = game.pack.weapons[weaponId];
  if (!w) return '';
  const td = bank === 'td';
  const fromBuilding = shooter?.kind === 'structure';
  switch (w.visual) {
    case 'bullet':
      if (w.warhead === 'jaws') return td ? '' : ['DOGG5P', 'DOGY1'];
      if (w.warhead === 'hero' || w.warhead === 'sniper') return td ? 'RAMGUN2' : 'GUN27';
      if (w.warhead === 'flak' || w.splash) return td ? 'GUN20' : 'GUN11';
      if (fromBuilding) return td ? 'GUN8' : 'PILLBOX1';
      return w.damage >= 15 ? (td ? 'GUN18' : 'GUN13') : td ? ['MGUN2', 'MGUN11'] : 'MGUNINF1';
    case 'cannon':
      if (w.damage >= 80) return td ? 'TNKFIRE6' : 'TANK5';
      if (w.damage >= 55) return td ? 'TNKFIRE4' : fromBuilding ? 'TURRET1' : 'CANNON1';
      return td ? ['TNKFIRE2', 'TNKFIRE3'] : 'CANNON2';
    case 'missile': return td ? (w.burst ? ['ROCKET1', 'ROCKET2'] : 'BAZOOK1') : w.damage >= 100 ? 'MISSILE6' : ['MISSILE7', 'MISSILE1'];
    case 'artillery': return td ? 'TNKFIRE6' : w.range > 4000 ? 'MISSILE6' : 'TANK5';
    case 'tesla': return td ? '~zap' : 'TESLA1';
    case 'prism': return '~prism';
    case 'laser': return td ? 'OBELRAY1' : '~laser';
    case 'sonic': return td ? '~sonic' : 'SONPULSE';
    case 'flame': return td ? 'FLAMER2' : 'FIREBL3';
    case 'torpedo': return td ? '~whoosh' : 'TORPEDO1';
    case 'chrono': return '~chrono';
    case 'psychic': return '~psychic';
    case 'rad': return '~rad';
    case 'bomb': return '';
  }
  return '';
}

// ------------------------------------------------------------------ settings

export interface AudioSettings { master: number; effects: number; voices: number; muted: boolean }
const SETTINGS_KEY = 'comrade.audio';
export function loadAudioSettings(): AudioSettings {
  const fallback = { master: 0.8, effects: 0.8, voices: 0.9, muted: false };
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return fallback; }
}
export function saveAudioSettings(s: AudioSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode: settings last this visit */ }
}

// ------------------------------------------------------------------ player

/** Where on screen an effect happened, so it can be panned and faded. */
export interface Listener { toScreen(lx: number, ly: number): { x: number; y: number }; width: number; height: number }

export class FusionAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private sfx: GainNode;
  private voice: GainNode;
  private sounds = new Map<string, Uint8Array>();
  private buffers = new Map<string, AudioBuffer>();
  private seen = new WeakSet<Effect>();
  private lastPlayed = new Map<string, number>();
  private playing = new Map<string, number>();
  private active = 0;
  private evaQueue: string[] = [];
  private evaBusy = false;
  private lastReply = 0;
  private noise: AudioBuffer;
  readonly bank: Bank;
  notice = '';

  constructor(private game: Game, private viewer: number, private settings: AudioSettings) {
    this.bank = game.pack.projection === 'iso' ? 'ra' : 'td';
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.voice = this.ctx.createGain(); this.voice.connect(this.master);
    this.apply(settings);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Effects already in the log when the match view opens are history, not news.
    for (const fx of game.effects) this.seen.add(fx);
  }

  /** Fetch this game's bank; the battle runs silently until (or if) it arrives. */
  async load(base = '/content/audio') {
    try {
      const res = await fetch(`${base}/${this.bank}.bank`);
      if (!res.ok) return;
      const bank = parseBank(await res.arrayBuffer());
      this.sounds = bank.sounds; this.notice = bank.notice;
    } catch { /* no bank: synthesised sounds only */ }
  }

  apply(s: AudioSettings) {
    this.settings = s;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.02);
    this.sfx.gain.setTargetAtTime(s.effects, t, 0.02);
    this.voice.gain.setTargetAtTime(s.voices, t, 0.02);
  }

  /** Browsers start audio suspended until the player interacts with the page. */
  resume() { if (this.ctx.state === 'suspended') void this.ctx.resume(); }
  dispose() { void this.ctx.close(); }

  // -------------------------------------------------------------- game events

  /** Play sounds for new simulation effects. Call once per rendered frame. */
  update(listener: Listener) {
    if (this.ctx.state !== 'running') { for (const fx of this.game.effects) this.seen.add(fx); return; }
    const table = TABLES[this.bank];
    for (const fx of this.game.effects) {
      if (this.seen.has(fx)) continue;
      this.seen.add(fx);
      if (this.game.tick - fx.tick > 3) continue; // Stale (e.g. after catching up a background tab).
      const pos = this.position(listener, fx.x, fx.y);
      const big = ['nuke', 'ionStrike', 'stormClouds', 'chronoFlash', 'curtain', 'superLaunch'].includes(fx.kind);
      if (!pos && !big) continue;
      const at = pos ?? { pan: 0, gain: 1 };
      const pick = (cue: Cue) => this.cue(cue, at.pan, at.gain);
      switch (fx.kind) {
        case 'muzzle': case 'bullet': case 'cannon': case 'tesla': case 'prism': case 'laser': case 'sonic': case 'chrono': case 'psychic': case 'rad': case 'flame': case 'bomb':
          if (fx.item) pick(weaponCue(this.bank, this.game, fx.item, this.shooter(fx)));
          else if (fx.kind === 'chrono') pick('~chrono'); // Chrono Miner jump.
          break;
        case 'explosion': pick(table.explosion[fx.x2 >= 512 ? 2 : fx.x2 >= 128 ? 1 : 0]); break;
        case 'vehicleDeath': pick(table.vehicleDeath); break;
        case 'bigExplosion': pick(table.buildingDeath); pick(table.crumble); break;
        case 'death': pick(table.infantryDeath); break;
        case 'crush': pick(table.crush); break;
        case 'nuke': pick(table.nuke); break;
        case 'superLaunch': pick(table.launch); break;
        case 'ionCharge': pick(table.ionCharge); break;
        case 'ionStrike': pick(table.ionStrike); break;
        case 'stormClouds': pick('~rumble'); break;
        case 'lightning': pick('~thunder'); break;
        case 'chronoFlash': pick(table.chrono); break;
        case 'curtain': pick(table.curtain); break;
        case 'parachute': pick(table.chute); break;
        case 'paradrop': pick('~plane'); break;
        case 'reinforce': case 'wormDive': pick('~rumble'); break;
        case 'wormEat': pick('~worm'); break;
        case 'bloom': case 'lift': case 'drop': case 'delivery': pick('~whoosh'); break;
        case 'deploy': pick(table.deploy); break;
        case 'place': pick(table.place); break;
        case 'sell': pick(table.sell); break;
        case 'denied': pick(table.denied); break;
        case 'repairFx': pick(table.repair); break;
        case 'dig': pick(table.sandbag); break;
        case 'c4': pick(table.c4); if (fx.owner === this.viewer) this.eva('charge'); break;
        case 'convert': pick('~psychic'); break;
        case 'promote': case 'upgrade': pick('~chime'); break;
        case 'capture': pick('~chime'); break;
        case 'infiltrate': pick('~chime'); break; // The battle screen speaks the EVA line.
      }
    }
  }

  private shooter(fx: Effect): Entity | undefined {
    for (const e of this.game.entities.values()) if (e.x === fx.x && e.y === fx.y && e.owner === fx.owner) return e;
    return undefined;
  }

  /** Screen position to stereo pan and distance fade; null when well off screen. */
  private position(l: Listener, x: number, y: number) {
    const p = l.toScreen(x, y);
    const margin = 160;
    if (p.x < -margin || p.y < -margin || p.x > l.width + margin || p.y > l.height + margin) return null;
    const dx = (p.x - l.width / 2) / (l.width / 2), dy = (p.y - l.height / 2) / (l.height / 2);
    return { pan: Math.max(-1, Math.min(1, dx)) * 0.7, gain: Math.max(0.35, 1 - Math.hypot(dx, dy) * 0.3) };
  }

  // -------------------------------------------------------------- voices

  /** Queue an EVA line by meaning (see the tables); unknown meanings stay silent. */
  eva(meaning: string) {
    const name = TABLES[this.bank].eva[meaning];
    if (!name || !this.has(name) || this.evaQueue.includes(name) || this.evaQueue.length > 2) return;
    this.evaQueue.push(name);
    this.pumpEva();
  }

  private pumpEva() {
    if (this.evaBusy || !this.evaQueue.length || this.ctx.state !== 'running') return;
    const name = this.evaQueue.shift()!;
    const src = this.source(name);
    if (!src) { this.pumpEva(); return; }
    this.evaBusy = true;
    src.connect(this.voice);
    src.onended = () => { this.evaBusy = false; this.pumpEva(); };
    src.start();
  }

  /** A unit acknowledges selection or an order, in its own voice where the original had one. */
  reply(units: Entity[], kind: 'select' | 'order') {
    const now = performance.now();
    if (!units.length || now - this.lastReply < 700) return;
    this.lastReply = now;
    const table = TABLES[this.bank];
    const lead = units[0];
    const def = this.game.pack.units[lead.type];
    const special = table.special[lead.type];
    const pool = special ? special[kind] : kind === 'select' && def?.kind !== 'infantry' ? table.replies.vehicleSelect : table.replies[kind];
    // Each reply exists in up to four takes (.V00-.V03); pick any that this bank has.
    const takes = pool.flatMap(n => [n, `${n}.V00`, `${n}.V01`, `${n}.V02`, `${n}.V03`]).filter(n => this.has(n));
    if (!takes.length) return;
    const src = this.source(takes[Math.floor(Math.random() * takes.length)]);
    if (!src) return;
    src.connect(this.voice);
    src.start();
  }

  /** Short UI feedback (button clicks, refusals). */
  ui(kind: 'click' | 'denied') {
    const name = kind === 'click' ? (this.bank === 'ra' ? 'RAMENU1' : 'BUTTON') : TABLES[this.bank].denied as string;
    this.cue(name, 0, 0.7);
  }

  // -------------------------------------------------------------- playback

  private has(name: string) { return this.sounds.has(name); }

  private source(name: string): AudioBufferSourceNode | null {
    let buffer = this.buffers.get(name);
    if (!buffer) {
      const raw = this.sounds.get(name);
      if (!raw) return null;
      try {
        const { rate, samples } = decodeAud(raw);
        buffer = this.ctx.createBuffer(1, samples.length, rate);
        buffer.getChannelData(0).set(samples);
      } catch { return null; }
      this.buffers.set(name, buffer);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  /** Play a cue with pan and gain, keeping repeats and the total voice count in check. */
  private cue(cue: Cue, pan: number, gain: number) {
    const name = Array.isArray(cue) ? cue[Math.floor(Math.random() * cue.length)] : cue;
    if (!name || this.active >= 24) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.05 || (this.playing.get(name) ?? 0) >= 3) return;
    const out = this.ctx.createGain();
    out.gain.value = gain;
    const panner = this.ctx.createStereoPanner?.();
    if (panner) { panner.pan.value = pan; out.connect(panner); panner.connect(this.sfx); } else out.connect(this.sfx);
    const done = (length: number) => {
      this.lastPlayed.set(name, now);
      this.playing.set(name, (this.playing.get(name) ?? 0) + 1);
      this.active++;
      setTimeout(() => { this.playing.set(name, (this.playing.get(name) ?? 1) - 1); this.active--; out.disconnect(); }, length * 1000 + 100);
    };
    if (name.startsWith('~')) { done(this.synth(name.slice(1), out)); return; }
    const src = this.source(name);
    if (!src) { const fallback = SYNTH_FALLBACK[name]; if (fallback) done(this.synth(fallback, out)); return; }
    src.playbackRate.value = 0.96 + Math.random() * 0.08; // A little variety, as the originals had.
    src.connect(out);
    src.start();
    done(src.buffer!.duration);
  }

  // -------------------------------------------------------------- synthesis

  /** Original procedural sounds; returns the length in seconds. */
  private synth(kind: string, out: AudioNode): number {
    const ctx = this.ctx, t = ctx.currentTime;
    const env = (peak: number, attack: number, length: number) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + length);
      g.connect(out);
      return g;
    };
    const osc = (type: OscillatorType, from: number, to: number, length: number, into: AudioNode) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + length);
      o.connect(into); o.start(t); o.stop(t + length);
      return o;
    };
    const noise = (length: number, filter: BiquadFilterType, from: number, to: number, into: AudioNode, q = 1) => {
      const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = q;
      f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + length);
      n.connect(f); f.connect(into); n.start(t); n.stop(t + length);
    };
    switch (kind) {
      case 'zap': { const g = env(0.5, 0.005, 0.3); osc('sawtooth', 1400, 200, 0.3, g); noise(0.3, 'highpass', 3000, 1500, g); return 0.3; }
      case 'prism': { const g = env(0.35, 0.01, 0.45); osc('sine', 900, 2600, 0.45, g); osc('triangle', 1800, 5200, 0.45, g); return 0.45; }
      case 'laser': { const g = env(0.3, 0.005, 0.25); osc('square', 1100, 260, 0.25, g); return 0.25; }
      case 'sonic': { const g = env(0.6, 0.05, 0.8); osc('sine', 70, 45, 0.8, g); osc('sine', 140, 90, 0.8, g); return 0.8; }
      case 'chrono': { const g = env(0.35, 0.02, 0.5); osc('sine', 250, 1600, 0.5, g); noise(0.5, 'bandpass', 600, 3000, g, 4); return 0.5; }
      case 'psychic': { const g = env(0.3, 0.05, 0.7); osc('sine', 330, 300, 0.7, g); osc('sine', 336, 420, 0.7, g); return 0.7; }
      case 'rad': { const g = env(0.3, 0.01, 0.45); noise(0.45, 'bandpass', 2400, 1200, g, 6); return 0.45; }
      case 'ion': { const g = env(0.7, 0.02, 1.4); osc('sawtooth', 220, 60, 1.4, g); noise(1.4, 'lowpass', 4000, 200, g); return 1.4; }
      case 'thunder': { const g = env(0.9, 0.01, 1.6); noise(1.6, 'lowpass', 1800, 90, g); return 1.6; }
      case 'rumble': { const g = env(0.6, 0.3, 2.2); noise(2.2, 'lowpass', 220, 60, g); return 2.2; }
      case 'worm': { const g = env(0.8, 0.1, 1.4); noise(1.4, 'lowpass', 500, 80, g); osc('sawtooth', 55, 35, 1.4, g); return 1.4; }
      case 'whoosh': { const g = env(0.35, 0.08, 0.6); noise(0.6, 'bandpass', 400, 2400, g, 2); return 0.6; }
      case 'plane': { const g = env(0.3, 0.6, 2.5); osc('sawtooth', 95, 80, 2.5, g); noise(2.5, 'lowpass', 600, 300, g); return 2.5; }
      case 'chime': { const g = env(0.3, 0.01, 0.6); osc('sine', 880, 880, 0.3, g); const g2 = env(0.25, 0.15, 0.6); osc('sine', 1320, 1320, 0.6, g2); return 0.6; }
      case 'curtain': { const g = env(0.5, 0.2, 1.5); osc('sawtooth', 60, 120, 1.5, g); noise(1.5, 'bandpass', 300, 900, g, 3); return 1.5; }
      case 'thud': { const g = env(0.5, 0.005, 0.2); noise(0.2, 'lowpass', 400, 100, g); return 0.2; }
    }
    return 0;
  }
}

/** Synthesised stand-ins should a bank sound ever be missing. */
const SYNTH_FALLBACK: Record<string, string> = { TESLA1: 'zap', CHRONO2: 'chrono', IRONCUR9: 'curtain', ION1: 'ion', NUKEXPLO: 'rumble', CHUTE1: 'whoosh' };
