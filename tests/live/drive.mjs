// End-to-end drive of the real page against a running LUNA: `ua-builder serve`, then
//   ua-builder probe http://localhost:8790/ --timeout 300000 --expr "import('./tests/live/drive.mjs').then(m => m.drive()).then(JSON.stringify)"
// For every lesson it does what a learner would (mostly the Show me action), then waits for
// the task to tick itself off from what LUNA reports. Confirm dialogs are answered yes. It
// creates a "Newb Lesson" session (saving the open one), and records 4 bars unless
// { record: false }. Returns one line per task.
export async function drive({ record = true } = {}) {
  ask = async () => true; // eslint-disable-line no-global-assign
  const log = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (pred, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      refresh();
      if (pred()) return true;
      await sleep(300);
    }
    return pred();
  };
  const key = (l, t) => `${l.id}:${t.id}`;
  state.progress = freshProgress();
  state.lesson = 0;
  lessonSessionUid = null;
  for (let i = 0; i < LESSONS.length; i++) {
    go(i);
    const l = LESSONS[i];
    for (const t of l.tasks) {
      const started = Date.now();
      let note = '';
      try {
        if (t.manual) {
          prog().done[key(l, t)] = true;
          note = 'manual';
        } else if (t.id === 'play-live') {
          $('qwerty').checked = true;
          for (const k of ['a', 'd', 'g']) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
            await sleep(250);
            document.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
          }
        } else if (l.id === 'velocity' && t.id === 'undo') await session.undo();
        else if (l.id === 'velocity' && t.id === 'redo') await session.redo();
        else if (t.show === 'recordTake' && !record) note = 'skipped';
        else await ACTIONS[t.show]();
      } catch (e) {
        note = `action failed: ${e.message ?? e}`;
      }
      const ok = note === 'skipped' ? false : await until(() => !!prog().done[key(l, t)] || (t.show === 'startSession' && !!world?.lesson && evaluate() === undefined && !!prog().done[key(l, t)]), 20000);
      if (session?.transport.playing.value) await session.transport.stop();
      log.push(`${ok ? 'ok  ' : 'FAIL'} ${l.id}:${t.id} (${((Date.now() - started) / 1000).toFixed(1)}s)${note ? ` ${note}` : ''}`);
    }
  }
  return log;
}
