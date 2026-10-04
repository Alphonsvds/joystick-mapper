# Getting your joystick supported

Any USB flight stick, throttle or pedals already works on Windows (and on Linux, still
experimental): plug it in and the app builds its screen from what the stick reports. A report from someone who owns the
stick is what gets it named controls and a photo layout.

## Send a report

1. Plug the stick in and open Joystick Mapper.
2. Click the joystick's name in the top bar, then **Copy device info**.
3. In the same menu, click **Report this stick ↗**. It opens a
   [Joystick support issue](https://github.com/Alphonsvds/joystick-mapper/issues/new?template=joystick-support.yml).
4. Paste into **Device info**, and fill in the model and how it went.

Device info is the stick's name, USB IDs and control layout, plus your app and Windows
(or Linux) versions.

Not detected at all? Open the issue anyway with the model name.

## For a photo layout

Add these to the same issue:

- A photo of the stick, or a link to one.
- Which button number each control is. Press a control and its row lights up.

## Support levels

| Level | Meaning |
| --- | --- |
| **Experimental** | Works through the universal layout. |
| **Beta** | Has a photo layout that an owner is still checking. |
| **Fully supported** | Photo layout confirmed on the real stick. |

A new layout ships as Beta. Once you confirm every label points at the right control,
it becomes Fully supported.
