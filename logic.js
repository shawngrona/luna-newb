// Newb: everything that talks to LUNA, with no DOM, so tests can exercise it.
//
// Two halves:
//  - Actions: what each "Show me" button does (make a track, load an instrument, write MIDI,
//    add effects, send to a bus, draw automation, record, export).
//  - snapshot(): the state of the lesson session as plain data (the "world"). Lesson tasks
//    are pure checks against that world (lessons.js), so they are easy to test.

const LESSON_SESSION = 'Newb Lesson';
const NAMES = { bass: 'Bass', drums: 'Drums', voice: 'Voice', reverb: 'Reverb' };
const DLS = 'DLSMusicDevice'; // Apple's General MIDI synth: on every Mac, so lessons always have sound

const bar = (session, n) => session.musical.timeline.tickAt({ bar: n });
const beats = (n) => Math.round(n * Luna.TICKS_PER_BEAT);

// ---- the lesson session --------------------------------------------------------------------

function isLessonSession(session) {
  return !!session && String(session.name.value ?? '').startsWith(LESSON_SESSION);
}

/**
 * Save the open session (if any) and create a fresh lesson session. LUNA has one session open
 * at a time, so creating one closes the other. Tries "Newb Lesson", then "Newb Lesson 2", ...
 */
async function startLessonSession(luna, current) {
  if (current) await current.save({ label: 'Before Newb lesson' });
  let lastError;
  for (let n = 1; n <= 20; n++) {
    try {
      const s = await luna.sessions.create({ name: n === 1 ? LESSON_SESSION : `${LESSON_SESSION} ${n}`, timeoutMs: 30000 });
      await s.ready();
      return s;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// ---- tracks ----------------------------------------------------------------------------------

function findTrack(session, name) {
  return session.visibleTracks.find((t) => t.name.value === name) ?? null;
}

async function ensureTrack(session, name, trackType, stemFormat = 'stereo') {
  const found = findTrack(session, name);
  if (found) return found;
  const [track] = await session.newTrack({ name, trackType, stemFormat });
  return track;
}

/** The instrument track the lessons start with: "Bass", else the first instrument track. */
function mainTrack(session) {
  return findTrack(session, NAMES.bass) ?? session.visibleTracks.find((t) => t.trackType.value === 'instrument') ?? null;
}

/** LUNA's metronome is a hidden "click" track: unmuted means the click is on. */
function clickTrack(session) {
  return session.tracks.items.find((t) => t.trackType.value === 'click') ?? null;
}

async function setClick(session, on) {
  const click = clickTrack(session);
  if (!click) throw new Error('This session has no click track');
  await click.loadStrip();
  if (click.mute.on === on) await click.mute.toggle();
}

// ---- plugins ---------------------------------------------------------------------------------

/** Plugins LUNA offers for a slot, leaving out ones this computer is not licensed to run. */
async function choices(luna, session, insertType, channel) {
  const rows = await luna.plugins.query({ insertType, sessionUid: session.uid, channelUid: channel?.id });
  await luna.plugins.load();
  const licensed = (id) => luna.plugins.items.find((p) => p.pluginId.value === id)?.authorized.value !== false;
  return rows.filter((r) => licensed(r.pluginId));
}

async function instrumentChoices(luna, session) {
  const rows = await choices(luna, session, 'instrument');
  // Apple's General MIDI synth first: it is on every Mac.
  return rows.sort((a, b) => (b.name === DLS) - (a.name === DLS) || a.name.localeCompare(b.name));
}

// Effects by job, best first. UA ones are used when licensed; Apple's are on every Mac.
const EFFECTS = {
  eq: ['LUNA Channel', 'AUNBandEQ', 'AUParametricEQ', 'AUGraphicEQ'],
  compressor: ['LA-2A Tube Compressor', '1176 FET Compressor', 'AUDynamicsProcessor'],
  reverb: ['Pure Plate Reverb', 'AUMatrixReverb', 'AUReverb2'],
  delay: ['AUDelay'],
};

/** The best available plugin for a job on a channel, as a query row, or null. */
async function pickEffect(luna, session, channel, job) {
  const rows = await choices(luna, session, 'effect_0', channel);
  for (const name of EFFECTS[job]) {
    const row = rows.find((r) => r.name === name);
    if (row) return row;
  }
  return null;
}

async function instrumentSlot(track) {
  await track.effects.load();
  return track.effects.items.find((e) => e.id === 'instrument') ?? null;
}

async function loadInstrument(track, pluginId) {
  return track.insert(pluginId, 'instrument');
}

async function addEffect(luna, session, channel, job) {
  const row = await pickEffect(luna, session, channel, job);
  if (!row) throw new Error(`No ${job} plugin is available on this computer`);
  await channel.effects.load();
  const already = channel.effects.items.find((e) => e.id.startsWith('effect_') && e.pluginId.value === row.pluginId);
  return already ?? channel.insert(row.pluginId);
}

// ---- MIDI ------------------------------------------------------------------------------------

// The groove the lessons play with: an original two-bar groove in the 1980s digital-dancehall
// style (a busy synth bass pulsing in 16ths over a drum machine), looped over bars 1-4. It is
// written for Newb, not taken from any riddim. Times are in beats from the start of the pattern.
const GROOVE_BARS = 2;
const LESSON_BARS = 4;
const GROOVE_TEMPO = 82;
const BASS_PROGRAM = 38; // General MIDI 39: synth bass 1

const n = (pitch, at, dur, vel, channel = 0) => ({ pitch, at, dur, vel, channel });

// The bass line, two bars, as edited in LUNA (Nov 2026): 16ths on the root with a dip a whole step
// below on beats 1 and 3, a softer pickup filling beat 2, and a turnaround on beat 4: G-F# in
// bar 1 (E minor), C-B in bar 2 (up to A, B pulling back to E). n(pitch, beat, length, velocity).
const BASS_LINE = [
  // Bar 1: E
  n(38, 0, 0.2, 120), n(40, 0.25, 0.2, 112), n(40, 0.5, 0.2, 118), n(40, 0.75, 0.2, 110), n(40, 1, 0.2, 122), n(40, 1.25, 0.2, 108), n(40, 1.5, 0.45, 80), n(40, 1.75, 0.25, 116), n(38, 2, 0.2, 120), n(40, 2.25, 0.2, 112), n(40, 2.5, 0.2, 118), n(40, 2.75, 0.2, 110), n(43, 3, 0.22, 124), n(42, 3.5, 0.3, 118),
  // Bar 2: A
  n(43, 4, 0.2, 120), n(45, 4.25, 0.2, 112), n(45, 4.5, 0.2, 118), n(45, 4.75, 0.2, 110), n(45, 5, 0.2, 122), n(45, 5.25, 0.2, 108), n(45, 5.75, 0.2, 116), n(43, 6, 0.2, 120), n(45, 6.25, 0.2, 112), n(45, 6.5, 0.2, 118), n(45, 6.75, 0.2, 110), n(48, 7, 0.22, 124), n(47, 7.5, 0.3, 118),
];

const KICK = 36;
const SNARE = 38;
const CLOSED_HAT = 42;
const SWING = 0.29; // the late 16th: a little behind straight (0.25), like a drum machine's swing
const DRUM_LINE = (() => {
  const out = [];
  const kicks = [[0, 1.5, 2], [0, 2, 3.5]];
  for (let b = 0; b < GROOVE_BARS; b++) {
    const t = b * 4;
    for (let k = 0; k < 8; k++) {
      out.push(n(CLOSED_HAT, t + k * 0.5, 0.06, 76, 9));             // 8ths
      out.push(n(CLOSED_HAT, t + k * 0.5 + SWING, 0.06, 30, 9));     // soft swung 16ths between
    }
    out.push(n(SNARE, t + 1, 0.15, 104, 9), n(SNARE, t + 3, 0.15, 104, 9)); // backbeat, 2 and 4
    for (const at of kicks[b]) out.push(n(KICK, t + at, 0.1, 100, 9));
  }
  return out;
})();

/** The groove as parts, the shape loopNotes reads. */
const GROOVE = {
  tempo: GROOVE_TEMPO,
  bars: GROOVE_BARS,
  tracks: [
    { name: 'bass', program: BASS_PROGRAM, notes: BASS_LINE },
    { name: 'drums', program: null, notes: DRUM_LINE },
  ],
};

/** The notes of some of the groove's parts, its pattern repeated to fill the lesson's bars. */
function loopNotes(groove, partNames, { times = LESSON_BARS / groove.bars } = {}) {
  const notes = groove.tracks.filter((t) => partNames.includes(t.name)).flatMap((t) => t.notes);
  const out = [];
  for (let k = 0; k < times; k++) for (const x of notes) out.push({ ...x, at: x.at + k * groove.bars * 4 });
  return out;
}

const BASS_PARTS = ['bass'];
const DRUM_PARTS = ['drums'];

/** The first clip on a track's lane, or null. */
async function firstClip(session, track) {
  const lane = session.playlistFor(track);
  if (!lane) return null;
  await lane.clips.load();
  return lane.clips.items[0] ?? null;
}

/**
 * Write notes into one MIDI clip from bar 1. LUNA makes a MIDI clip only around notes it
 * writes, on channel 0 (fact 111), so one placeholder note spanning the part makes the clip,
 * is removed, and the real notes go in with their own channel (drums are on channel 10).
 */
async function writePart(session, track, notes, { program = null, bars = LESSON_BARS } = {}) {
  const start = bar(session, 1);
  const stop = bar(session, 1 + bars);
  const { clip } = await session.playlistFor(track).createNotes([{ pitch: 0, startTick: start, stopTick: stop, velocity: 1 }]);
  await clip.midi.ready();
  await clip.midi.deleteNotes([...clip.midi.notes.items]);
  const offset = start - clip.start.value;
  const channel = notes[0]?.channel ?? 0;
  if (program !== null) await clip.addMidi([{ tick: offset, status: 0xc0 | channel, data1: program }]);
  await clip.addNotes(notes.map((n) => ({
    pitch: n.pitch,
    tick: offset + beats(n.at),
    lengthTicks: Math.max(1, beats(n.dur)),
    velocity: n.vel,
    channel: n.channel,
  })));
  return clip;
}

/** The groove's bass line on a track, on the electric-bass sound of Apple's synth. */
async function writeBassline(luna, session, track, groove = GROOVE) {
  const clip = await writePart(session, track, loopNotes(groove, BASS_PARTS), { program: BASS_PROGRAM });
  await new Luna.SendMidi(luna).sendProgramChange(session.uid, track.id, BASS_PROGRAM);
  return clip;
}

/** The groove's drums on a track (General MIDI drums, channel 10). */
function writeDrums(session, track, groove = GROOVE) {
  return writePart(session, track, loopNotes(groove, DRUM_PARTS));
}

/** Scale every note's velocity, as one undo step. */
async function scaleVelocities(clip, factor) {
  await clip.midi.ready();
  const notes = clip.midi.notes.items;
  await clip.midi.setVelocities(notes.map((note) => ({ note, velocity: Math.max(1, Math.min(127, Math.round(note.velocity * factor))) })));
}

// ---- mixing ----------------------------------------------------------------------------------

/** Make (or find) a "Reverb" bus with a reverb on it, and send a track to it. */
async function sendToReverb(luna, session, track, sendDb = -12) {
  let bus = session.buses.items.find((b) => b.name.value === NAMES.reverb);
  if (!bus) bus = await session.newBus({ name: NAMES.reverb });
  await addEffect(luna, session, bus, 'reverb');
  await track.outputs.load();
  const send = track.outputs.byId('send_0');
  if (send.busUid.value !== bus.id) await send.retarget(bus.id);
  await send.controls.load();
  if (send.enabled.real.value === false) await send.enabled.real.set(true);
  await send.gain.real.set(sendDb);
  return { bus, send };
}

/** A four-bar fade-in on a track's volume, and the track set to play it back. */
async function fadeIn(session, track) {
  const start = bar(session, 1);
  const stop = bar(session, 5);
  await track.gain.automation.insert([{ tick: start, value: -40 }, { tick: stop, value: 0 }], { startTick: start, stopTick: stop });
  await track.setAutomationMode('read');
}

// ---- looping the groove ---------------------------------------------------------------------

/**
 * Make sure the groove loops: the loop round bars 1-4 (bar 1 up to bar 5) and turned on. A
 * locate (transport.seek, or clicking to move the playhead in some places) moves both loop
 * markers to the playhead, collapsing the loop to nothing, so this puts it back when it has
 * shrunk below a bar or no longer covers the groove.
 */
async function loopGroove(session) {
  const t = session.transport;
  const start = bar(session, 1);
  const stop = bar(session, 1 + LESSON_BARS);
  const s = t.loopStart.value;
  const e = t.loopStop.value;
  const covers = s !== undefined && e !== undefined && s <= start && e >= stop;
  if (!covers) await t.setLoop(start, stop);
  if (!t.looping.value) await t.looping.set(true);
}

/**
 * Play from a bar without moving the loop. Moving the playhead right after a stop doesn't take
 * while LUNA is still finishing the stop (measured: immediately fails, 0.8 s later works), so
 * stop first, give it a moment, and retry the move once.
 */
async function playFrom(session, n = 1) {
  const t = session.transport;
  if (t.playing.value) {
    await t.stop();
    await new Promise((r) => setTimeout(r, 800));
  }
  try {
    await t.setPlayStart({ bar: n });
  } catch (e) {
    if (e?.code !== 'no_effect') throw e;
    await new Promise((r) => setTimeout(r, 800));
    await t.setPlayStart({ bar: n });
  }
  await t.play();
}

// ---- recording and export --------------------------------------------------------------------

/**
 * Record `bars` bars onto an audio track from bar 1. LUNA only captures when the punch point
 * is inside the loop range (fact 75), so the loop is set around the take first.
 */
async function recordTake(session, track, inputUid, bars = 4) {
  const start = bar(session, 1);
  const stop = bar(session, 1 + bars);
  await session.transport.setLoop(start, stop);
  const seconds = session.musical.timeline.seconds(stop) - session.musical.timeline.seconds(start);
  return session.record({ track, inputUid, startTick: start, seconds });
}

/** Export the mix: LUNA's own export of the main bus to the session's export folder. */
async function exportMix(session, name = 'Newb mix', onProgress = () => {}) {
  const { render, file } = await session.exportMain({ name });
  const off = render.progress.onChange(() => onProgress(render.progress.value));
  try {
    await render.done();
  } catch (e) {
    // A short offline export can finish before anything sees it (fact 44): the file is written.
    if (e?.code !== 'removed') throw e;
  } finally {
    off();
  }
  return file;
}

// ---- pointing at things in LUNA ------------------------------------------------------------
//
// Clickable words in a lesson make LUNA show what they name: a page, a track, a range of bars,
// a clip, some notes, a plugin window. They change only what is selected or shown, never
// the session's content, and never do a lesson task for the learner: so they don't switch
// pages (opening the Mixer is a task) or play (pressing Play is one). A selection shows on
// both pages. LUNA's own controls (the transport bar, menus, a strip's knobs) cannot be
// pointed at: the SDK has no way to.

class NotYet extends Error {}
const needTrack = (session, name, lessonTitle) => {
  const t = name === NAMES.bass ? mainTrack(session) : findTrack(session, name);
  if (!t) throw new NotYet(`There's no ${name} track yet: it's made in "${lessonTitle}".`);
  return t;
};
const busNamed = (session, name) => session.buses.items.find((b) => b.name.value === name) ?? null;
const mainBus = (session) => session.buses.items.find((b) => b.busType?.value === 'master') ?? null;

async function selectTracks(session, channels) {
  await session.context.select({ trackUids: channels.map((c) => c.id), focus: 'timeline' });
  if (channels[0]) await session.context.lastSelectedTrack.set(channels[0].id).catch(() => {});
}

/**
 * Run a selection change, then put the playhead and loop back. In LUNA, selecting a range or
 * notes also moves the playhead and loop to them; pointing must not move the learner's.
 */
async function keepingTransport(session, fn) {
  const t = session.transport;
  const home = t.location.value?.tick;
  const loop = [t.loopStart.value, t.loopStop.value];
  await fn();
  await new Promise((r) => setTimeout(r, 150)); // let LUNA's own follow-up moves arrive
  if (loop[0] !== undefined && loop[1] !== undefined && (t.loopStart.value !== loop[0] || t.loopStop.value !== loop[1])) await t.setLoop(loop[0], loop[1]);
  if (home !== undefined && t.location.value?.tick !== home) await t.setPlayStart(home);
}

/** Select a range of bars on some tracks. */
function selectRange(session, startTick, stopTick, channels = session.visibleTracks) {
  const lanes = channels.map((c) => session.playlistFor(c)).filter(Boolean);
  return keepingTransport(session, () =>
    session.context.select({ startTick, stopTick, trackUids: channels.map((c) => c.id), playlistUids: lanes.map((l) => l.id), focus: 'timeline' }));
}

async function openSlot(slot, what) {
  if (!slot) throw new NotYet(`There's no ${what} yet.`);
  await slot.openEditor();
}

async function effectNamed(luna, channel, pattern) {
  await channel.effects.load();
  for (const e of channel.effects.items) {
    if (e.id.startsWith('effect_') && e.pluginId.value && pattern.test(await pluginName(luna, e.pluginId.value))) return e;
  }
  return null;
}

const POINTERS = {
  async tracks(luna, session) {
    if (!session.visibleTracks.length) throw new NotYet('There are no tracks yet: the first one is made in "Instrument tracks".');
    await selectTracks(session, session.visibleTracks);
  },
  async bars(luna, session) {
    await selectRange(session, bar(session, 1), bar(session, 5));
  },
  // Hop the playhead along the ruler and back, without playing and without touching the loop.
  async playhead(luna, session) {
    const t = session.transport;
    if (t.playing.value) return;
    const home = t.location.value?.tick ?? bar(session, 1);
    for (const n of [2, 3, 4]) {
      await t.setPlayStart({ bar: n });
      await new Promise((r) => setTimeout(r, 450));
    }
    await t.setPlayStart(home);
  },
  async loop(luna, session) {
    const t = session.transport;
    if (t.loopStart.value === undefined || t.loopStop.value === undefined || t.loopStop.value <= t.loopStart.value) throw new NotYet('No loop is set yet.');
    await selectRange(session, t.loopStart.value, t.loopStop.value);
  },
  async grid(luna, session) {
    const g = session.context.gridEnable;
    const was = g.value === true;
    for (let i = 0; i < 4; i++) {
      await g.set(i % 2 === 0 ? !was : was);
      await new Promise((r) => setTimeout(r, 450));
    }
  },
  async bass(luna, session) {
    await selectTracks(session, [needTrack(session, NAMES.bass, 'Instrument tracks')]);
  },
  async drums(luna, session) {
    await selectTracks(session, [needTrack(session, NAMES.drums, 'The channel strip')]);
  },
  async voice(luna, session) {
    await selectTracks(session, [needTrack(session, NAMES.voice, 'Getting ready to record audio')]);
  },
  async strip(luna, session) {
    const t = needTrack(session, NAMES.bass, 'Instrument tracks');
    await selectTracks(session, [t]);
  },
  async 'main-bus'(luna, session) {
    const m = mainBus(session);
    if (m) await selectTracks(session, [m]).catch(() => {});
  },
  async 'reverb-bus'(luna, session) {
    const b = busNamed(session, NAMES.reverb);
    if (!b) throw new NotYet('There\'s no Reverb bus yet: it\'s made in "Sends and buses".');
    await selectTracks(session, [b]).catch(() => {});
  },
  async clip(luna, session) {
    const t = needTrack(session, NAMES.bass, 'Instrument tracks');
    const c = await firstClip(session, t);
    if (!c) throw new NotYet('There\'s no clip yet: the bass line goes in during "MIDI: notes, not sound".');
    await selectRange(session, c.start.value, c.stop.value, [t]);
  },
  // The first beat's notes of the bass line.
  async notes(luna, session) {
    const t = needTrack(session, NAMES.bass, 'Instrument tracks');
    const c = await firstClip(session, t);
    if (!c) throw new NotYet('There are no notes yet: the bass line goes in during "MIDI: notes, not sound".');
    await c.midi.ready();
    const first = c.midi.notes.items.filter((n) => n.startTick < Luna.TICKS_PER_BEAT);
    const lane = session.playlistFor(t);
    await keepingTransport(session, () =>
      session.context.selectNotes(lane.id, first.map((n) => [n.pitch, c.start.value + n.startTick, c.start.value + (n.stopTick ?? n.startTick), n.rowid])));
  },
  async take(luna, session) {
    const t = needTrack(session, NAMES.voice, 'Getting ready to record audio');
    const c = await firstClip(session, t);
    if (!c) throw new NotYet('There\'s no take yet: it\'s recorded in "Record a take".');
    await selectRange(session, c.start.value, c.stop.value, [t]);
  },
  async automation(luna, session) {
    const t = needTrack(session, NAMES.bass, 'Instrument tracks');
    await selectRange(session, bar(session, 1), bar(session, 5), [t]);
  },
  async 'instrument-window'(luna, session) {
    const t = needTrack(session, NAMES.bass, 'Instrument tracks');
    const slot = await instrumentSlot(t);
    await openSlot(slot?.pluginId.value ? slot : null, 'instrument loaded on Bass');
  },
  async 'comp-window'(luna, session) {
    const t = needTrack(session, NAMES.drums, 'The channel strip');
    await openSlot(await effectNamed(luna, t, /comp|1176|la-2a|dynamics|limit/i), 'compressor on the Drums');
  },
  async 'reverb-window'(luna, session) {
    const b = busNamed(session, NAMES.reverb);
    await openSlot(b ? await effectNamed(luna, b, /reverb|plate|rvb|verb/i) : null, 'reverb on a Reverb bus');
  },
};

/** Make LUNA show what a lesson word names. Throws NotYet (with a friendly message) when it doesn't exist yet. */
async function point(luna, session, name) {
  const fn = POINTERS[name];
  if (!fn) throw new Error(`Nothing to show for "${name}"`);
  return fn(luna, session);
}

// ---- the world -------------------------------------------------------------------------------

/**
 * Plugin display names by id. A slot reports only its plugin's id (pluginName is empty), so
 * names come from LUNA's plugin list, read once.
 */
let pluginNames = null;
async function pluginName(luna, id) {
  if (!id) return null;
  if (!pluginNames) {
    await luna.plugins.load();
    pluginNames = new Map(luna.plugins.items.map((p) => [String(p.pluginId.value).trim(), p.name.value]));
  }
  return pluginNames.get(String(id).trim()) ?? id;
}

/** Everything the lessons check, as plain data. Loads what it needs; call it again on changes. */
async function snapshot(luna, session) {
  const t = session.transport;
  const w = {
    session: session.name.value ?? '',
    lesson: isLessonSession(session),
    page: luna.gui.main?.page.value ?? null,
    playing: t.playing.value === true,
    recording: t.recordEnabled?.value === true,
    tick: t.location.value?.tick ?? 0,
    bar: t.location.value?.bar_beat?.bar ?? 1,
    looping: t.looping.value === true,
    loopBars: null,
    countIn: t.countInEnabled.value === true,
    tempo: session.musical.timeline.tempoLoaded ? session.musical.tempoAt(bar(session, 1)) : null,
    click: null,
    tracks: [],
    buses: [],
  };
  if (t.loopStart.value !== undefined && t.loopStop.value !== undefined) {
    const tl = session.musical.timeline;
    w.loopBars = [tl.barBeat(t.loopStart.value).bar, tl.barBeat(t.loopStop.value).bar];
  }
  const click = clickTrack(session);
  if (click) {
    await click.loadStrip();
    w.click = !click.mute.on;
  }
  for (const track of session.visibleTracks) {
    await track.loadStrip();
    await track.effects.load();
    await track.outputs.load();
    const lane = session.playlistFor(track);
    if (lane) await lane.clips.load();
    const clips = lane ? lane.clips.items : [];
    const send = track.outputs.byId('send_0');
    if (send) await send.controls.load();
    const ins = track.effects.items.find((e) => e.id === 'instrument');
    let velocity = null;
    const midi = clips.find((c) => c.clipType?.value === 'midi' || c.midi);
    if (track.trackType.value === 'instrument' && midi?.midi) {
      await midi.midi.ready();
      const notes = midi.midi.notes.items;
      velocity = notes.length ? notes.reduce((s, n) => s + n.velocity, 0) / notes.length : null;
    }
    w.tracks.push({
      name: track.name.value,
      type: track.trackType.value,
      gainDb: track.gain.real.value,
      // Where the track sits, 0 (left) to 1 (right). A stereo track has two pan knobs, one per
      // side, starting fully left and fully right (0 and 1): its position is their average.
      pan: track.main.pans.reduce((sum, p) => sum + (p.normalized.value ?? 0.5), 0) / Math.max(1, track.main.pans.length),
      muted: track.mute.on,
      soloed: track.solo.on,
      armed: track.recordEnabled.value === true,
      input: track.inputNodeUid.value ?? null,
      instrument: ins?.pluginId.value || null,
      instrumentName: await pluginName(luna, ins?.pluginId.value),
      effects: await Promise.all(track.effects.items
        .filter((e) => e.id.startsWith('effect_') && e.pluginId.value)
        .map(async (e) => ({ id: e.id, plugin: e.pluginId.value, name: await pluginName(luna, e.pluginId.value), in: e.in.value !== false, open: e.editorOpen.value === true }))),
      clips: clips.length,
      velocity,
      sendBus: send?.busUid.value ?? null,
      sendDb: send?.assigned ? send.gain.real.value : null,
      automation: track.gain.automation?.breakpoints.length ?? 0,
      automationMode: track.automationMode?.value ?? null,
    });
  }
  // Aux buses only: not the main output or the cue (headphone) buses.
  for (const b of session.buses.items) {
    if (b.busType?.value !== 'aux') continue;
    await b.effects.load();
    const fx = b.effects.items.filter((e) => e.id.startsWith('effect_') && e.pluginId.value);
    w.buses.push({ id: b.id, name: b.name.value, effects: await Promise.all(fx.map((e) => pluginName(luna, e.pluginId.value))) });
  }
  return w;
}

const AddOnLogic = {
  LESSON_SESSION, NAMES, DLS, EFFECTS, GROOVE, GROOVE_TEMPO, LESSON_BARS, BASS_PARTS, DRUM_PARTS,
  isLessonSession, startLessonSession, findTrack, ensureTrack, mainTrack, clickTrack, setClick,
  choices, instrumentChoices, pickEffect, instrumentSlot, loadInstrument, addEffect,
  loopNotes, firstClip, writePart, writeBassline, writeDrums, scaleVelocities,
  sendToReverb, fadeIn, loopGroove, playFrom, recordTake, exportMix, snapshot, bar,
  POINTERS, point, NotYet,
};

globalThis.AddOnLogic = AddOnLogic;
