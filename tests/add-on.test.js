// Runs without LUNA: `npm test`. The lesson checks are pure functions of a world snapshot, so
// each one is tested against worlds that should and should not pass it. tests/live covers LUNA.
import { describe, expect, it } from 'vitest';
import { Luna } from '@uaudio/luna-builder-sdk';

globalThis.Luna = Luna;
await import('../logic.js');
await import('../lessons.js');
const L = globalThis.AddOnLogic;
const { COURSE, LESSONS } = globalThis;

const lesson = (id) => LESSONS.find((l) => l.id === id);
const task = (l, id) => lesson(l).tasks.find((t) => t.id === id);
const track = (o) => ({ name: 'Bass', type: 'instrument', gainDb: 0, pan: 0.5, muted: false, soloed: false, armed: false, input: null, instrument: null, effects: [], clips: 0, velocity: null, sendBus: null, sendDb: null, automation: 0, automationMode: 'off', ...o });
const world = (o = {}) => ({ session: 'Newb Lesson', lesson: true, page: 'timeline', playing: false, tick: 0, bar: 1, looping: false, loopBars: null, countIn: false, tempo: 120, click: false, tracks: [], buses: [], ...o });
// Run a task's check over a sequence of worlds, sharing its memory, as LUNA changes over time.
const over = (t, worlds) => { const mem = {}; return worlds.map((w) => !!t.check(w, mem)); };

describe('the course', () => {
  it('has four chapters, unique ids and a way to finish every task', () => {
    expect(COURSE.map((c) => c.chapter)).toEqual(['DAW basics', 'MIDI & instruments', 'Mixing & effects', 'Recording & export']);
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LESSONS) {
      expect(l.title, l.id).toBeTruthy();
      expect(l.body.length, l.id).toBeGreaterThan(100);
      const tids = l.tasks.map((t) => t.id);
      expect(new Set(tids).size, l.id).toBe(tids.length);
      for (const t of l.tasks) {
        expect(t.text, `${l.id}:${t.id}`).toBeTruthy();
        expect(t.manual || typeof t.check === 'function', `${l.id}:${t.id}`).toBe(true);
      }
    }
  });

  it('lessons only need things the page knows how to set up, in build order', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    const order = ['bass', 'groove', 'drums', 'voice'];
    for (const l of LESSONS) {
      for (const n of l.needs ?? []) expect(main, `${l.id} needs ${n}`).toMatch(new RegExp(`\\b${n}: \\{ label`));
      const idx = (l.needs ?? []).map((n) => order.indexOf(n));
      expect(idx, l.id).toEqual([...idx].sort((a, b) => a - b));
    }
    // Every lesson after "Instrument tracks" has the Bass and its groove to work with.
    const from = LESSONS.findIndex((l) => l.id === 'midi');
    for (const l of LESSONS.slice(from, -1)) expect(l.needs, l.id).toEqual(expect.arrayContaining(['bass', 'groove']));
  });

  it('only names LUNA shortcuts the SDK documents', () => {
    const text = LESSONS.map((l) => l.body + (l.deeper ?? '') + l.tasks.map((t) => t.text).join(' ')).join(' ');
    const combos = [...text.matchAll(/\b((?:Shift\+|Opt\+|Ctrl\+)*Cmd\+[A-Za-z]+|Space)\b/g)].map((m) => m[1]);
    for (const c of new Set(combos)) expect(['Cmd+Z', 'Shift+Cmd+Z', 'Cmd+Space', 'Space']).toContain(c);
  });

  it('every Show me names an action the page has', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    for (const l of LESSONS) for (const t of l.tasks) if (t.show) expect(main, `${l.id}:${t.id} -> ${t.show}`).toMatch(new RegExp(`\\b${t.show}\\b[(:]|async ${t.show}\\(`));
  });
});

describe('pointing at things in LUNA', () => {
  const allText = () => LESSONS.map((l) => l.body + (l.deeper ?? '') + l.tasks.map((t) => t.text).join(' ')).join(' ');

  it('every link names a pointer the page has', () => {
    const names = new Set([...allText().matchAll(/data-show="([\w-]+)"/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThan(10);
    for (const n of names) expect(L.POINTERS, n).toHaveProperty([n]);
  });

  it('Newb never uses a locate (seek), which drags the loop markers along', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['../main.js', '../logic.js']) {
      const code = readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      expect(code, f).not.toMatch(/transport\.seek\(/);
    }
  });

  it('pointers never switch pages or start playback (those are lesson tasks)', () => {
    for (const [name, fn] of Object.entries(L.POINTERS)) {
      const src = fn.toString();
      expect(src, name).not.toMatch(/page\.set|setPage|\.play\(|\.seek\(|\.record\(|recordEnabled/);
    }
  });

  it("a task's text never links the thing that would complete it", () => {
    // Pages are the only pointer-reachable task targets, and pointers do not change pages.
    for (const l of LESSONS) for (const t of l.tasks) expect(t.text, `${l.id}:${t.id}`).not.toMatch(/data-show="(timeline|mixer)"/);
  });
});

describe('lesson setup', () => {
  const H = globalThis.LessonHelpers;
  it('knows what a lesson still needs from the session', () => {
    const all = ['bass', 'groove', 'drums', 'voice'];
    expect(H.missing(all, world())).toEqual(all);
    const bass = track({ instrument: 'dls' });
    expect(H.missing(all, world({ tracks: [bass] }))).toEqual(['groove', 'drums', 'voice']);
    expect(H.missing(all, world({ tracks: [{ ...bass, clips: 1 }, track({ name: 'Drums', instrument: 'dls', clips: 1 })] }))).toEqual(['voice']);
    expect(H.missing(all, world({ tracks: [{ ...bass, clips: 1 }, track({ name: 'Drums', instrument: 'dls', clips: 1 }), track({ name: 'Voice', type: 'audio', input: 'in1' })] }))).toEqual([]);
  });
});

describe('basics checks', () => {
  it('needs a visit to the Mixer before the return to the Timeline counts', () => {
    expect(over(task('what-is-a-daw', 'timeline'), [world({ page: 'timeline' })])).toEqual([false]);
    const mixer = task('what-is-a-daw', 'mixer');
    const timeline = task('what-is-a-daw', 'timeline');
    const mem = {};
    mixer.check(world({ page: 'mixer' }), mem);
    expect(timeline.check(world({ page: 'timeline' }), mem)).toBe(true);
  });

  it('tempo, click, play then stop, bar 5, loop', () => {
    expect(task('time', 'tempo').check(world({ tempo: 82.2 }))).toBe(true);
    expect(task('time', 'tempo').check(world({ tempo: 120 }))).toBe(false);
    expect(task('time', 'click').check(world({ click: true }))).toBe(true);
    const play = task('transport', 'play');
    const stop = task('transport', 'stop');
    const mem = {};
    expect(stop.check(world({ playing: false }), mem)).toBe(false);   // stopped, but never played
    play.check(world({ playing: true }), mem);
    expect(stop.check(world({ playing: false }), mem)).toBe(true);
    expect(task('transport', 'bar5').check(world({ bar: 5 }))).toBe(true);
    expect(task('transport', 'loop').check(world({ looping: true, loopBars: [1, 5] }))).toBe(true);
    expect(task('transport', 'loop').check(world({ looping: false, loopBars: [1, 5] }))).toBe(false);
  });
});

describe('MIDI checks', () => {
  it('instrument track, instrument, chords, hearing them', () => {
    expect(task('instrument-track', 'track').check(world({ tracks: [track()] }))).toBe(true);
    expect(task('instrument-track', 'instrument').check(world({ tracks: [track({ instrument: 'x' })] }))).toBe(true);
    expect(task('midi', 'groove').check(world({ tracks: [track({ clips: 1 })] }))).toBe(true);
    expect(over(task('midi', 'hear'), [world({ playing: true }), world({ playing: true, tracks: [track({ clips: 1 })] })])).toEqual([false, true]);
  });

  it('swapping the instrument means a different one than first seen', () => {
    expect(over(task('midi', 'swap'), [world({ tracks: [track({ instrument: 'a' })] }), world({ tracks: [track({ instrument: 'a' })] }), world({ tracks: [track({ instrument: 'b' })] })])).toEqual([false, false, true]);
  });

  it('softer, then undo, then redo, in that order', () => {
    const l = lesson('velocity');
    const mem = {};
    const at = (v) => world({ tracks: [track({ clips: 1, velocity: v })] });
    expect(l.tasks.map((t) => !!t.check(at(96), mem))).toEqual([false, false, false]);
    expect(l.tasks.map((t) => !!t.check(at(58), mem))).toEqual([true, false, false]);
    expect(l.tasks.map((t) => !!t.check(at(96), mem))).toEqual([false, true, false]);
    expect(l.tasks.map((t) => !!t.check(at(58), mem))).toEqual([true, true, true]);
  });
});

describe('mixing checks', () => {
  const bass = track({ clips: 1, instrument: 'x' });
  const drums = track({ name: 'Drums', clips: 1, instrument: 'x' });
  it('drums added, drum fader near -6 dB', () => {
    expect(task('channel-strip', 'drums').check(world({ tracks: [bass] }))).toBe(false);
    expect(task('channel-strip', 'drums').check(world({ tracks: [bass, drums] }))).toBe(true);
    expect(task('channel-strip', 'fader').check(world({ tracks: [bass, { ...drums, gainDb: -6 }] }))).toBe(true);
    expect(task('channel-strip', 'fader').check(world({ tracks: [bass, { ...drums, gainDb: -20 }] }))).toBe(false);
  });

  it('pan counts once the drums go left and come back', () => {
    const at = (pan) => world({ tracks: [bass, { ...drums, pan }] });
    expect(over(task('channel-strip', 'pan'), [at(0.5), at(0.3), at(0.5)])).toEqual([false, false, true]);
    expect(over(task('channel-strip', 'pan'), [at(0.5), at(0.48), at(0.5)])).toEqual([false, false, false]); // barely moved
  });

  it('solo has to be undone to count', () => {
    expect(over(task('channel-strip', 'solo'), [world({ tracks: [{ ...bass, soloed: true }, drums] }), world({ tracks: [bass, drums] })])).toEqual([false, true]);
  });

  it('EQ on the bass, window, A/B, compressor on the drums', () => {
    const eq = { name: 'AUNBandEQ', in: true, open: false };
    expect(task('effects', 'eq').check(world({ tracks: [{ ...bass, effects: [eq] }] }))).toBe(true);
    expect(task('effects', 'open').check(world({ tracks: [{ ...bass, effects: [{ ...eq, open: true }] }] }))).toBe(true);
    expect(over(task('effects', 'ab'), [world({ tracks: [{ ...bass, effects: [eq] }] }), world({ tracks: [{ ...bass, effects: [{ ...eq, in: false }] }] }), world({ tracks: [{ ...bass, effects: [eq] }] })])).toEqual([false, false, true]);
    expect(task('effects', 'comp').check(world({ tracks: [bass, { ...drums, effects: [{ name: 'AUDynamicsProcessor', in: true }] }] }))).toBe(true);
  });

  it('reverb bus, the drums sent to it, send level and a listen', () => {
    const bus = { id: 'b1', name: 'Reverb', effects: ['AUMatrixReverb'] };
    expect(task('sends', 'bus').check(world({ buses: [bus] }))).toBe(true);
    expect(task('sends', 'send').check(world({ buses: [bus], tracks: [bass, { ...drums, sendBus: 'b1' }] }))).toBe(true);
    expect(over(task('sends', 'level'), [world({ buses: [bus], tracks: [bass, { ...drums, sendBus: 'b1', sendDb: -10 }] }), world({ playing: true, buses: [bus], tracks: [bass, { ...drums, sendBus: 'b1', sendDb: -10 }] })])).toEqual([false, true]);
  });
});

describe('recording and export checks', () => {
  const voice = track({ name: 'Voice', type: 'audio' });
  it('audio track, input, arm, count-in, a take, a listen with the track disarmed', () => {
    expect(task('record-setup', 'track').check(world({ tracks: [voice] }))).toBe(true);
    expect(task('record-setup', 'input').check(world({ tracks: [{ ...voice, input: 'in1' }] }))).toBe(true);
    expect(task('record-setup', 'arm').check(world({ tracks: [{ ...voice, armed: true }] }))).toBe(true);
    expect(task('record-setup', 'countin').check(world({ countIn: true }))).toBe(true);
    expect(task('record', 'take').check(world({ tracks: [{ ...voice, clips: 1 }] }))).toBe(true);
    expect(over(task('record', 'listen'), [world({ playing: true, tracks: [{ ...voice, clips: 1, armed: true }] }), world({ playing: true, tracks: [{ ...voice, clips: 1 }] })])).toEqual([false, true]);
  });

  it('automation needs points, then Read mode and a play', () => {
    const k = track({ clips: 1, automation: 2, automationMode: 'read' });
    expect(task('automation', 'fade').check(world({ tracks: [k] }))).toBe(true);
    expect(over(task('automation', 'read'), [world({ tracks: [k] }), world({ playing: true, tracks: [k] })])).toEqual([false, true]);
  });

  it('export and reveal come from what the page did', () => {
    expect(task('export', 'export').check(world({ exported: true }))).toBe(true);
    expect(task('export', 'finder').check(world({ revealed: false }))).toBe(false);
  });
});

describe('the groove', () => {
  const G = L.GROOVE;
  const part = (name) => G.tracks.find((t) => t.name === name);

  it('is a two-bar dancehall groove: snare on 2 and 4, kick on 1, swung hats, all on the drum channel', () => {
    const drums = part('drums').notes;
    for (const n of drums) expect(n.channel).toBe(9);
    expect(drums.filter((n) => n.pitch === 38).map((n) => n.at)).toEqual([1, 3, 5, 7]);
    const kicks = drums.filter((n) => n.pitch === 36).map((n) => n.at);
    expect(kicks).toContain(0);
    expect(kicks).toContain(4);
    const hats = drums.filter((n) => n.pitch === 42);
    expect(hats.filter((n) => n.at % 0.5 === 0)).toHaveLength(16);                        // straight 8ths
    const swung = hats.filter((n) => n.at % 0.5 !== 0).map((n) => +(n.at % 0.5).toFixed(2));
    expect(new Set(swung)).toEqual(new Set([0.29]));                                     // swung 16ths, a bit late
  });

  it('has a busy synth bass in E minor: 16ths, a whole-step dip, inside the two bars', () => {
    const bass = part('bass');
    expect(bass.program).toBe(38);
    const eMinor = new Set([4, 6, 7, 9, 11, 0, 2]);
    for (const n of bass.notes) {
      expect(eMinor.has(n.pitch % 12)).toBe(true);
      expect(n.at + n.dur).toBeLessThanOrEqual(G.bars * 4);
      expect(n.channel).toBe(0);
      expect((n.at * 4) % 1).toBe(0);                                                   // on the 16th grid
    }
    expect(bass.notes[1].pitch - bass.notes[0].pitch).toBe(2);                          // dip a whole step below
    expect(bass.notes.filter((n) => n.at < 4)).toHaveLength(14);
    expect(bass.notes).toHaveLength(27);
    expect(bass.notes.filter((n) => n.at === 3.5).map((n) => n.pitch)).toEqual([42]);   // G-F# turnaround in bar 1
    const avg = bass.notes.reduce((t, n) => t + n.vel, 0) / bass.notes.length;
    expect(avg).toBeGreaterThanOrEqual(90);
    expect(avg * 0.6).toBeLessThan(80);
  });

  it('loops over the four lesson bars', () => {
    const bass = L.loopNotes(G, L.BASS_PARTS);
    expect(bass).toHaveLength(part('bass').notes.length * 2);
    expect(bass.filter((n) => n.at % 8 === 0).map((n) => n.at)).toEqual([0, 8]);
    for (const n of [...bass, ...L.loopNotes(G, L.DRUM_PARTS)]) expect(n.at + n.dur).toBeLessThanOrEqual(L.LESSON_BARS * 4);
  });

  it('matches the tempo the lessons ask for', () => {
    expect(L.GROOVE_TEMPO).toBe(82);
    expect(task('time', 'tempo').check(world({ tempo: L.GROOVE_TEMPO }))).toBe(true);
  });
});
