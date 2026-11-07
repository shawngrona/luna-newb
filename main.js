// Newb: the lesson player. Connects to LUNA, keeps a snapshot of the lesson session (the
// "world"), and re-checks the current lesson's tasks whenever LUNA changes. A task, once
// done, stays done. "Show me" runs the action named by the task (ACTIONS below).

const $ = (id) => document.getElementById(id);
const L = AddOnLogic;
const H = LessonHelpers;

let luna;
let session;
let world = null;
let busy = false;
const sessionBindings = new Luna.Bindings();
const detailBindings = new Luna.Bindings();

// Progress lives only while Newb is open: close it and open it again, and the course starts
// over. Nothing is saved between opens. `lessonSessionUid` is the session this run created:
// only it counts as the lesson session, so an old lesson session left open can't tick steps.
const freshProgress = () => ({ done: {}, mem: {}, exportedFile: null, revealed: false, failures: {} });
const state = { lesson: 0, progress: freshProgress(), instrument: null, input: null };
let lessonSessionUid = null;
const save = () => {}; // nothing persists between opens, on purpose
const status = (text, warn = false) => {
  $('status').textContent = text;
  $('status').classList.toggle('warn', warn);
};
const lesson = () => LESSONS[state.lesson] ?? LESSONS[0];
const prog = () => state.progress;
const inLesson = () => !!session && !session.disposed && session.uid === lessonSessionUid;
const memFor = (id) => (prog().mem[id] ??= {});
const doneKey = (l, t) => `${l.id}:${t.id}`;

// ---- a confirm dialog of our own (a web view may not show window.confirm) ---------------------

function ask(title, text, okLabel = 'OK') {
  return new Promise((resolve) => {
    $('dlg-title').textContent = title;
    $('dlg-text').textContent = text;
    $('dlg-ok').textContent = okLabel;
    $('dialog').hidden = false;
    const done = (v) => {
      $('dialog').hidden = true;
      $('dlg-ok').onclick = $('dlg-cancel').onclick = null;
      resolve(v);
    };
    $('dlg-ok').onclick = () => done(true);
    $('dlg-cancel').onclick = () => done(false);
  });
}

// ---- "Show me" -----------------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const bassOf = () => L.mainTrack(session);
const track = (name) => L.findTrack(session, name);

/** The Bass track with an instrument on it, made if need be. */
async function ensureBass() {
  const t = bassOf() ?? (await L.ensureTrack(session, L.NAMES.bass, 'instrument'));
  const slot = await L.instrumentSlot(t);
  if (!slot?.pluginId.value) await L.loadInstrument(t, await chosenInstrument());
  return t;
}

async function chosenInstrument() {
  if (state.instrument) return state.instrument;
  const rows = await L.instrumentChoices(luna, session);
  if (!rows.length) throw new Error('No instrument plugins are available');
  return rows[0].pluginId;
}

/** The Drums track: always Apple's General MIDI synth, whose drum kit lives on channel 10. */
async function ensureDrums() {
  await ACTIONS.writeBassline();
  const t = await L.ensureTrack(session, L.NAMES.drums, 'instrument');
  const slot = await L.instrumentSlot(t);
  if (!slot?.pluginId.value) {
    const rows = await L.instrumentChoices(luna, session);
    const gm = rows.find((r) => r.name === L.DLS);
    if (!gm) throw new Error(`${L.DLS} (Apple's General MIDI synth) isn't available for the drums`);
    await L.loadInstrument(t, gm.pluginId);
  }
  if (!(await L.firstClip(session, t))) await L.writeDrums(session, t);
  return t;
}

const ACTIONS = {
  // Always a brand-new lesson session (saving whatever is open), and fresh progress with it.
  async startSession() {
    const current = luna.sessions.current();
    if (current) {
      const ok = await ask('Start a new lesson session?', `Newb will save "${current.name.value}" and open a new "Newb Lesson" session. LUNA has one session open at a time, so "${current.name.value}" will close. You can reopen it any time.`, 'Save and start');
      if (!ok) return;
    }
    status('Creating the lesson session...');
    const created = await L.startLessonSession(luna, current ?? null);
    state.progress = freshProgress();
    lessonSessionUid = created.uid;
    if (session?.uid !== created.uid) await bindSession();
    renderTasks();
    refresh();
  },
  pageMixer: () => luna.gui.main.page.set('mixer'),
  pageTimeline: () => luna.gui.main.page.set('timeline'),
  tempo82: () => session.musical.setTempoInEffectAt(L.GROOVE_TEMPO, L.bar(session, 1)),
  clickOn: () => L.setClick(session, true),
  play: () => session.transport.play(),
  stop: () => session.transport.stop(),
  // setPlayStart moves only the playhead; seek is a locate, which drags the loop markers along.
  seek5: () => session.transport.setPlayStart({ bar: 5 }),
  async loop4() {
    await session.transport.setLoop(L.bar(session, 1), L.bar(session, 5));
    if (!session.transport.looping.value) await session.transport.looping.set(true);
  },
  bassTrack: () => L.ensureTrack(session, L.NAMES.bass, 'instrument'),
  async loadInstrument() {
    const t = bassOf() ?? (await L.ensureTrack(session, L.NAMES.bass, 'instrument'));
    await L.loadInstrument(t, await chosenInstrument());
  },
  async writeBassline() {
    const t = await ensureBass();
    if (!(await L.firstClip(session, t))) await L.writeBassline(luna, session, t);
  },
  async playFromStart() {
    if ((bassOf() && (await L.firstClip(session, bassOf())))) await L.loopGroove(session);
    await L.playFrom(session, 1);
  },
  async swapInstrument() {
    const t = await ensureBass();
    const current = (await L.instrumentSlot(t))?.pluginId.value;
    const rows = await L.instrumentChoices(luna, session);
    const next = rows.find((r) => r.pluginId === state.instrument && r.pluginId !== current) ?? rows.find((r) => r.pluginId !== current);
    if (!next) throw new Error('Only one instrument is available on this computer');
    state.instrument = next.pluginId;
    save();
    $('instrument-pick').value = next.pluginId;
    await L.loadInstrument(t, next.pluginId);
  },
  async softer() {
    const clip = await L.firstClip(session, await ensureBass());
    if (!clip) throw new Error('Load the bass line first (MIDI lesson)');
    await L.scaleVelocities(clip, 0.6);
  },
  addDrums: () => ensureDrums(),
  fader: async () => (await ensureDrums()).gain.real.set(-6),
  // Pan the drums left, let it be heard, then put them back where they were.
  async pan() {
    const d = await ensureDrums();
    await d.loadStrip();
    const pans = d.main.pans;
    const was = pans.map((p) => p.normalized.value ?? 0.5);
    for (const [i, p] of pans.entries()) await p.normalized.set(Math.max(0, was[i] - 0.2));
    status('Drums panned left... listen... moving them back in 3 seconds.');
    await wait(3000);
    for (const [i, p] of pans.entries()) await p.normalized.set(was[i]);
  },
  async solo() {
    const b = await ensureBass();
    await b.loadStrip();
    if (!b.solo.on) await b.solo.toggle();
    await wait(2500);
    if (b.solo.on) await b.solo.toggle();
  },
  addEq: async () => L.addEffect(luna, session, await ensureBass(), 'eq'),
  async openEq() {
    const slot = await L.addEffect(luna, session, await ensureBass(), 'eq');
    await slot.openEditor();
  },
  async bypassEq() {
    const slot = await L.addEffect(luna, session, await ensureBass(), 'eq');
    await slot.setIn(false);
    status('EQ bypassed... listen... turning it back on in 3 seconds.');
    await wait(3000);
    await slot.setIn(true);
  },
  addComp: async () => L.addEffect(luna, session, await ensureDrums(), 'compressor'),
  reverbBus: async () => L.sendToReverb(luna, session, await ensureDrums(), -12),
  async sendLevel() {
    const { send } = await L.sendToReverb(luna, session, await ensureDrums(), -10);
    await send.gain.real.set(-10);
    await ACTIONS.playFromStart();
  },
  voiceTrack: () => L.ensureTrack(session, L.NAMES.voice, 'audio', 'mono'),
  async setInput() {
    const t = await L.ensureTrack(session, L.NAMES.voice, 'audio', 'mono');
    const uid = state.input ?? (await luna.audioInputs())[0]?.uid;
    if (!uid) throw new Error('LUNA has no audio inputs. Check LUNA\'s audio settings.');
    await t.inputNodeUid.set(uid);
  },
  async arm() {
    const t = await L.ensureTrack(session, L.NAMES.voice, 'audio', 'mono');
    await t.loadStrip();
    if (!t.recordEnabled.value) await t.recordEnabled.set(true);
  },
  countIn: () => session.transport.countInEnabled.set(true),
  async recordTake() {
    const t = await L.ensureTrack(session, L.NAMES.voice, 'audio', 'mono');
    const inputs = await luna.audioInputs();
    const input = inputs.find((i) => i.uid === (state.input ?? t.inputNodeUid.value)) ?? inputs[0];
    if (!input) throw new Error('LUNA has no audio inputs. Check LUNA\'s audio settings.');
    const ok = await ask('Record 4 bars?', `Newb will record 4 bars from "${input.name ?? input.uid}" onto the Voice track, starting at bar 1${session.transport.countInEnabled.value ? ' after the count-in' : ''}. Use headphones if your speakers are on.`, 'Record');
    if (!ok) return;
    status('Recording... make some noise!');
    await L.recordTake(session, t, input.uid, 4);
  },
  async listenTake() {
    const t = track(L.NAMES.voice);
    if (t?.recordEnabled.value) await t.recordEnabled.set(false);
    await ACTIONS.playFromStart();
  },
  fadeIn: async () => L.fadeIn(session, await ensureBass()),
  async export() {
    if (session.transport.playing.value) await session.transport.stop();
    $('export-progress').hidden = false;
    const file = await L.exportMix(session, 'Newb mix', (p) => ($('export-bar').style.width = `${Math.round(p * 100)}%`));
    $('export-bar').style.width = '100%';
    prog().exportedFile = file ?? 'exported';
    save();
    $('export-file').textContent = file ? `Saved: ${file}` : 'Exported to the session\'s export folder.';
  },
  async reveal() {
    if (!prog().exportedFile || prog().exportedFile === 'exported') throw new Error('Export the mix first');
    if (!(await luna.gui.available())) throw new Error('Finder can only be opened from inside LUNA');
    await luna.gui.revealPath(prog().exportedFile);
    prog().revealed = true;
    save();
    refresh();
  },
};

async function run(name) {
  if (busy) return;
  busy = true;
  document.body.classList.add('busy');
  const action = ACTIONS[name]();
  // Never leave the buttons locked: if LUNA is slow to answer, unlock after 30 s and keep going.
  const slow = new Promise((r) => setTimeout(() => r('slow'), 30000));
  try {
    if ((await Promise.race([action, slow])) === 'slow') status('Still waiting for LUNA... the buttons are unlocked again.', true);
    else status('');
  } catch (e) {
    status(e.message ?? String(e), true);
  } finally {
    busy = false;
    document.body.classList.remove('busy');
    refresh();
  }
  action.catch((e) => status(e.message ?? String(e), true));
}

// ---- setting a lesson up ---------------------------------------------------------------------
//
// Each lesson lists what it builds on (`needs`). Opening a lesson makes whatever is missing,
// so jumping ahead, or starting a fresh lesson session, still lands on a working session.

const SETUP = {
  bass: { label: 'the Bass track', run: () => ensureBass() },
  groove: { label: 'the groove\'s bass line', run: async () => { await ACTIONS.writeBassline(); await L.loopGroove(session); } },
  drums: { label: 'the Drums', run: () => ensureDrums() },
  voice: { label: 'the Voice track', run: () => ACTIONS.setInput() },
};

/** What the current lesson needs that the session doesn't have yet. */
function missingNeeds() {
  return world ? LessonHelpers.missing(lesson().needs ?? [], world) : [];
}

// Called whenever Newb looks at LUNA: fills in whatever the lesson needs, until it's there.
// A need that fails twice is left alone (with its error shown) rather than retried forever.
let settingUp = false;
async function setUpLesson() {
  if (!inLesson() || busy || settingUp) return;
  const todo = missingNeeds().filter((n) => (prog().failures[n] ?? 0) < 2);
  if (!todo.length) return;
  settingUp = true;
  busy = true;
  document.body.classList.add('busy');
  try {
    for (const need of todo) {
      status(`Setting up this lesson: ${SETUP[need].label}...`);
      try {
        await SETUP[need].run();
      } catch (e) {
        prog().failures[need] = (prog().failures[need] ?? 0) + 1;
        status(`Couldn't set up ${SETUP[need].label}: ${e.message ?? e}`, true);
        return;
      }
    }
    status('');
  } finally {
    busy = false;
    settingUp = false;
    document.body.classList.remove('busy');
    refresh();
  }
}

// ---- checking ------------------------------------------------------------------------------

let refreshing = false;
let again = false;
let lastRefresh = 0;
// LUNA pushes the playhead several times a second; one snapshot at a time, at most 4 a second.
function refresh() {
  if (refreshing) {
    again = true;
    return;
  }
  refreshing = true;
  const delay = Math.max(0, 250 - (Date.now() - lastRefresh));
  setTimeout(async () => {
    try {
      lastRefresh = Date.now();
      if (session && !session.disposed) {
        world = await L.snapshot(luna, session);
        world.lesson = inLesson();
        world.exported = !!prog().exportedFile;
        world.revealed = prog().revealed;
        evaluate();
        bindDetails();
      }
    } catch (e) {
      if (!session?.disposed) console.warn(e);
    } finally {
      refreshing = false;
      if (again) {
        again = false;
        refresh();
      }
    }
  }, delay);
}

function evaluate() {
  const l = lesson();
  const m = memFor(l.id);
  let changed = false;
  for (const t of l.tasks) {
    if (prog().done[doneKey(l, t)] || t.manual || !world) continue;
    const needsLesson = t.show !== 'startSession';
    if (needsLesson && !world.lesson) continue;
    if (t.check(world, m)) {
      prog().done[doneKey(l, t)] = true;
      changed = true;
    }
  }
  if (changed) renderTasks();
  renderTop();
  setUpLesson();
}

// Follow everything the lessons look at, track by track. Rebuilt when tracks, effects or clips change.
let detailSig = '';
function bindDetails() {
  if (!session || !world) return;
  const sig = JSON.stringify(world.tracks.map((t) => [t.name, t.effects.length, t.clips, t.sendBus]).concat(world.buses.map((b) => b.name)));
  if (sig === detailSig) return;
  detailSig = sig;
  detailBindings.clear();
  const on = (prop) => prop && detailBindings.on(prop, refresh);
  for (const t of session.visibleTracks) {
    for (const p of [t.name, t.gain.real, ...t.main.pans.map((c) => c.normalized), t.mute.real, t.solo.real, t.recordEnabled, t.inputNodeUid, t.automationMode]) on(p);
    detailBindings.add(t.effects.onChange(refresh));
    for (const e of t.effects.items) for (const p of [e.pluginId, e.in, e.editorOpen]) on(p);
    const send = t.outputs.byId('send_0');
    if (send) for (const p of [send.busUid, send.gain.real]) on(p);
    const lane = session.playlistFor(t);
    if (lane) {
      detailBindings.add(lane.clips.onChange(refresh));
      for (const c of lane.clips.items) if (c.midi) detailBindings.add(c.midi.notes.onChange?.(refresh) ?? (() => {}));
    }
    if (t.gain.automation) detailBindings.add(t.gain.automation.onChange(refresh));
  }
  for (const b of session.buses.items) detailBindings.add(b.effects.onChange(refresh));
  const click = L.clickTrack(session);
  if (click) on(click.mute.real);
}

// ---- rendering -----------------------------------------------------------------------------

function renderNav() {
  const sel = $('lesson-pick');
  sel.innerHTML = '';
  let n = 0;
  for (const c of COURSE) {
    const g = document.createElement('optgroup');
    g.label = c.chapter;
    for (const l of c.lessons) {
      const o = document.createElement('option');
      o.value = n++;
      o.textContent = `${n}. ${l.title}`;
      g.appendChild(o);
    }
    sel.appendChild(g);
  }
}

function lessonDone(l) {
  return l.tasks.every((t) => prog().done[doneKey(l, t)]);
}

function renderTop() {
  const total = LESSONS.reduce((s, l) => s + l.tasks.length, 0);
  const done = LESSONS.reduce((s, l) => s + l.tasks.filter((t) => prog().done[doneKey(l, t)]).length, 0);
  $('progress-bar').style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
  $('progress-text').textContent = `${done} of ${total} steps`;
  $('lesson-pick').value = state.lesson;
  $('prev').disabled = state.lesson === 0;
  $('next').disabled = state.lesson === LESSONS.length - 1;
  $('next').classList.toggle('primary', lessonDone(lesson()) && state.lesson < LESSONS.length - 1);
  const needSession = !world?.lesson;
  $('session-banner').hidden = !needSession || lesson().id === 'what-is-a-daw';
}

function renderTasks() {
  const l = lesson();
  const root = $('tasks');
  root.innerHTML = '';
  $('tasks-head').hidden = !l.tasks.length;
  for (const t of l.tasks) {
    const done = !!prog().done[doneKey(l, t)];
    const li = document.createElement('li');
    li.className = done ? 'done' : '';
    li.innerHTML = '<span class="tick"></span><span class="text"></span><span class="acts"></span>';
    li.querySelector('.tick').textContent = done ? '✓' : '';
    li.querySelector('.text').innerHTML = t.text; // course text is ours; it may hold <a data-show> links
    const acts = li.querySelector('.acts');
    if (t.show && !(done && t.show === 'startSession')) {
      const b = document.createElement('button');
      b.textContent = done ? 'Again' : t.show === 'startSession' ? 'Start' : 'Show me';
      if (done) b.className = 'again';
      b.onclick = () => run(t.show);
      acts.appendChild(b);
    }
    if (!done && t.manual) {
      const b = document.createElement('button');
      b.textContent = 'I did it';
      b.onclick = () => {
        prog().done[doneKey(l, t)] = true;
        save();
        renderTasks();
        renderTop();
      };
      acts.appendChild(b);
    }
    root.appendChild(li);
  }
}

async function renderWidgets() {
  const l = lesson();
  const wanted = new Set([l.widget, ...l.tasks.map((t) => t.widget)].filter(Boolean));
  for (const id of ['instrument', 'qwerty', 'input', 'record', 'export']) $(`w-${id}`).hidden = !wanted.has(id);
  if (wanted.has('instrument') && session) {
    const sel = $('instrument-pick');
    try {
      const rows = await L.instrumentChoices(luna, session);
      sel.innerHTML = '';
      for (const r of rows) sel.appendChild(Object.assign(document.createElement('option'), { value: r.pluginId, textContent: r.name === L.DLS ? `${r.name} (Apple General MIDI)` : r.name }));
      sel.value = state.instrument && rows.some((r) => r.pluginId === state.instrument) ? state.instrument : rows[0]?.pluginId ?? '';
    } catch {}
  }
  if (wanted.has('input') && session) {
    const sel = $('input-pick');
    try {
      const inputs = await luna.audioInputs();
      sel.innerHTML = '';
      for (const i of inputs) sel.appendChild(Object.assign(document.createElement('option'), { value: i.uid, textContent: i.name ?? i.uid }));
      sel.value = state.input && inputs.some((i) => i.uid === state.input) ? state.input : inputs[0]?.uid ?? '';
    } catch {}
  }
  if (wanted.has('export')) {
    $('export-progress').hidden = !prog().exportedFile;
    $('export-file').textContent = prog().exportedFile && prog().exportedFile !== 'exported' ? `Saved: ${prog().exportedFile}` : '';
  }
}

function renderLesson() {
  const l = lesson();
  $('chapter').textContent = `${l.chapter} · Lesson ${state.lesson + 1} of ${LESSONS.length}`;
  $('title').textContent = l.title;
  $('body').innerHTML = l.body;
  $('deeper').hidden = !l.deeper;
  $('deeper-body').innerHTML = l.deeper ?? '';
  $('deeper').open = false;
  renderTasks();
  renderWidgets();
  renderTop();
  $('lesson').scrollTop = 0;
  evaluate();
  setUpLesson();
}

function go(i) {
  state.lesson = Math.max(0, Math.min(LESSONS.length - 1, i));
  save();
  renderLesson();
}

// ---- computer keys -------------------------------------------------------------------------

let qwerty;
function wireQwerty() {
  document.addEventListener('keydown', (e) => {
    if (!$('qwerty').checked || $('w-qwerty').hidden || !qwerty || !session || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = bassOf();
    if (!t) return;
    if (qwerty.handleKeyDown(e, session.uid, t.id)) {
      memFor(lesson().id).qwerty = true;
      $('octave').textContent = qwerty.octave.value;
      evaluate();
    }
  });
  document.addEventListener('keyup', (e) => qwerty?.handleKeyUp(e));
  window.addEventListener('blur', () => qwerty?.releaseAll());
}

// ---- LUNA ----------------------------------------------------------------------------------

async function bindSession() {
  sessionBindings.clear();
  detailBindings.clear();
  detailSig = '';
  session = luna.sessions.current();
  world = null;
  if (!session) {
    status('No session open. Start a lesson session to begin.');
    renderTasks();
    renderTop();
    return;
  }
  await session.ready();
  const t = session.transport;
  for (const p of [t.playing, t.location, t.looping, t.loopStart, t.loopStop, t.countInEnabled]) sessionBindings.on(p, refresh);
  sessionBindings.add(session.musical.timeline.onChange(refresh));
  sessionBindings.add(session.tracks.onChange(refresh));
  sessionBindings.add(session.buses.onChange(refresh));
  status(inLesson() ? '' : 'Press Start in lesson 1 to open a fresh lesson session.');
  // Ticks belong to the session: show this one's, and build what the current lesson needs.
  renderTasks();
  renderTop();
  renderWidgets();
  refresh();
  setUpLesson();
}

async function connect() {
  for (;;) {
    try {
      luna = await Luna.connect();
      break;
    } catch (e) {
      status(e instanceof Luna.NotRunning ? 'Waiting for LUNA...' : e.message, true);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  Luna.bindShortcuts(luna);
  qwerty = new Luna.QwertyMidi(new Luna.SendMidi(luna));
  if (await luna.gui.available()) {
    luna.gui.main.watch?.();
    luna.gui.main.page.onChange(refresh);
  }
  await luna.sessions.ready();
  luna.sessions.focused.onChange(bindSession);
  luna.sessions.items.onChange(bindSession);
  luna.status.onChange(() => {
    if (luna.status.value === 'disconnected') status('Reconnecting to LUNA...', true);
  });
  await bindSession();
}

function wire() {
  renderNav();
  $('lesson-pick').onchange = () => go(Number($('lesson-pick').value));
  $('prev').onclick = () => go(state.lesson - 1);
  $('next').onclick = () => go(state.lesson + 1);
  $('banner-start').onclick = () => run('startSession');
  $('instrument-pick').onchange = () => {
    state.instrument = $('instrument-pick').value;
    save();
  };
  $('input-pick').onchange = () => {
    state.input = $('input-pick').value;
    save();
  };
  // Start over: the whole course again, in a new lesson session.
  $('reset').onclick = async () => {
    if (!(await ask('Start the course over?', 'Newb goes back to lesson 1 with nothing ticked. Press Start there for a fresh lesson session.', 'Start over'))) return;
    state.lesson = 0;
    state.progress = freshProgress();
    lessonSessionUid = null;
    if (world) world.lesson = false; // the last look at LUNA predates this: don't tick from it
    renderLesson();
    refresh();
  };
  wireQwerty();
  $('lesson').addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-show]');
    if (!a) return;
    e.preventDefault();
    pointAt(a.dataset.show, a);
  });
  // Text selection makes the page feel like a document, not a tool.
  document.addEventListener('selectstart', (e) => {
    if (!e.target.closest?.('#body, #deeper-body')) e.preventDefault();
  });
}

wire();
renderLesson();
connect();
