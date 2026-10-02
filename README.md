# Joystick Mapper

**Why this exists: Ace Combat 8 is a flight game that doesn't support flight sticks.** 🙃

So this app makes your flight stick show up to games as an Xbox 360 controller.
Map the stick once and fly with it in any game that only understands gamepads.

## How to install
Click Releases on the right side —> click and download the .exe for the latest release

![Photo layout: the Logitech Extreme 3D Pro with the Ace Combat 8 profile loaded](docs/screenshot.png)
<sub>Logitech Extreme 3D Pro</sub>

![Photo layout: the VKB Gladiator NXT EVO with an Ace Combat 8 profile loaded](docs/screenshot-gladiator.png)
<sub>**VKB Gladiator NXT EVO** (beta)</sub>

![Universal layout: any other stick, built from what the stick reports](docs/screenshot-generic.png)
<sub>Every other stick gets the universal layout.</sub>


## Supported joysticks

| Support | Joysticks |
| --- | --- |
| **Fully supported** | Logitech Extreme 3D Pro: tested, with a photo layout and named controls |
| **Beta** | VKB Gladiator NXT EVO (right hand): photo layout and named controls, still being confirmed by owners |
| **Experimental** | Any other USB flight stick, throttle or pedals on Windows |

Experimental sticks are detected automatically.

Beta sticks have a photo layout whose labels haven't all been checked on the real stick
yet. If a line points at the wrong control, please say so in an issue.

**Want your stick supported?** Click its name in the top bar, **Copy device info**, and
paste it into a
[Joystick support issue](https://github.com/Alphonsvds/joystick-mapper/issues/new?template=joystick-support.yml).
Step by step: [Getting your joystick supported](docs/joystick-support.md).

## HOTAS: stick, throttle and pedals together

Plug in more than one device and they all work at once, as a single Xbox controller.
The joystick button in the top bar gains an arrow: click it to pick which device you're
mapping. Each one gets a role (**Stick**, **Throttle**, **Pedals** or **Extra**), guessed
from its name; change it in the same menu if the guess is wrong. One profile holds the
mapping for all of them, and unplugging a device only switches off its own controls.

## Download

**[Download the latest installer](https://github.com/Alphonsvds/joystick-mapper/releases/latest)**:
`Joystick-Mapper-Setup-x.y.z.exe`. 

> Windows may show **"Windows protected your PC"** because the installer isn't code-signed
> (signing certificates cost money). Click **More info → Run anyway**.

## Using it

- **Profiles.** **Default** is built in and can't be changed. It leaves your joystick
  completely alone and creates no virtual controller, so games that support the stick
  natively (e.g. Microsoft Flight Simulator) behave exactly as if this app weren't
  running. Create a profile per game (**Profile ▾ → New profile**). **Ace Combat 8** is
  available as a starting point that matches the game's default gamepad layout.
- **Mapping.** Hover a label or hotspot to highlight its line. Click **NOT MAPPED** to
  pick an Xbox input. Axes also have **INV** (invert) and a **DZ** button with two sliders.
- **Deadzone and anti-deadzone.** **Deadzone** ignores small movement, for an axis that
  drifts. **Anti-deadzone** starts the output at a set level the moment the axis moves, to
  cancel a deadzone the game applies itself. Off until you set it.
- **AC8 controls.** Opens Ace Combat 8's own gamepad layout in a separate window (e.g.
  "Fire missile → B"), so you can decide where each action goes on the stick.
- **Save.** Changes apply live so you can test right away. **Save** (or Ctrl+S) keeps them.
- **Export / Import.** Profiles are small `.joymap.json` files you can share or back up.
- **Xbox emulation switch.** Pauses the virtual controller without leaving your profile.
- **Recenter.** Let go of the stick and click it if the plane drifts. The app also
  calibrates automatically the first time it sees the stick at rest.
- **Throttle vs centred axes.** Each axis's dropdown has **Springs back to centre**. Leave it
  on for sticks, twists and pedals, and turn it off for throttles and sliders. Experimental
  sticks get a best guess from Windows' description.
- **Updates.** **Update available** appears bottom-left when a newer release is out. Click
  it to download and install; Windows asks for permission and the app restarts. Profiles
  and calibration carry over. The app checks GitHub's public release list when it starts.

Handy axis options for flying: **Throttle → LT / RT Split** (pull back = brake, push
forward = boost) and **Yaw → LB / RB Split** (twist = rudder on the bumpers).

## Good to know

- **The app has to be running while you play.** It translates the stick live; closing it
  unplugs the virtual controller. Minimising is fine.
- **Unplug (or turn off) other controllers** while flying with the stick. Many games only
  listen to player 1, and a real gamepad plugged in first takes that slot.
- **Games still see the physical joystick too.** Games without joystick support ignore it.
  If one reacts to both, hiding the stick with HidHide is on the v2 list.
- **A "pick an app to open this ms-gamebar link" popup?** Windows calls Xbox Game Bar
  whenever an Xbox controller (including the virtual one) connects. If Game Bar has been
  uninstalled, Windows asks what should open it instead. Reinstall **Xbox Game Bar** from the
  Microsoft Store, then turn off **Settings → Gaming → Xbox Game Bar → "Open Xbox Game Bar
  using this button on a controller"** or just leave it alone if it doesn’t bother you.
- Your settings live in `%APPDATA%\Joystick Mapper\` (`profiles.json`, and `devices.json`
  for each device's calibration and role).
- Profiles use each stick's own button numbers (on nearly every flight stick, button 1 is
  the trigger), so a profile mostly carries over if you switch sticks. With a HOTAS, a
  profile maps by role, so it carries over to a different throttle or pedals the same way.
- Uninstalling the app leaves the ViGEmBus driver in place (other tools use it too). Remove
  it from **Settings → Apps** if you want.

**Check that Windows sees the virtual pad:** with a game profile active, press Win+R, run
`joy.cpl` and look for **Controller (XBOX 360 For Windows)**.

## How it works

```
Flight stick ──raw HID──▶ Electron main process ──mapping──▶ ViGEmBus ──▶ "Xbox 360 controller"
                         (keeps running while the                         (what the game sees)
                          game has focus)
                                  │
                                  └──live state──▶ the mapper screen
```

- **Input** is read straight from the stick over HID (`node-hid`), so it works in the
  background while the game is focused. Each report is decoded by **Windows' own HID
  parser** (`hid.dll`) from the stick's self-description, so any stick works without
  per-model code.
- **Output** is a virtual Xbox 360 pad created by the free
  [ViGEmBus](https://github.com/nefarius/ViGEmBus) driver (the one DS4Windows uses). The
  app talks to the driver directly through `koffi`, so no C++ build tools are needed.
- The UI is plain HTML/CSS/SVG inside Electron. There's no build step for the app itself.

## Development

Requires Node.js 22+ (`winget install OpenJS.NodeJS.LTS`) and, to emulate, ViGEmBus
(`winget install ViGEm.ViGEmBus`).

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

**Build the installer locally.** This downloads the official ViGEmBus installer
(checksum-pinned) and writes `dist/Joystick-Mapper-Setup-<version>.exe`:

```bash
npm run dist
```

**Publish a release.** Bump `version` in `package.json`, commit, then push a tag. GitHub
Actions (`.github/workflows/release.yml`) builds the installer and attaches it to the release:

```bash
git tag v0.1.0
```

```bash
git push origin main --tags
```

**Preview the UI without hardware.** Serve `src/` with any static server and open
`/renderer/index.html`; the keyboard simulates the stick (WASD pitch/roll, Q/E twist,
R/F throttle, arrows = hat, Space = trigger, 3–0 = buttons). It simulates an Extreme 3D Pro,
a VKB Gladiator NXT EVO (add `?device=gladiator`) and a Thrustmaster T.16000M
(`?device=t16000m`, the universal layout). `?device=hotas` plugs in a stick, a throttle
and pedals together; the keyboard drives whichever one is on screen.

**Test the universal layout with a supported stick.** Set `JOYMAP_GENERIC=1` before
`npm start` to show even the Extreme 3D Pro with the generic screen.

**See the update button.** `JOYMAP_VERSION=0.1.0` makes the app think it's that version; in
the browser preview, add `?update=9.9.9`. `JOYMAP_UPDATE_FEED=<url>` points the installed
app's updater at a served `dist/` folder instead of GitHub.

macOS: only the Extreme 3D Pro is read (Windows' HID parser isn't available), and the
virtual Xbox controller needs ViGEmBus, which is Windows-only.

## Project layout

```
src/main/main.js                 Electron main: window, profiles, IPC, wiring
src/main/joystick.js             Finds and reads every joystick plugged in, reconnects on unplug
src/main/hidp.js                 Windows' HID parser: reads any stick from its self-description
src/main/devices/extreme3dpro.js Hand-written Extreme 3D Pro reader (macOS / Linux fallback)
src/shared/devices.js            Stick layout → controls (axes, hats, buttons), skins, calibration, HOTAS roles
src/main/vigem.js                Virtual Xbox 360 controller via ViGEmBus
src/main/store.js                JSON persistence
src/main/preload.cjs             The UI's only bridge to the main process
src/shared/controls.js           Control IDs, Xbox targets, binding rules
src/shared/profiles.js           Profile library (Default + game profiles, export format)
src/shared/presets.js            Starting points for new profiles (Ace Combat 8, …)
src/shared/games.js              Each game's own gamepad controls (the controls window)
src/shared/mapper.js             Pure mapping engine (joystick state → XUSB report)
src/renderer/                    The single screen (layout.js: photo skins, generic.js: universal)
build/                           Installer resources (icon, NSIS driver step)
scripts/fetch-vigembus.mjs       Fetches + verifies the bundled driver installer
```

## v2 ideas

- Switch profiles automatically when a game starts
- Tray icon / start with Windows
- HidHide integration so games only see the virtual pad
- Photo skins for more sticks (contributions welcome)

## Contributing

Pull requests are welcome, especially presets for other games. See
[CONTRIBUTING.md](CONTRIBUTING.md) for setup and how to submit one. Every PR is reviewed and
approved by the maintainer before it's merged.

## License

[GPL-3.0](LICENSE). You're free to use, study, share and modify it; if you share a modified
version, it has to stay open source under the same license.

The bundled ViGEmBus driver is © Nefarius Software Solutions e.U. under BSD-3-Clause; its
licence ships with the installer (`resources/vigembus/ViGEmBus-LICENSE.txt`).
