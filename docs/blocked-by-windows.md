# Blocked by Windows

Joystick Mapper says **Blocked by Windows** when Windows refuses to load one of the app's
own files, `koffi.node`: the part that reads your joysticks and talks to the virtual
controller's driver. Nothing is wrong with the joystick.

The usual cause is **Smart App Control** in Windows 11. It blocks files that aren't
code-signed and that it doesn't recognise, and Joystick Mapper isn't code-signed.

## Fix it

1. Open **Windows Security** → **App & browser control** → **Smart App Control settings**.
2. Choose **Off**.
3. Close Joystick Mapper and open it again.

Before you do: this switches Smart App Control off for every app, not only this one, and
some versions of Windows 11 can't switch it back on without resetting Windows. Windows
says so before you confirm. Microsoft Defender and SmartScreen keep working either way.

## Check that this is the cause

Open **Event Viewer** → **Applications and Services Logs** → **Microsoft** → **Windows** →
**CodeIntegrity** → **Operational**, and look for an error naming `koffi.node`.

## On a work or school PC

A company's application control policy gives the same message. Only its administrator
can allow the app.

## Still blocked?

Open a [GitHub issue](https://github.com/Alphonsvds/joystick-mapper/issues/new) with your
Windows version and what Event Viewer showed.
