import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HidHide, findCli, instancePath, parseState, planHiding } from '../src/main/hidhide.js';

const T16000M = 'HID\\VID_044F&PID_B10A\\7&2A2D0F4E&0&0000';
const TWCS = 'HID\\VID_044F&PID_B687\\8&1B3C5D7E&0&0000';
const OTHER = 'HID\\VID_054C&PID_09CC&MI_03\\9&ABCDEF&0&0000';
const APP = 'C:\\Program Files\\Joystick Mapper\\Joystick Mapper.exe';
const CLI = 'C:\\Program Files\\Nefarius Software Solutions\\HidHide\\x64\\HidHideCLI.exe';

// A stand-in for HidHide's command-line tool: answers from `state` and records each call.
function fakeTool(state = {}) {
  const calls = [];
  const tool = { calls, state: { cloak: true, inverse: false, hidden: [], code: 0, err: '', ...state } };
  tool.run = async (cli, args) => {
    calls.push(args);
    if (tool.state.code !== 0 || tool.state.err) return { code: tool.state.code, out: '', err: tool.state.err };
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--dev-hide') tool.state.hidden.push(args[++i]);
      else if (args[i] === '--dev-unhide') tool.state.hidden = tool.state.hidden.filter((d) => d !== args[i + 1]);
      else if (args[i] === '--cloak-on') tool.state.cloak = true;
    }
    const out = args.includes('--dev-list')
      ? [tool.state.cloak ? '--cloak-on' : '--cloak-off', tool.state.inverse ? '--inv-on' : '--inv-off', ...tool.state.hidden.map((d) => `--dev-hide "${d}"`)].join('\r\n')
      : '';
    return { code: 0, out, err: '' };
  };
  tool.hider = new HidHide({ locate: () => CLI, run: tool.run });
  return tool;
}

test('a joystick is known to HidHide by the path it is opened from', () => {
  assert.equal(instancePath('\\\\?\\HID#VID_044F&PID_B10A#7&2a2d0f4e&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}'), T16000M);
  // One collection of several, and a Bluetooth controller, whose name holds a GUID of its own.
  assert.equal(
    instancePath('\\\\?\\hid#vid_10f5&pid_7055&mi_00&col01#8&1c2d3e4f&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}'),
    'HID\\VID_10F5&PID_7055&MI_00&COL01\\8&1C2D3E4F&0&0000',
  );
  assert.equal(
    instancePath('\\\\?\\HID#{00001124-0000-1000-8000-00805f9b34fb}_VID&0002054c_PID&09cc#9&2f0a1b2c&0&0000#{4d1e55b2-f16f-11cf-88cb-001111000030}'),
    'HID\\{00001124-0000-1000-8000-00805F9B34FB}_VID&0002054C_PID&09CC\\9&2F0A1B2C&0&0000',
  );
  // Nothing to hide for an Xbox controller read through XInput, or off Windows.
  for (const path of ['xinput:0', '/dev/hidraw3', '', null, undefined]) assert.equal(instancePath(path), null);
});

test('HidHide’s tool is found under either folder its versions have used, or where its installer says', () => {
  const env = { ProgramFiles: 'C:\\Program Files' };
  const flat = 'C:\\Program Files\\Nefarius Software Solutions\\HidHide\\HidHideCLI.exe';
  assert.equal(findCli({ env, exists: (file) => file === CLI, registry: () => null }), CLI);
  assert.equal(findCli({ env, exists: (file) => file === flat, registry: () => null }), flat);
  assert.equal(findCli({ env, exists: (file) => file === 'D:\\Tools\\HidHide\\x64\\HidHideCLI.exe', registry: () => 'D:\\Tools\\HidHide' }), 'D:\\Tools\\HidHide\\x64\\HidHideCLI.exe');
  assert.equal(findCli({ env, exists: () => false, registry: () => null }), null);
});

test('what HidHide says of itself is read from its tool', async () => {
  assert.deepEqual(parseState(`--cloak-on\r\n--inv-off\r\n--dev-hide "${T16000M}"\r\n--dev-hide "${OTHER}"\r\n`), {
    cloak: true,
    inverse: false,
    hidden: [T16000M, OTHER],
  });
  assert.deepEqual(parseState('--cloak-off\n--inv-on\n'), { cloak: false, inverse: true, hidden: [] });

  const tool = fakeTool({ hidden: [OTHER] });
  assert.deepEqual(await tool.hider.read(), { state: 'ready', cloak: true, inverse: false, hidden: [OTHER] });
  assert.deepEqual(tool.calls, [['--cloak-state', '--inv-state', '--dev-list']]);

  // Not installed at all.
  assert.deepEqual(await new HidHide({ locate: () => null, run: tool.run }).read(), { state: 'missing' });
  assert.deepEqual(await new HidHide({ locate: () => CLI, run: async () => ({ code: null, out: '', err: '' }) }).read(), { state: 'missing' });
  // Installed, but its driver isn't answering: Windows hasn't restarted since.
  tool.state.code = 2;
  tool.state.err = 'The system cannot find the file specified.';
  assert.deepEqual(await tool.hider.read(), { state: 'restart', detail: 'The system cannot find the file specified.' });
  // Its own settings window has it to itself.
  tool.state.code = 5;
  assert.equal((await tool.hider.read()).state, 'busy');
  // The tool exits cleanly even when all it printed was a complaint.
  tool.state.code = 0;
  tool.state.err = 'Syntax error';
  assert.equal((await tool.hider.read()).state, 'restart');
});

test('hiding lets this app through, hides the joysticks and switches hiding on, in one call', async () => {
  const tool = fakeTool({ cloak: false });
  const state = await tool.hider.read();
  assert.equal(await tool.hider.hide(state, APP, [T16000M, TWCS]), true);
  assert.deepEqual(tool.calls.at(-1), ['--app-reg', APP, '--dev-hide', T16000M, '--dev-hide', TWCS, '--cloak-on']);
  assert.deepEqual((await tool.hider.read()).hidden, [T16000M, TWCS]);
  assert.equal((await tool.hider.read()).cloak, true);

  // With HidHide's program list turned round, being on it is what would shut the app out.
  const inverted = fakeTool({ inverse: true });
  await inverted.hider.hide(await inverted.hider.read(), APP, [T16000M]);
  assert.deepEqual(inverted.calls.at(-1), ['--app-unreg', APP, '--dev-hide', T16000M, '--cloak-on']);

  // A complaint from the tool means it wasn't done.
  tool.state.err = 'Access is denied.';
  assert.equal(await tool.hider.hide(state, APP, [T16000M]), false);
});

test('showing joysticks again takes only those off the list, and leaves hiding switched on', async () => {
  const tool = fakeTool({ hidden: [OTHER, T16000M, TWCS] });
  assert.equal(await tool.hider.unhide([T16000M, TWCS]), true);
  assert.deepEqual(tool.calls, [['--dev-unhide', T16000M, '--dev-unhide', TWCS]]);
  assert.deepEqual(await tool.hider.read(), { state: 'ready', cloak: true, inverse: false, hidden: [OTHER] });
  // Nothing to show: the tool isn't run at all.
  const calls = tool.calls.length;
  assert.equal(await tool.hider.unhide([]), true);
  assert.equal(tool.calls.length, calls);

  // The same when the app is closing, without waiting on a promise.
  const ran = [];
  const closing = new HidHide({
    locate: () => CLI,
    runSync: (cli, args, options) => {
      ran.push([cli, args, options.stdio[0]]);
      return { status: 0, stderr: Buffer.alloc(0) };
    },
  });
  assert.equal(closing.unhideSync([T16000M]), true);
  // The tool's input must not be a pipe: it would wait on it for more commands.
  assert.deepEqual(ran, [[CLI, ['--dev-unhide', T16000M], 'ignore']]);
  assert.equal(new HidHide({ locate: () => CLI, runSync: () => ({ status: 5, stderr: Buffer.from('Access is denied.') }) }).unhideSync([T16000M]), false);
  assert.equal(new HidHide({ locate: () => null }).unhideSync([T16000M]), false);
  assert.equal(new HidHide({ locate: () => null }).unhideSync([]), true);
});

test('only what this app hid is ever shown again', () => {
  // Emulation starts: both joysticks are hidden, and are ours to show again.
  assert.deepEqual(planHiding({ wanted: [T16000M, TWCS], ours: [], hidden: [OTHER] }), { add: [T16000M, TWCS], drop: [], ours: [T16000M, TWCS] });
  // Nothing changed: nothing to do.
  assert.deepEqual(planHiding({ wanted: [T16000M, TWCS], ours: [T16000M, TWCS], hidden: [OTHER, T16000M, TWCS] }), {
    add: [],
    drop: [],
    ours: [T16000M, TWCS],
  });
  // Emulation stops, or the app is back after a crash: ours are shown, the user's own entry stays.
  assert.deepEqual(planHiding({ wanted: [], ours: [T16000M, TWCS], hidden: [OTHER, T16000M, TWCS] }), { add: [], drop: [T16000M, TWCS], ours: [] });
  // The throttle is unplugged mid-flight: it alone is shown again.
  assert.deepEqual(planHiding({ wanted: [T16000M], ours: [T16000M, TWCS], hidden: [T16000M, TWCS] }), { add: [], drop: [TWCS], ours: [T16000M] });
  // A joystick the user had already hidden themselves is left as theirs: never ours to show.
  assert.deepEqual(planHiding({ wanted: [T16000M, TWCS], ours: [], hidden: [T16000M.toLowerCase()] }), { add: [TWCS], drop: [], ours: [TWCS] });
  assert.deepEqual(planHiding({ wanted: [], ours: [TWCS], hidden: [T16000M.toLowerCase(), TWCS] }), { add: [], drop: [TWCS], ours: [] });
  // One of ours that someone took off HidHide's list is hidden again while it is wanted.
  assert.deepEqual(planHiding({ wanted: [T16000M], ours: [T16000M], hidden: [] }), { add: [T16000M], drop: [], ours: [T16000M] });
});
