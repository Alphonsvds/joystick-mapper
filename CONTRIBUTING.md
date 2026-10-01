# Contributing

Thanks for helping out! Pull requests are welcome. Every PR is reviewed and approved by
the maintainer ([@Alphonsvds](https://github.com/Alphonsvds)) before it's merged, and the
tests must pass.

## Good things to work on

- **Game presets and controls sheets.** Add a starting profile for a game in
  `src/shared/presets.js`, and its in-game gamepad layout in `src/shared/games.js`
  (that's what the "controls" window shows).
- **Bug fixes.** Please include the steps that reproduce the bug.
- **Other joysticks.** Any USB stick already works through the universal layout. Owners can
  help by filing a "Joystick support" issue with the output of **Joystick → Copy device
  info** (see [Getting your joystick supported](docs/joystick-support.md)); that becomes a
  test fixture in `test/`. Better names for a stick's controls go in
  `SKINS` in `src/shared/devices.js`. A full photo layout (like the ones in
  `src/renderer/layout.js`) is bigger, so open an issue first.

For anything bigger than a small fix, open an issue before you start so we can agree on
the direction. That saves you from writing a PR that doesn't fit.

## Setup

You need Windows, [Node.js 22+](https://nodejs.org) and, to test the virtual controller,
the [ViGEmBus](https://github.com/nefarius/ViGEmBus/releases/latest) driver.

```bash
npm install
```

```bash
npm start
```

```bash
npm test
```

There's no build step: the UI is plain HTML/CSS/JS in `src/renderer/`. With no joystick
handy, serve `src/` with any static server and open `/renderer/index.html`; the keyboard
simulates the stick (see the README).

## Making a pull request

1. Fork the repo and create a branch from `main`.
2. Keep the PR focused on one change, and match the style of the surrounding code.
3. Add or update tests in `test/` for logic changes (mapping, profiles, parsing).
4. Run `npm test`, and try your change in the app with `npm start`.
5. Open the PR and fill in the template. Include a screenshot for UI changes.

GitHub Actions runs the tests on every PR. For first-time contributors, the maintainer has
to approve that run before it starts.

## Reporting bugs

Open an issue with your joystick model, Windows version, what you expected, and what
happened instead. A screenshot of the app helps a lot.

## License

By contributing, you agree that your contributions are licensed under the project's
[GPL-3.0 license](LICENSE).
