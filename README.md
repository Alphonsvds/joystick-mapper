<p align="center">
  <img src="docs/2000-downloads.svg" alt="Thank you for 2,000 downloads" width="100%">
</p>

<p align="center">
  I'm seriously so blown away by all the support for this and I'm so glad it's letting everyobe using it have some fun :)<br>
  <br>I've been asked about donations, which you can do by clicking the button (and i appreciate it, seriously thank you!), but to be honest I'd rather just have you spread the word.
</br></p>

<p align="center">
  <a href="https://buymeacoffee.com/alphonsvds"><img src="docs/buy-me-a-coffee.svg" alt="Buy me a coffee" width="200"></a>
</p>

# Joystick Mapper

**Why this exists: Ace Combat 8 is a flight game that doesn't support flight sticks.** 🙃

So this app makes your flight stick show up to games as an Xbox 360 controller.
Map the stick once and fly with it in any game that only understands gamepads.

## Features

- **Any USB flight stick, throttle or pedals.** [Supported sticks](#supported-joysticks)
  get a photo layout with named controls; every other stick gets the universal layout.
- **Multiple devices at once.** Plug in a stick, throttle and pedals (a full
  [HOTAS](#hotas-stick-throttle-and-pedals-together)), even a gamepad beside them: they
  all work together as one Xbox controller, mapped in one profile.
- **[Xbox and PlayStation controllers](#xbox-and-playstation-controllers)** can be
  remapped too, starting from a ready-made template.
- **Axis tuning, per axis:** invert, deadzone, **sensitivity** (a response curve for finer
  or quicker control near centre) and anti-deadzone. See [Using it](#using-it).
- **Axis splits:** a throttle on LT / RT, a twist on the bumpers, or an axis on the D-pad.
- **Combos on one button:** a single stick button can press L3 + R3, LB + RB or LT + RT
  together (like dropping flares in Ace Combat 8).
- **A profile per game**, with Ace Combat 8 as a starting point. Export and import them to
  share or back up.
- **Stays out of the way.** The built-in **Default** profile leaves your stick alone, so
  games that already support it (like Microsoft Flight Simulator) work as normal.
- **See what the game sees.** Changes apply live, and an Xbox controller at the bottom of
  the screen shows exactly what the game is receiving.
- **Game controls sheet.** Ace Combat 8's own gamepad layout opens in its own window, so
  you can decide what goes where while you map.
- **Calibrates itself** the first time the stick is at rest, with **Recenter** if it ever
  drifts.
- **Updates itself** when a new release is out.
- **Windows and Linux** (experimental).

## How to install

Click this -->[![Latest release](https://img.shields.io/github/v/release/Alphonsvds/joystick-mapper)](https://github.com/Alphonsvds/joystick-mapper/releases/latest)<-- or **Releases** on the right side, then download the file for your computer from the
latest release:

- **Windows:** `Joystick-Mapper-Setup-x.y.z.exe`
- **Linux** (experimental), one of:
  - **Fedora / openSUSE:** `Joystick-Mapper-x.y.z.rpm`
  - **Ubuntu / Mint / Pop!_OS / Debian:** `Joystick-Mapper-x.y.z.deb`
  - **Anything else** (Bazzite, Arch, SteamOS on the Steam Deck…): `Joystick-Mapper-x.y.z.AppImage`

  Then see [Linux](#linux-experimental) for the one-time **Allow access** step.

![Photo layout: the Logitech Extreme 3D Pro with the Ace Combat 8 profile loaded](docs/screenshot.png)
<sub>**Logitech Extreme 3D Pro**</sub>

![Photo layout: the VKB Gladiator NXT EVO with an Ace Combat 8 profile loaded](docs/screenshot-gladiator.png)
<sub>**VKB Gladiator NXT EVO**</sub>

![Photo layout: the VKB STECS Modern Throttle Standard with an Ace Combat 8 profile loaded](docs/screenshot-stecs.png)
<sub>**VKB STECS Modern Throttle Standard** (beta)</sub>

![Photo layout: the Turtle Beach VelocityOne Flightstick with an Ace Combat 8 profile loaded](docs/screenshot-flightstick.png)
<sub>**Turtle Beach VelocityOne Flightstick** (beta)</sub>

![Photo layout: the Turtle Beach VelocityOne Flightstick II with an Ace Combat 8 profile loaded](docs/screenshot-flightstick-2.png)
<sub>**Turtle Beach VelocityOne Flightstick II** (beta)</sub>

![Photo layout: the Turtle Beach VelocityOne Flightdeck stick with an Ace Combat 8 profile loaded](docs/screenshot-flightdeck-stick.png)
<sub>**Turtle Beach VelocityOne Flightdeck Stick** (beta)</sub>

![Photo layout: the Turtle Beach VelocityOne Flightdeck throttle with an Ace Combat 8 profile loaded](docs/screenshot-flightdeck-throttle.png)
<sub>**Turtle Beach VelocityOne Flightdeck Throttle** (beta)</sub>

![Photo layout: the WINWING Orion 2 joystick with the F-16EX grip, with an Ace Combat 8 profile loaded](docs/screenshot-orion-f16ex.png)
<sub>**WINWING Orion 2 F-16EX** (beta)</sub>

![Photo layout: the WINWING Orion 2 throttle with an Ace Combat 8 profile loaded](docs/screenshot-orion-throttle.png)
<sub>**WINWING Orion 2 Throttle** (beta)</sub>

![Photo layout: the Thrustmaster Sol-R right stick with an Ace Combat 8 profile loaded](docs/screenshot-solr-right.png)
<sub>**Thrustmaster Sol-R Right Stick** (beta)</sub>

![Photo layout: the Thrustmaster Sol-R left stick with an Ace Combat 8 profile loaded](docs/screenshot-solr-left.png)
<sub>**Thrustmaster Sol-R Left Stick** (beta)</sub>

![Photo layout: the Logitech X56 stick with an Ace Combat 8 profile loaded](docs/screenshot-x56-stick.png)
<sub>**Logitech X56 Stick** (beta)</sub>

![Photo layout: the Logitech X56 throttle with an Ace Combat 8 profile loaded](docs/screenshot-x56-throttle.png)
<sub>**Logitech X56 Throttle** (beta)</sub>

![Photo layout: an Xbox controller mapped to itself](docs/screenshot-xbox.png)
<sub>**Xbox Controller** (beta)</sub>

![Photo layout: an Xbox Elite controller mapped to itself](docs/screenshot-xbox-elite.png)
<sub>**Xbox Elite Controller** (beta)</sub>

![Photo layout: a DualSense mapped as an Xbox controller](docs/screenshot-dualsense.png)
<sub>**DualSense** (beta)</sub>

![Photo layout: a DualShock 4 mapped as an Xbox controller](docs/screenshot-dualshock4.png)
<sub>**DualShock 4** (beta)</sub>

![Universal layout: any other stick, built from what the stick reports](docs/screenshot-generic.png)
<sub>Every other stick gets the universal layout.</sub>


## Supported joysticks

| Support | Joysticks |
| --- | --- |
| **Fully supported**<br><sub>Tested, with a photo layout and named controls</sub> | <ul><li>Logitech Extreme 3D Pro</li><li>VKB Gladiator NXT EVO (right hand)</li></ul> |
| **Beta**<br><sub>Photo layout and named controls, still being confirmed by owners</sub> | <ul><li>VKB STECS Modern Throttle Standard</li><li>Turtle Beach VelocityOne Flightstick and Flightstick II</li><li>Turtle Beach VelocityOne Flightdeck stick and throttle</li><li>WINWING Orion 2 F-16EX grip</li><li>WINWING Orion 2 Throttle (F-15EX handles)</li><li>Thrustmaster Sol-R right and left sticks</li><li>Logitech X56 stick and throttle</li><li>Xbox and Xbox Elite controllers (Windows)</li><li>PlayStation DualSense and DualShock 4</li><li>Virpil ACE-Torq pedals (named controls, no photo yet)</li></ul> |
| **Experimental**<br><sub>Detected automatically</sub> | <ul><li>Any other USB flight stick, throttle or pedals (universal layout)</li></ul> |

On Linux every stick is read the same way as on Windows, with the same layouts, but Linux
itself is still experimental: nothing has been confirmed on a real Linux machine yet.

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

## Xbox and PlayStation controllers

A controller shows up like any stick. Start a profile from its own template, then change
the controls you want: an **Xbox** controller starts mapped to itself, a **DualSense** or
**DualShock 4** as the Xbox controller a game expects.

- **Xbox controllers** are read on Windows.
- **Xbox Elite paddles** aren't buttons of their own to Windows: each one copies the button
  you give it in the Xbox Accessories app, so map that button here.
- **PlayStation controllers:** plug in the USB cable.

The game still sees the real controller beside the remapped one. Hide the real one with
[HidHide](https://github.com/nefarius/HidHide), with Joystick Mapper on its list of
applications, so only your mapping is read.

Next to a flight stick, a controller comes up as **Extra** and does nothing until you map it.

## Download

**[Download the latest release](https://github.com/Alphonsvds/joystick-mapper/releases/latest)**:

- **Windows:** the `.exe`
- **Linux:** the `.rpm`, `.deb` or `.AppImage` (see [How to install](#how-to-install) for
  which one)

> Windows may show **"Windows protected your PC"** because the installer isn't code-signed
> (signing certificates cost money). Click **More info → Run anyway**.

## Linux (experimental)

Linux support is new. It works the same way as on Windows, but it hasn't been tried with
many sticks and games yet, so if something's off, please
[open an issue](https://github.com/Alphonsvds/joystick-mapper/issues/new).

- **Installing.** Open the `.rpm` or `.deb` with your software center, or run
  `sudo dnf install ./Joystick-Mapper-x.y.z.rpm` (Fedora) or
  `sudo apt install ./Joystick-Mapper-x.y.z.deb` (Ubuntu). The **AppImage** needs no
  install: make it executable (right-click → Properties → *Allow executing as program*, or
  `chmod +x Joystick-Mapper-*.AppImage`) and double-click it.
- **Allow access (once).** Linux doesn't let apps read joysticks or create controllers
  until you say so. Plug in your stick, open the app, click **Allow access** in the top
  bar and enter your password. That adds one small permissions file,
  `/etc/udev/rules.d/70-joystick-mapper.rules`, covering the virtual controller and the
  devices plugged in at the time. Plug in a new device later? Click it again. Delete the
  file to undo it.
- **Steam Deck:** set a password first (`passwd` in Konsole), since **Allow access** asks
  for it.
- **The AppImage won't open?** It needs FUSE 2: `sudo dnf install fuse-libs` (Fedora) or
  `sudo apt install libfuse2t64` (Ubuntu 24.04). On Ubuntu, the `.deb` is the easier choice.
- **Games** see an ordinary Xbox 360 controller, both native Linux games and Windows games
  running through Steam's Proton.
- **Updates.** The AppImage updates itself, like the Windows app. With the `.rpm` or
  `.deb`, **Update available** opens the release page: install the new file over the old one.
- **Settings** live in `~/.config/Joystick Mapper/`.
- **No password prompt appears?** Do the same thing by hand in a terminal, with one
  `hidraw` line per device: its ID from the joystick menu (e.g. `046d:c215`), in capitals.

  ```bash
  sudo tee /etc/udev/rules.d/70-joystick-mapper.rules <<'EOF'
  KERNEL=="uinput", SUBSYSTEM=="misc", OPTIONS+="static_node=uinput", TAG+="uaccess"
  SUBSYSTEM=="hidraw", KERNELS=="*:046D:C215.*", TAG+="uaccess"
  EOF
  sudo modprobe uinput
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```

## Using it

- **Profiles.** **Default** is built in and can't be changed. It leaves your joystick
  completely alone and creates no virtual controller, so games that support the stick
  natively (e.g. Microsoft Flight Simulator) behave exactly as if this app weren't
  running. Create a profile per game (**Profile ▾ → New profile**). **Ace Combat 8** is
  available as a starting point that matches the game's default gamepad layout.
- **Mapping.** Hover a label or hotspot to highlight its line. Click **NOT MAPPED** to
  pick an Xbox input. Axes also have **INV** (invert) and a **DZ/SENS** button that opens
  their deadzone, sensitivity and anti-deadzone sliders.
- **Folded labels.** A device with a lot of controls shows each one as a name with its own
  line. Click a name, or its dot, to open its dropdowns.
- **Deadzone, sensitivity and anti-deadzone.** **Deadzone** ignores small movement, for an
  axis that drifts. **Sensitivity** bends the response curve: above 0 small movements do
  more, below 0 they do less, for finer control near centre. Full travel still reaches
  100% either way. **Anti-deadzone** starts the output at a set level the moment the axis
  moves, to cancel a deadzone the game applies itself. Sensitivity and anti-deadzone are
  off until you set them, and only apply to analog outputs (sticks and triggers).
- **AC8 controls.** Opens Ace Combat 8's own gamepad layout in a separate window (e.g.
  "Fire missile → B"), so you can decide where each action goes on the stick.
- **Save.** Changes apply live so you can test right away. **Save** (or Ctrl+S) keeps them.
- **Export / Import.** Profiles are small `.joymap.json` files you can share or back up.
- **Xbox emulation switch.** Pauses the virtual controller without leaving your profile.
- **Recenter.** Let go of the stick and click it if the plane drifts. The app also
  calibrates automatically the first time it sees the stick at rest.
- **Throttle vs centred axes.** Each axis's dropdown has **Springs back to centre**. Leave it
  on for sticks, twists and pedals, and turn it off for throttles and sliders. Experimental
  sticks get a best guess from the stick's own description.
- **Updates.** **Update available** appears bottom-left when a newer release is out. Click
  it to download and install; Windows asks for permission and the app restarts. Profiles
  and calibration carry over. The app checks GitHub's public release list when it starts.
  (Linux: see [Linux](#linux-experimental).)

Handy axis options for flying: **Throttle → LT / RT Split** (pull back = brake, push
forward = boost) and **Yaw → LB / RB Split** (twist = rudder on the bumpers).

## Good to know

- **The app has to be running while you play.** It translates the stick live; closing it
  unplugs the virtual controller. Minimising is fine.
- **Unplug (or turn off) other controllers** while flying with the stick. Many games only
  listen to player 1, and a real gamepad plugged in first takes that slot.
- **Games still see the physical joystick too.** Games without joystick support ignore it.
  If one reacts to both, hiding the stick with HidHide is on the v2 list.
- **Deadzone bigger than you set?** Steam adds its own by default. Change it in the game's
  Steam controller settings, or turn off **Steam Input** for that game.
- **A "pick an app to open this ms-gamebar link" popup?** Windows calls Xbox Game Bar
  whenever an Xbox controller (including the virtual one) connects. If Game Bar has been
  uninstalled, Windows asks what should open it instead. Reinstall **Xbox Game Bar** from the
  Microsoft Store, then turn off **Settings → Gaming → Xbox Game Bar → "Open Xbox Game Bar
  using this button on a controller"** or just leave it alone if it doesn’t bother you.
- Your settings live in `%APPDATA%\Joystick Mapper\` (`profiles.json`, and `devices.json`
  for each device's calibration and role). On Linux: `~/.config/Joystick Mapper/`.
- Profiles use each stick's own button numbers (on nearly every flight stick, button 1 is
  the trigger), so a profile mostly carries over if you switch sticks. With a HOTAS, a
  profile maps by role, so it carries over to a different throttle or pedals the same way.
- Uninstalling the app leaves the ViGEmBus driver in place (other tools use it too). Remove
  it from **Settings → Apps** if you want.

**Check that Windows sees the virtual pad:** with a game profile active, press Win+R, run
`joy.cpl` and look for **Controller (XBOX 360 For Windows)**. On Linux, run
`grep "X-Box 360" /proc/bus/input/devices` and look for **Microsoft X-Box 360 pad**.

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
  per-model code. On Linux, the app's own parser reads the same self-description
  (`hiddescriptor.js`) and lays it out exactly as Windows does, so layouts and profiles
  carry over.
- **Output** is a virtual Xbox 360 pad created by the free
  [ViGEmBus](https://github.com/nefarius/ViGEmBus) driver (the one DS4Windows uses). The
  app talks to the driver directly through `koffi`, so no C++ build tools are needed. On
  Linux there's no driver: the kernel's own `uinput` creates the pad.
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

**Build the Linux packages locally** (on Linux; the `.rpm` needs `rpmbuild`). Writes the
AppImage, `.deb` and `.rpm` to `dist/`:

```bash
npm run dist:linux
```

**Publish a release.** Bump `version` in `package.json`, commit, then push a tag. GitHub
Actions (`.github/workflows/release.yml`) builds the Windows installer, attaches it to the
release, then adds the Linux packages:

```bash
git tag v0.1.0
```

```bash
git push origin main --tags
```

**Preview the UI without hardware.** Serve `src/` with any static server and open
`/renderer/index.html`; the keyboard simulates the stick (WASD pitch/roll, Q/E twist,
R/F throttle, arrows = hat, Space = trigger, 3–0 = buttons). It simulates an Extreme 3D Pro,
a VKB Gladiator NXT EVO (add `?device=gladiator`), a VKB STECS throttle (`?device=stecs`),
a Turtle Beach VelocityOne Flightstick and Flightstick II (`?device=flightstick`,
`?device=flightstick2`), a WINWING Orion 2 stick
and throttle (`?device=orionstick`, `?device=orionthrottle`), a Thrustmaster Sol-R right and
left stick (`?device=solrright`, `?device=solrleft`), a Logitech X56 stick and throttle
(`?device=x56stick`, `?device=x56throttle`), a Turtle Beach VelocityOne Flightdeck stick
and throttle (`?device=flightdeckstick`, `?device=flightdeckthrottle`), an Xbox controller
and an Xbox Elite (`?device=xbox`, `?device=elite`), a DualShock 4 and a DualSense
(`?device=dualshock4`, `?device=dualsense`), Virpil ACE-Torq pedals (`?device=acetorq`)
and a Thrustmaster T.16000M (`?device=t16000m`, the universal layout). `?device=hotas` plugs in a stick, a throttle and pedals together,
`?device=winwing` the WINWING and Virpil rig, `?device=solr` the Sol-R pair, `?device=x56`
the X56 pair, `?device=flightdeck` the Flightdeck pair; the keyboard drives whichever one is on screen.

**Test the universal layout with a supported stick.** Set `JOYMAP_GENERIC=1` before
`npm start` to show even the Extreme 3D Pro with the generic screen.

**See the update button.** `JOYMAP_VERSION=0.1.0` makes the app think it's that version; in
the browser preview, add `?update=9.9.9`. `JOYMAP_UPDATE_FEED=<url>` points the installed
app's updater at a served `dist/` folder instead of GitHub.

Linux: `npm install` and `npm start` work the same; click **Allow access** once.
macOS: only the Extreme 3D Pro is read, and there's no virtual Xbox controller.

## Project layout

```
src/main/main.js                 Electron main: window, profiles, IPC, wiring
src/main/joystick.js             Finds and reads every joystick plugged in, reconnects on unplug
src/main/hidp.js                 Windows' HID parser: reads any stick from its self-description
src/main/hiddescriptor.js        Linux: the same, from the stick's report descriptor
src/main/devices/extreme3dpro.js Hand-written Extreme 3D Pro reader (macOS fallback)
src/shared/devices.js            Stick layout → controls (axes, hats, buttons), skins, calibration, HOTAS roles
src/main/vigem.js                Virtual Xbox 360 controller via ViGEmBus
src/main/uinput.js               Linux: the virtual Xbox 360 controller via uinput
src/main/linux-access.js         Linux: the Allow access button (a udev rule, via pkexec)
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

The Barlow Semi Condensed font (used where Windows' Bahnschrift isn't available) is © The
Barlow Project Authors under the SIL Open Font License
(`src/renderer/assets/fonts/OFL.txt`).
