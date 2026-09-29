# Joystick Mapper

Makes a **Logitech Extreme 3D Pro** show up to games as an **Xbox 360 controller**, for
games (like Ace Combat) that only understand gamepads.

One screen: the stick on black, a line to every button and axis, and a dropdown on each
line to pick the Xbox input it drives. Press something on the real stick and its hotspot
lights up; the controller strip at the bottom shows what the virtual pad is sending.

## Download

**[Download the latest installer](https://github.com/Alphonsvds/joystick-mapper/releases/latest)**:
`Joystick-Mapper-Setup-x.y.z.exe`. It installs the app **and** the ViGEmBus controller
driver it needs, so there's nothing else to set up. Windows asks for admin permission once.

> Windows may show **"Windows protected your PC"** because the installer isn't code-signed
> (signing certificates cost money). Click **More info → Run anyway**.

## Using it

- **Profiles.** **Default** is built in and can't be changed. It leaves your joystick
  completely alone and creates no virtual controller, so games that support the stick
  natively (e.g. Microsoft Flight Simulator) behave exactly as if this app weren't
  running. Create a profile per game (**Profile ▾ → New profile**). **Ace Combat 8** is
  available as a starting point that matches the game's default gamepad layout.
- **Mapping.** Hover a label or hotspot to highlight its line. Click **NOT MAPPED** to
  pick an Xbox input. Axes also have **INV** (invert) and a **deadzone** slider.
- **AC8 controls.** Opens Ace Combat 8's own gamepad layout in a separate window (e.g.
  "Fire missile → B"), so you can decide where each action goes on the stick.
- **Save.** Changes apply live so you can test right away. **Save** (or Ctrl+S) keeps them.
- **Export / Import.** Profiles are small `.joymap.json` files you can share or back up.
- **Xbox emulation switch.** Pauses the virtual controller without leaving your profile.
- **Recenter.** Let go of the stick and click it if the plane drifts. The app also
  calibrates automatically the first time it sees the stick at rest.

Handy axis options for flying: **Throttle → LT / RT Split** (pull back = brake, push
forward = boost) and **Yaw → LB / RB Split** (twist = rudder on the bumpers).

## Good to know

- **The app has to be running while you play.** It translates the stick live; closing it
  unplugs the virtual controller. Minimising is fine.
- **Unplug (or turn off) other controllers** while flying with the stick. Many games only
  listen to player 1, and a real gamepad plugged in first takes that slot.
- **Games still see the physical joystick too.** Games without joystick support ignore it.
  If one reacts to both, hiding the stick with HidHide is on the v2 list.
- **Steam Input** can wrap the virtual pad. That's normally harmless; if inputs look doubled,
  disable Steam Input for that game.
- Your settings live in `%APPDATA%\Joystick Mapper\` (`profiles.json`, `calibration.json`).
- Uninstalling the app leaves the ViGEmBus driver in place (other tools use it too). Remove
  it from **Settings → Apps** if you want.

**Check that Windows sees the virtual pad:** with a game profile active, press Win+R, run
`joy.cpl` and look for **Controller (XBOX 360 For Windows)**.

## How it works

```
Extreme 3D Pro ──raw HID──▶ Electron main process ──mapping──▶ ViGEmBus ──▶ "Xbox 360 controller"
                           (keeps running while the                         (what the game sees)
                            game has focus)
                                    │
                                    └──live state──▶ the mapper screen
```

- **Input** is read straight from the stick over HID (`node-hid`), so it works in the
  background while the game is focused.
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
R/F throttle, arrows = hat, Space = trigger, 3–0 = buttons).

macOS: the screen and live joystick input work, but the virtual Xbox controller needs
ViGEmBus, which is Windows-only.

## Project layout

```
src/main/main.js                 Electron main: window, profiles, IPC, wiring
src/main/joystick.js             HID reader, reconnects on unplug
src/main/devices/extreme3dpro.js Report format + axis normalisation for the stick
src/main/vigem.js                Virtual Xbox 360 controller via ViGEmBus
src/main/store.js                JSON persistence
src/main/preload.cjs             The UI's only bridge to the main process
src/shared/controls.js           Physical controls, Xbox targets, binding rules
src/shared/profiles.js           Profile library (Default + game profiles, export format)
src/shared/presets.js            Starting points for new profiles (Ace Combat 8, …)
src/shared/games.js              Each game's own gamepad controls (the controls window)
src/shared/mapper.js             Pure mapping engine (joystick state → XUSB report)
src/renderer/                    The single screen
build/                           Installer resources (icon, NSIS driver step)
scripts/fetch-vigembus.mjs       Fetches + verifies the bundled driver installer
```

## v2 ideas

- Switch profiles automatically when a game starts
- Tray icon / start with Windows
- HidHide integration so games only see the virtual pad

## Third-party

ViGEmBus © Nefarius Software Solutions e.U., BSD-3-Clause. The licence ships with the
installer (`resources/vigembus/ViGEmBus-LICENSE.txt`).
