// Newb: the course. Chapters of lessons; each lesson has a short explanation, an optional
// "go deeper" section, and tasks. A task's `check(w, mem)` is a pure test of the world
// (AddOnLogic.snapshot) plus `mem`, the lesson's own memory for "did X, then Y" tasks.
// `show` names the "Show me" action main.js runs; `manual` tasks have an "I did it" button.
// `needs` lists what a lesson builds on (bass, groove, drums, voice); opening the lesson makes
// whatever is missing, so a fresh session or a jump ahead still has the tracks it talks about.
// <a data-show="name"> in any text makes LUNA show that thing (AddOnLogic.POINTERS): links
// never do a task for the learner, so a task's own target is not linked from its text.
//
// Only LUNA shortcuts the SDK documents are named here: Space (play/stop), Cmd+Z (undo),
// Shift+Cmd+Z (redo), Cmd+Space (record). Everything else is described, not keyed.

const bass = (w) => w.tracks.find((t) => t.name === 'Bass') ?? w.tracks.find((t) => t.type === 'instrument');
const drums = (w) => w.tracks.find((t) => t.name === 'Drums') ?? w.tracks.filter((t) => t.type === 'instrument')[1];
const voice = (w) => w.tracks.find((t) => t.name === 'Voice') ?? w.tracks.find((t) => t.type === 'audio');
const reverbBus = (w) => w.buses.find((b) => b.effects.some((n) => /reverb|plate|rvb|verb/i.test(n ?? '')));
/** Which of a lesson's needs the session is missing (main.js fills them in). */
const missing = (needs, w) => needs.filter((n) => {
  if (n === 'bass') return !bass(w)?.instrument;
  if (n === 'groove') return !((bass(w)?.clips ?? 0) > 0);
  if (n === 'drums') return !((drums(w)?.clips ?? 0) > 0);
  if (n === 'voice') return !voice(w)?.input;
  return false;
});
const isEq = (e) => /eq|channel/i.test(e.name ?? '');
const isComp = (e) => /comp|1176|la-2a|dynamics|limit/i.test(e.name ?? '');

const COURSE = [
  {
    chapter: 'DAW basics',
    lessons: [
      {
        id: 'what-is-a-daw',
        title: 'What is a DAW?',
        body: `
          <p>A <b>DAW</b> (digital audio workstation) is a recording studio inside your computer. In one
          place you can <b>record</b> sound, <b>write</b> music with virtual instruments, <b>arrange</b> it into a
          song, <b>mix</b> the parts so they sit well together, and <b>export</b> the result as a file.</p>
          <p>In LUNA a project is a <b>session</b>. It holds your tracks, recordings, MIDI, effects and
          settings. LUNA has two main pages:</p>
          <ul>
            <li><b>Timeline</b>: time runs left to right and each <b><a data-show="tracks">track</a></b> is a lane, top to bottom.
            This is where you record and arrange.</li>
            <li><b>Mixer</b>: each track is a <b>channel strip</b> with a volume fader, pan, mute,
            solo and effects. This is where you balance the sound.</li>
          </ul>
          <p>Newb works in its own lesson session, so nothing here touches your real music.</p>`,
        deeper: `
          <p>Before DAWs, studios recorded onto multitrack <b>tape</b>, mixed on a hardware <b>console</b>,
          and used racks of outboard gear for effects. A DAW models all three: tracks are the tape,
          the Mixer page is the console, and plugins are the rack. That is why so many DAW words
          (bus, insert, send, punch in, bounce) come from tape studios. LUNA leans into this more
          than most: it was designed to feel like a console and tape machine.</p>`,
        tasks: [
          { id: 'start', text: 'Start a lesson session.', check: (w) => w.lesson, show: 'startSession' },
          { id: 'mixer', text: 'Open the Mixer page (MIXER, at the top of LUNA\'s window).', check: (w, m) => (m.mixer ||= w.page === 'mixer'), show: 'pageMixer' },
          { id: 'timeline', text: 'Go back to the Timeline page.', check: (w, m) => !!m.mixer && w.page === 'timeline', show: 'pageTimeline' },
        ],
      },
      {
        id: 'time',
        title: 'Bars, beats and tempo',
        body: `
          <p>Music is counted in <b>beats</b>, grouped into <b>bars</b> (also called measures). Most pop,
          rock and jazz is in <b>4/4</b>: four beats to a bar. The <b>time signature</b> says how many.</p>
          <p><b>Tempo</b> is how fast the beats go, in <b>BPM</b> (beats per minute). At 120 BPM a beat lasts
          half a second; at 60 BPM, one second.</p>
          <p>The <a data-show="bars">ruler</a> along the top of the Timeline is marked in bars, and LUNA's counter shows where
          you are as <b>bar | beat | tick</b> (ticks divide a beat finely). Because a DAW knows the
          tempo, it can line things up to the beat, play a <b>click</b> (metronome) for you to keep
          time with, and snap edits to a <b><a data-show="grid">grid</a></b>.</p>`,
        deeper: `
          <p>Why count in bars instead of seconds? Because music is built from bars: a verse might be
          8 bars, a chorus 16. If you change the tempo, MIDI and beat-locked material stretch with
          it and still land on the beat, while a timestamp in seconds would drift. A tempo can also
          change during a song; LUNA keeps a <b>tempo map</b> for that.</p>`,
        tasks: [
          { id: 'tempo', text: 'Set the session tempo to 82 BPM, a laid-back reggae tempo for the groove you\'ll play with later (click the tempo in LUNA\'s transport bar and type 82).', check: (w) => Math.round(w.tempo ?? 0) === 82, show: 'tempo82' },
          { id: 'click', text: 'Turn on the click (the metronome button in the transport bar).', check: (w) => w.click === true, show: 'clickOn' },
        ],
      },
      {
        id: 'transport',
        title: 'The transport: play, stop, move, loop',
        body: `
          <p>The <b>transport</b> is the set of tape-machine controls: play, stop, record, and where you are.
          The <b><a data-show="playhead">playhead</a></b> is the line that moves across the Timeline while playing.</p>
          <ul>
            <li><b>Space</b> starts and stops playback.</li>
            <li>Click in the ruler to move the playhead somewhere else.</li>
            <li>A <b><a data-show="loop">loop</a></b> repeats a section over and over, which is handy for practising a part or
            tweaking a sound while it plays.</li>
          </ul>
          <p>With the click on, you'll hear the metronome counting the beats you set in the last lesson.</p>
          <p>Later lessons loop the groove over bars 1 to 4. If playback ever stops looping, the loop
          has probably moved: press <b>Again</b> on the loop step below to put it back.</p>`,
        tasks: [
          { id: 'play', text: 'Press Space to play.', check: (w, m) => (m.played ||= w.playing), show: 'play' },
          { id: 'stop', text: 'Press Space again to stop.', check: (w, m) => !!m.played && !w.playing, show: 'stop' },
          { id: 'bar5', text: 'Move the playhead to bar 5 (click the ruler at 5).', check: (w) => w.bar === 5, show: 'seek5' },
          { id: 'loop', text: 'Loop the first four bars (bar 1 up to bar 5) and turn the loop on.', check: (w) => w.looping && !!w.loopBars && w.loopBars[0] === 1 && w.loopBars[1] === 5, show: 'loop4' },
        ],
      },
    ],
  },
  {
    chapter: 'MIDI & instruments',
    lessons: [
      {
        id: 'instrument-track',
        title: 'Instrument tracks',
        body: `
          <p>A DAW has two main kinds of track:</p>
          <ul>
            <li><b>Audio tracks</b> hold recorded sound: a voice, a guitar, a drum loop.</li>
            <li><b>Instrument tracks</b> hold <b>MIDI</b> (notes) and an <b><a data-show="instrument-window">instrument plugin</a></b>, a piece of
            software that turns those notes into sound: a piano, a synth, a drum machine.</li>
          </ul>
          <p>A <b>plugin</b> is an add-on that runs inside the DAW. Instrument plugins make sound;
          effect plugins (later) change it. Pick an instrument below, or keep Apple's General MIDI
          synth, which is on every Mac.</p>`,
        widget: 'instrument',
        tasks: [
          { id: 'track', text: 'Add an instrument track (Show me names it "Bass").', check: (w) => w.tracks.some((t) => t.type === 'instrument'), show: 'bassTrack' },
          { id: 'instrument', text: 'Load an instrument onto it.', check: (w) => !!bass(w)?.instrument, show: 'loadInstrument' },
          { id: 'play-live', text: 'Play it: tick "Computer keys" below and press A, S, D, F... (W, E, T, Y, U for sharps).', check: (w, m) => !!m.qwerty, widget: 'qwerty' },
        ],
      },
      {
        id: 'midi',
        needs: ['bass', 'groove'],
        title: 'MIDI: notes, not sound',
        body: `
          <p><b>MIDI</b> doesn't contain sound. It's a list of instructions: <i>which note</i> (pitch),
          <i>when</i> it starts, <i>how long</i> it lasts, and <i>how hard</i> it's played (velocity). The
          instrument plugin reads the instructions and makes the sound.</p>
          <p>That's MIDI's superpower: change the instrument and the same notes play a new sound. Fix
          a wrong note without re-recording. Change the tempo and everything follows.</p>
          <p>Here you'll use a groove written for Newb in the style of 1980s <b>digital dancehall</b>, when
          reggae producers started building rhythms on cheap keyboards and drum machines: a busy
          <b>synth bass</b> pulsing in sixteenth notes over swung hi-hats, a snare on 2 and 4, and a
          pushing kick. Two bars long, looped over four.</p>
          <p>Notes live in a <b><a data-show="clip">clip</a></b> on the track. To see and edit them, open the clip in the
          <b>Clip Editor</b> (a "piano roll": pitch up the side, time along the bottom).</p>`,
        widget: 'instrument',
        tasks: [
          { id: 'groove', text: 'Newb has loaded a groove\'s bass line onto <a data-show="bass">Bass</a>: find its <a data-show="clip">clip</a> on the Timeline. (Missing? Show me puts it back.)', check: (w) => (bass(w)?.clips ?? 0) > 0, show: 'writeBassline' },
          { id: 'hear', text: 'Play it from bar 1.', check: (w, m) => (m.heard ||= w.playing && (bass(w)?.clips ?? 0) > 0), show: 'playFromStart' },
          { id: 'editor', text: 'Double-click the <a data-show="clip">clip</a> to open it in the Clip Editor. The two-bar line repeats twice: find the quick dip and the run of repeated notes on each beat (<a data-show="notes">select the first beat</a>).', manual: true },
          { id: 'swap', text: 'Pick a different instrument above and load it. Same notes, new sound: try a different synth.', check: (w, m) => { const i = bass(w)?.instrument; if (i && !m.first) m.first = i; return !!i && !!m.first && i !== m.first; }, show: 'swapInstrument' },
        ],
      },
      {
        id: 'velocity',
        needs: ['bass', 'groove'],
        title: 'Velocity, editing and undo',
        body: `
          <p><b>Velocity</b> (1 to 127) is how hard a note is struck. Most instruments get louder, and
          often brighter, as velocity goes up. Varying it is what makes MIDI sound played rather
          than typed.</p>
          <p>In the Clip Editor you can drag <a data-show="notes">notes</a> to new pitches or times, stretch them longer or
          shorter, and <b>quantize</b> them (snap them to the beat grid). Nothing is permanent: every
          edit can be undone.</p>`,
        tasks: [
          { id: 'softer', text: 'Make the bass line softer (lower its velocity).', check: (w, m) => { const v = bass(w)?.velocity; if (v && v < 80) m.soft = true; return !!v && v < 80; }, show: 'softer' },
          { id: 'undo', text: 'Undo that with Cmd+Z (the bass gets loud again)...', check: (w, m) => { const v = bass(w)?.velocity; if (m.soft && v >= 90) m.undone = true; return !!m.undone; } },
          { id: 'redo', text: '...and redo it with Shift+Cmd+Z.', check: (w, m) => !!m.undone && (bass(w)?.velocity ?? 127) < 80 },
        ],
      },
    ],
  },
  {
    chapter: 'Mixing & effects',
    lessons: [
      {
        id: 'channel-strip',
        needs: ['bass', 'groove'],
        title: 'The channel strip: faders, pan, mute, solo',
        body: `
          <p><b>Mixing</b> is balancing the parts so everything can be heard. On the Mixer page, each
          track is a <b><a data-show="strip">channel strip</a></b>:</p>
          <ul>
            <li>The <b>fader</b> sets the level, in <b>decibels (dB)</b>. 0 dB leaves it unchanged; lower
            is quieter. About -6 dB halves the signal; about -10 dB sounds roughly half as loud.</li>
            <li><b>Pan</b> places it from left to right in the stereo picture. A stereo track has two pan
            knobs, one for each side, which start fully left and fully right. Turn both toward one
            side to move the whole track that way.</li>
            <li><b>Mute</b> silences the track; <b>solo</b> plays it alone so you can focus on it.</li>
          </ul>
          <p>Every track flows into the <b><a data-show="main-bus">main bus</a></b> (the master fader), and from there to your speakers.
          If the main meter goes red, it's <b>clipping</b>: too loud, and it will distort. Turn things
          down rather than up.</p>`,
        deeper: `
          <p>Decibels are a ratio, not an amount: every -6 dB halves the signal's amplitude, so -12 dB
          is a quarter. Our ears judge loudness differently, which is why -10 dB is the usual
          rule of thumb for "half as loud". <b>Gain staging</b> means keeping healthy levels at every
          step, with peaks well below 0 dB on each track, so the main bus has <b>headroom</b>.</p>`,
        tasks: [
          { id: 'drums', text: 'Add the drums (hi-hats, snare and kick), so there\'s something to balance.', check: (w) => w.tracks.filter((t) => t.type === 'instrument' && t.clips > 0).length >= 2, show: 'addDrums' },
          { id: 'mixer', text: 'Open the Mixer page.', check: (w, m) => (m.mixer ||= w.page === 'mixer'), show: 'pageMixer' },
          { id: 'fader', text: 'Pull the <a data-show="drums">Drums</a> fader down to about -6 dB.', check: (w) => { const g = drums(w)?.gainDb; return g !== undefined && g <= -4 && g >= -9; }, show: 'fader' },
          { id: 'pan', text: 'Pan the <a data-show="drums">Drums</a> a little left, hear them move, then pan them back to where they were. (Bass and kick usually stay in the middle.)', check: (w, m) => { const p = drums(w)?.pan; if (p === undefined) return false; m.start ??= p; if (p < m.start - 0.08) m.moved = true; return !!m.moved && Math.abs(p - m.start) < 0.03; }, show: 'pan' },
          { id: 'solo', text: 'Solo the <a data-show="bass">Bass</a> to hear it alone, then un-solo it.', check: (w, m) => { if (bass(w)?.soloed) m.soloed = true; return !!m.soloed && !bass(w)?.soloed; }, show: 'solo' },
        ],
      },
      {
        id: 'effects',
        needs: ['bass', 'groove', 'drums'],
        title: 'Effects and inserts',
        body: `
          <p><b>Effect plugins</b> change the sound passing through a track. They sit in the track's
          <b><a data-show="strip">insert</a></b> slots and work in order, top to bottom:</p>
          <div class="flow"><span>Instrument or input</span>→<span>Insert 1</span>→<span>Insert 2</span>→<span>Fader &amp; pan</span>→<span>Main bus</span></div>
          <ul>
            <li><b>EQ</b> (equalizer) shapes tone: cut muddy lows, tame harsh mids, add air on top.</li>
            <li>A <b><a data-show="comp-window">compressor</a></b> evens out loud and quiet moments so a part sits steadily in the mix.</li>
            <li><b>Reverb</b> adds space, and <b>delay</b> adds echoes (next lesson).</li>
          </ul>
          <p><b>Bypassing</b> an effect switches it off without removing it, which is how you compare
          before and after (an "A/B").</p>`,
        tasks: [
          { id: 'eq', text: 'Add an EQ to <a data-show="bass">Bass</a>.', check: (w) => (bass(w)?.effects ?? []).some(isEq), show: 'addEq' },
          { id: 'open', text: 'Open the EQ\'s window to see its controls.', check: (w) => (bass(w)?.effects ?? []).some((e) => e.open), show: 'openEq' },
          { id: 'ab', text: 'Bypass the EQ, then turn it back on, listening for the difference.', check: (w, m) => { const fx = bass(w)?.effects ?? []; if (fx.some((e) => !e.in)) m.bypassed = true; return !!m.bypassed && fx.length > 0 && fx.every((e) => e.in); }, show: 'bypassEq' },
          { id: 'comp', text: 'Add a compressor to the <a data-show="drums">Drums</a>.', check: (w) => (drums(w)?.effects ?? []).some(isComp), show: 'addComp' },
        ],
      },
      {
        id: 'sends',
        needs: ['bass', 'groove', 'drums'],
        title: 'Sends and buses',
        body: `
          <p>Rather than putting a reverb on every track, mixers usually put <b>one</b> reverb on a
          <b>bus</b> (a channel with no recording of its own) and <b>send</b> a little of each track to it.
          All the parts then share the same "room", and the mix stays clear.</p>
          <div class="flow"><span><a data-show="drums">Drums</a></span>→<span><a data-show="drums">Send</a></span>→<span><a data-show="reverb-bus">Reverb bus</a></span>→<span><a data-show="main-bus">Main bus</a></span></div>
          <p>The send level sets how much of the track goes to the reverb. The track still plays
          normally (<b>dry</b>); the <a data-show="reverb-window">reverb bus</a> adds the <b>wet</b> echo of the room. Buses are also
          used to group tracks, like all the drums onto one fader.</p>
          <p>Reggae and dub producers made an art of this, throwing snares and hi-hats into reverb
          and echo to make the space part of the music.</p>`,
        tasks: [
          { id: 'bus', text: 'Create a "Reverb" bus with a reverb plugin on it.', check: (w) => !!reverbBus(w), show: 'reverbBus' },
          { id: 'send', text: 'Send the Drums to the Reverb bus.', check: (w) => { const b = reverbBus(w); return !!b && drums(w)?.sendBus === b.id; }, show: 'reverbBus' },
          { id: 'level', text: 'Set the send to around -10 dB, and play to hear the space.', check: (w, m) => { const d = drums(w)?.sendDb; return d !== null && d !== undefined && d > -20 && (m.heard ||= w.playing); }, show: 'sendLevel' },
        ],
      },
    ],
  },
  {
    chapter: 'Recording & export',
    lessons: [
      {
        id: 'record-setup',
        needs: ['bass', 'groove', 'drums'],
        title: 'Getting ready to record audio',
        body: `
          <p>To record a voice or guitar, the sound goes through an <b>audio interface</b> (or your Mac's
          built-in mic), which turns it into numbers:</p>
          <ul>
            <li><b>Sample rate</b>: how many snapshots per second (48 kHz is 48,000).</li>
            <li><b>Bit depth</b>: how finely each snapshot is measured (24-bit is standard).</li>
            <li><b>Buffer size</b>: how much audio the computer handles at once. Smaller means less
            <b>latency</b> (delay) while you record; larger is easier on the computer.</li>
          </ul>
          <p>Then choose the track's <b>input</b> (which mic), <b>arm</b> it (record-enable, the red button),
          and check your <b>level</b>: peaks around -12 to -6 dB, never in the red. Use <b>headphones</b>
          if you monitor yourself, or the speakers will feed back into the mic.</p>`,
        widget: 'input',
        tasks: [
          { id: 'track', text: 'Add a mono audio track (Show me names it "Voice").', check: (w) => w.tracks.some((t) => t.type === 'audio'), show: 'voiceTrack' },
          { id: 'input', text: 'Choose your microphone as its input (pick one below).', check: (w) => !!voice(w)?.input, show: 'setInput' },
          { id: 'arm', text: 'Arm the track (its red record-enable button).', check: (w) => !!voice(w)?.armed, show: 'arm' },
          { id: 'countin', text: 'Turn on the count-in, so LUNA counts you in before recording.', check: (w) => w.countIn, show: 'countIn' },
        ],
      },
      {
        id: 'record',
        needs: ['bass', 'groove', 'drums', 'voice'],
        title: 'Record a take',
        body: `
          <p>Press record (<b>Cmd+Space</b> in LUNA), wait for the count-in, perform, then stop. What you
          recorded appears as a new audio clip, called a <b><a data-show="take">take</a></b>. Not happy? Record another: DAWs keep
          your takes so you can pick the best one, or <b>comp</b> (combine) the best bits of several.</p>
          <p><b>Punching in</b> means re-recording just a short section, like one wrong line, while the
          rest plays back. MIDI records the same way: arm an instrument track and play a keyboard.</p>`,
        widget: 'record',
        tasks: [
          { id: 'take', text: 'Record 4 bars over the groove: sing, talk, clap, or "toast" (reggae\'s word for rapping over a rhythm). Show me asks first, then records.', check: (w) => (voice(w)?.clips ?? 0) > 0, show: 'recordTake' },
          { id: 'listen', text: 'Disarm the <a data-show="voice">Voice</a> track, then play your <a data-show="take">take</a> back.', check: (w, m) => (m.heard ||= !voice(w)?.armed && w.playing && (voice(w)?.clips ?? 0) > 0), show: 'listenTake' },
          { id: 'midi', text: 'Bonus: arm Bass, press Cmd+Space, and record your own bass line on the computer keys.', manual: true },
        ],
      },
      {
        id: 'automation',
        needs: ['bass', 'groove', 'drums'],
        title: 'Automation',
        body: `
          <p><b>Automation</b> is a control moving by itself over time: a fade-in, a swell before the
          chorus, a pan sweeping across, an effect turning up for one line. You draw it as a <a data-show="automation">line</a>
          of points, or record your own fader moves.</p>
          <p>Each track has an <b>automation mode</b>: <b>Off</b> ignores it, <b>Read</b> plays it back, and
          <b>Write</b>, <b>Touch</b> and <b>Latch</b> record your moves in slightly different ways.</p>`,
        tasks: [
          { id: 'fade', text: 'Draw a 4-bar fade-in on the <a data-show="bass">Bass</a> volume.', check: (w) => (bass(w)?.automation ?? 0) >= 2, show: 'fadeIn' },
          { id: 'read', text: 'With Bass in Read mode, play from bar 1 and watch its fader move by itself.', check: (w, m) => bass(w)?.automationMode === 'read' && (m.heard ||= w.playing), show: 'playFromStart' },
        ],
      },
      {
        id: 'export',
        needs: ['bass', 'groove', 'drums'],
        title: 'Export your mix',
        body: `
          <p><b>Exporting</b> (or <b>bouncing</b>) renders everything coming out of the <a data-show="main-bus">main bus</a> into one
          stereo audio file you can share, upload or put on your phone. What you hear is what you
          get, so check the main meter stays out of the red first.</p>
          <p>Producers also export <b>stems</b>: each track, or group of tracks, as its own file, for
          mixing elsewhere or for remixes.</p>`,
        widget: 'export',
        tasks: [
          { id: 'export', text: 'Export the mix.', check: (w) => !!w.exported, show: 'export' },
          { id: 'finder', text: 'Show the file in Finder.', check: (w) => !!w.revealed, show: 'reveal' },
        ],
      },
      {
        id: 'glossary',
        title: 'Glossary, and what next',
        body: `
          <p>That's the whole workflow: write or record, arrange, mix, add effects, automate, export.
          Keep this lesson session to experiment in, or start a new one and make something.</p>
          <dl class="glossary">
            <dt>Arm</dt><dd>Record-enable a track so it records when you press record.</dd>
            <dt>Automation</dt><dd>A control changing over time, drawn or recorded.</dd>
            <dt>Bounce / export</dt><dd>Render audio to a file.</dd>
            <dt>BPM</dt><dd>Beats per minute: the tempo.</dd>
            <dt>Bus</dt><dd>A channel that other tracks feed into: for effects, groups, or the main mix.</dd>
            <dt>Clip</dt><dd>A block of audio or MIDI on a track.</dd>
            <dt>Clipping</dt><dd>A level so high it distorts. Red meters.</dd>
            <dt>Comp (takes)</dt><dd>Combine the best parts of several takes.</dd>
            <dt>Count-in</dt><dd>Clicks before recording starts.</dd>
            <dt>dB</dt><dd>Decibels: how level is measured. 0 dB on a fader means unchanged.</dd>
            <dt>Dry / wet</dt><dd>The original sound / the effect's sound.</dd>
            <dt>EQ</dt><dd>Equalizer: boosts or cuts ranges of frequencies to shape tone.</dd>
            <dt>Headroom</dt><dd>Space between your loudest peaks and clipping.</dd>
            <dt>Insert</dt><dd>An effect slot in a track's signal path.</dd>
            <dt>Latency</dt><dd>The delay between playing and hearing, set by buffer size.</dd>
            <dt>MIDI</dt><dd>Note instructions (pitch, timing, velocity), not sound.</dd>
            <dt>Pan</dt><dd>Position from left to right.</dd>
            <dt>Playhead</dt><dd>The line showing where playback is.</dd>
            <dt>Plugin</dt><dd>An instrument or effect that runs inside the DAW.</dd>
            <dt>Punch in</dt><dd>Re-record a short section while the rest plays.</dd>
            <dt>Quantize</dt><dd>Snap notes to the beat grid.</dd>
            <dt>Sample rate</dt><dd>Audio snapshots per second (e.g. 48 kHz).</dd>
            <dt>Send</dt><dd>A copy of a track's signal routed to a bus.</dd>
            <dt>Session</dt><dd>A LUNA project.</dd>
            <dt>Solo / mute</dt><dd>Play only this track / silence this track.</dd>
            <dt>Stem</dt><dd>One track or group exported on its own.</dd>
            <dt>Take</dt><dd>One recorded attempt.</dd>
            <dt>Velocity</dt><dd>How hard a MIDI note is played (1 to 127).</dd>
          </dl>`,
        tasks: [],
      },
    ],
  },
];

/** Every lesson in order, with its chapter name and a global number. */
const LESSONS = COURSE.flatMap((c) => c.lessons.map((l) => ({ ...l, chapter: c.chapter })));

globalThis.COURSE = COURSE;
globalThis.LESSONS = LESSONS;
globalThis.LessonHelpers = { bass, drums, voice, reverbBus, isEq, isComp, missing };
