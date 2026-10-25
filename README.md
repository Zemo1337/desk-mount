# DeskMount

Parametric under-desk mounts for 3D printing (build123d → STL + STEP).
It's a two-part system: a desk rail that's identical for every device, and a device adapter that slides onto it.

## Concept

```
 desk ═══════════════════════════════════════════
      [ rail ]  screwed to the desk, dovetail tongue hangs down
        \__/    ← tongue enters the adapter channel from the back
 ┌──────/  \──────────────────────────┐ ← adapter (fitted to the device at the table)
 │stop  channel ........... detent    │
 │ +lock screw                        │
 └─┬────────────────────────────────┬─┘
   │wall A   ════prong═══>          │wall B
   │           device               │
```

1. Screw the rail(s) to the desk.
2. Fit the adapter to the device at the table, with no weight to hold.
3. Lift the device and push it onto the rail towards +axis (rail.axis). The detent ridge clicks into its slot just before the stop.
4. Optionally, fit the lock screw through the adapter's front stop into the tongue to fix the adapter permanently.
5. To remove it, take out the lock screw and pull firmly against the detent.

### Adapter types

* **`prongs`**: base plus hanging walls with windows. Prong parts slide through the windows into the device's channels and are held by a screw through their head bar. Prongs are either `through` (wall A → wall B, supported at both ends, for heavy devices) or `a` / `b` (blind, with their own insertion length per side).
  * With `head.style: none` the prongs are plain bars that end flush with the walls. There is no head bar and no screw, so the walls can be thin and shallow. Something on the device has to stop the prongs sliding out, e.g. side panels that go back on after the prongs are in. See `configs/itx_pc.yaml`.
* **`plate`**: a flat plate with holes. Use it for devices that are screwed on, or that hang on keyhole slots (screw heads left proud on the device side).

### Print orientation

Every part prints without supports:

* **Rail:** printed desk-face down. The tongue flanks are 45° overhangs.
* **Adapter:** printed desk-face down. The channel only needs a short bridge for its ceiling. The detent slot goes through the floor, so nothing is bridged there.
* **Prong parts:** printed flat, so the layer lines run along the prongs.

## Parameters vs. the original sketch

| Sketch | Config key | Meaning |
|---|---|---|
| A | `base.length` | adapter length along the walls (`auto` = just enough to cover the prongs) |
| C | (derived) | `device.width` + 2 × `fit.side` + 2 × `walls.thickness` |
| D | `base.thickness` | `auto` = deep enough for the dovetail channel |
| E | `device.width` | device size between the walls (plus `fit.side` play on each side) |
| F | `prong.thickness` | prong thickness = channel height minus play |
| G | `prong.offset` | device top surface down to the top edge of the channel |
| H | `prong.width` | prong width along the wall |
| I | `walls.height` | `auto` = as low as the windows and the screw allow |
| E−n | `prong.length` | how deep a blind prong goes into the device |

### Rail and dovetail

| Key | Meaning |
|---|---|
| `rail.axis` | slide direction on the adapter: `y` (along the walls) or `x` (across) |
| `rail.positions` | rail centre offsets across the slide direction. Use two rails for wide or heavy devices. |
| `rail.length` | `auto` = the full adapter channel |
| `rail.holes` | desk screws: diameter, countersink head, count per side (`auto` ≈ one every 80 mm) |
| `rail.detent` | ridge height in mm (0 = off). `detent_distance` = how far before the stop it clicks. |
| `rail.lock_screw` | M3 screw through the adapter front into the tongue |
| `dovetail.*` | neck width/height, flare, land, clearance, lip (wall beside the channel), floor, stop |

Any `prong` default can be overridden per prong. `count` + `pitch` expand an entry into a row of prongs centred on `y`. Prongs of one side form one printed part. Use `group: <name>` to split them into separate parts. All defaults are listed at the top of `deskmount.py`.

## Setup

```
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## UI

Double-click `DeskMount UI.bat`, or run `.venv\Scripts\python.exe ui_server.py`. The batch file creates the venv on first start. The UI opens at http://localhost:8765 and is served on 127.0.0.1 only.

* **Left: parameters.** Values you set are highlighted and saved to the YAML. Empty fields use the default shown in grey, and ↺ resets a field. The letters (A, D, E…) refer to the original sketch. Focus a field to see its help text.
* **Middle: 3D view.** Switch between the assembly (desk on top, device dashed, arrow = slide direction) and the print layout. There is an explode slider and a section cut along X or Y. Click the legend chips to hide parts, and hover a part for its size.
* **Right: report.** Material, parts to print, warnings, the prong strength check, and mounting details. After **Export files** it also has download links, a ZIP and an "Open folder" button.
* **Live rebuild:** after each change, typically under a second. Turn off **Live** to rebuild only with **Build**.
* **Saving:** **Save** (Ctrl+S) writes `configs/<name>.yaml`. It keeps the comments that are already in the file and drops keys you reset to the default.

The 3D view loads three.js from cdn.jsdelivr.net, so the browser needs internet access. The theme button in the header switches between dark (default), light and following the system setting.

## Command line

```
.venv\Scripts\python.exe deskmount.py configs\modem.yaml
.venv\Scripts\python.exe deskmount.py            # all configs
```

The output goes to `out/<name>/`, and the folder is recreated on each run. It contains:

* STL files for the adapter, each prong part, and the rail (print it once per rail position), all in print orientation.
* An assembly STEP.
* A preview PNG.
* A report with sizes, material, screw counts and lengths, the prong stress estimate, and bed-size warnings (`printer.bed`).

The strength check is a rough beam estimate with a load factor (default 2). Blind prongs are treated as cantilevers loaded at the tip. Through-prongs are treated as beams with the load spread along the channel. The allowable stress (default 10 MPa) is deliberately low because PLA/PETG creep under constant load.

## License

AGPL-3.0, see [LICENSE](LICENSE).
