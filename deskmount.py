"""Parametric under-desk mount generator: dovetail desk rail + device adapter.

Usage:
    python deskmount.py configs/modem.yaml [configs/itx_pc.yaml ...]
    python deskmount.py            (builds every configs/*.yaml)

The rail is screwed to the desk and carries a dovetail tongue. The adapter is
fitted to the device at the table, then slid onto the rail until the detent
clicks; an optional screw through the adapter front locks it for good.

Coordinates are print coordinates of the adapter: its desk-facing face lies on
the bed (z = 0) and +z points away from the desk, which is "downwards" once
mounted. X runs across the device (side A at -x, side B at +x), Y along the
walls. The slide direction is rail.axis; the device is pushed in towards +axis,
so the adapter's front (stop and lock screw) is its -axis end.
"""

import argparse
import copy
import math
import shutil
import sys
from pathlib import Path

import yaml
from build123d import (Align, Axis, Box, Compound, Cone, Cylinder, Plane, Polygon, Pos, Rot, chamfer, export_step,
                       export_stl, extrude)

ROOT = Path(__file__).parent
MIN = (Align.MIN, Align.MIN, Align.MIN)
CMIN = (Align.CENTER, Align.CENTER, Align.MIN)

DEFAULTS = {
    "name": None,
    "adapter": "prongs",
    "device": {"width": None, "mass": 0.0, "height": 60.0, "length": None},
    "fit": {"side": 0.5, "top": 0.5, "window": 0.3},
    "base": {"length": "auto", "thickness": "auto", "overhang": 0.0, "margin": 4.0, "frame": 0.0},
    "walls": {"thickness": 6.0, "sides": "auto", "height": "auto", "below": 3.0},
    "prong": {"width": 10.0, "thickness": 3.0, "offset": 3.0, "length": 10.0, "tip_chamfer": 0.8},
    "head": {"style": "bar", "thickness": 4.0, "margin": 3.0, "screws": "auto", "inset": 0.2},
    "screw": {"clearance": 3.4, "pilot": 2.5, "head": 6.0, "edge": 2.5},
    "through_protrusion": 1.0,
    "plate": {"length": 80.0, "width": 40.0, "holes": [], "hole": 2.5, "head": 0.0},
    "rail": {
        "axis": "y", "positions": [0.0], "length": "auto", "thickness": 5.0,
        "lock_screw": True, "detent": 1.0, "detent_distance": 8.0,
        "holes": {"diameter": 4.5, "head": 9.0, "count": "auto", "margin": 2.0},
    },
    "dovetail": {"neck": 14.0, "neck_height": 1.0, "flare": 3.0, "land": 1.0, "clearance": 0.3,
                 "lip": 5.0, "floor": 2.5, "stop": 6.0},
    "strength": {"allowable": 10.0, "load_factor": 2.0},
    "printer": {"bed": [256, 256]},
    "prongs": [],
}


class ConfigError(Exception):
    pass


def merge(defaults, override):
    out = copy.deepcopy(defaults)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merge(out[key], value)
        else:
            out[key] = value
    return out


def block(x0, x1, y0, y1, z0, z1):
    return Pos(min(x0, x1), min(y0, y1), min(z0, z1)) * Box(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), align=MIN)


def x_cylinder(x0, x1, y, z, diameter):
    return Pos(min(x0, x1), y, z) * Rot(0, 90, 0) * Cylinder(diameter / 2, abs(x1 - x0), align=CMIN)


def y_cylinder(y0, y1, x, z, diameter):
    return Pos(x, min(y0, y1), z) * Rot(-90, 0, 0) * Cylinder(diameter / 2, abs(y1 - y0), align=CMIN)


def prism_y(points, t, s0, s1, z=0.0):
    """Extrude a symmetric (u, v) profile along +y from s0 to s1; u -> x around t, v -> z above z."""
    plane = Plane(origin=(t, s0, z), x_dir=(-1, 0, 0), z_dir=(0, 1, 0))
    return extrude(plane * Polygon(*points, align=None), amount=s1 - s0)


def prism_x(points, x0, x1, z=0.0):
    """Extrude an (s, v) profile along +x from x0 to x1; s -> y, v -> z above z."""
    plane = Plane(origin=(x0, 0, z), x_dir=(0, 1, 0), z_dir=(1, 0, 0))
    return extrude(plane * Polygon(*points, align=None), amount=x1 - x0)


def spread(lo, hi, count):
    if count <= 1:
        return [(lo + hi) / 2]
    return [lo + i * (hi - lo) / (count - 1) for i in range(count)]


class Dovetail:
    """Rail with a dovetail tongue (desk side) and the matching channel cut into an adapter."""

    def __init__(self, cfg):
        d = cfg["dovetail"]
        self.wn = float(d["neck"])
        self.n = float(d["neck_height"])
        self.f = float(d["flare"])
        self.land = float(d["land"])
        self.wt = self.wn + 2 * self.f
        self.h = self.n + self.f + self.land
        self.c = float(d["clearance"])
        self.strip = self.wt + 2 * self.c + 2 * float(d["lip"])
        self.depth = self.h + self.c + float(d["floor"])
        self.stop = float(d["stop"])
        r = cfg["rail"]
        self.axis = str(r["axis"]).lower()
        if self.axis not in ("x", "y"):
            raise ConfigError(f"rail.axis must be x or y, got {r['axis']!r}")
        self.positions = [float(p) for p in r["positions"]]
        if not self.positions:
            raise ConfigError("rail.positions is empty")
        self.Rt = float(r["thickness"])
        self.detent = float(r["detent"])
        self.detent_dist = float(r["detent_distance"])
        self.detent_base = 2 * self.detent / math.tan(math.radians(30))
        self.lock = bool(r["lock_screw"])
        self.length_cfg = r["length"]
        self.sc = cfg["screw"]
        self.v_screw = self.h / 2 + 0.5
        hc = r["holes"]
        self.hole_d = float(hc["diameter"])
        self.hole_head = max(float(hc["head"]), self.hole_d)
        self.hole_margin = float(hc["margin"])
        self.hole_count = hc["count"]
        self.hole_x = self.wt / 2 + 0.5 + self.hole_head / 2
        self.width = 2 * (self.hole_x + self.hole_head / 2 + self.hole_margin)
        if (self.hole_head - self.hole_d) / 2 >= self.Rt:
            raise ConfigError("rail countersink deeper than rail.thickness")
        self.length = None

    def profile(self, grow=0.0, top_extra=0.0, bottom=0.0):
        hn, ht = self.wn / 2 + grow, self.wt / 2 + grow
        top = self.h + top_extra
        return [(-hn, bottom), (hn, bottom), (hn, self.n), (ht, self.n + self.f),
                (ht, top), (-ht, top), (-ht, self.n + self.f), (-hn, self.n)]

    def t_of(self, p):
        return p if self.axis == "y" else -p

    def to_adapter(self, shape):
        return shape if self.axis == "y" else Rot(0, 0, -90) * shape

    def fit_length(self, s0, s1):
        room = s1 - s0 - self.stop
        L = room if self.length_cfg == "auto" else float(self.length_cfg)
        if L > room + 1e-6:
            raise ConfigError(f"rail.length {L} is longer than the adapter channel ({room:.1f})")
        if L < self.detent_dist + 12:
            raise ConfigError(f"rail would only be {L:.1f} mm long, the adapter is too short along the slide axis")
        self.length = L
        return L

    def holes_y(self, L):
        ym = self.hole_head / 2 + self.hole_margin
        n = self.hole_count
        if n == "auto":
            n = max(2, math.ceil(L / 80) + 1)
        return spread(ym, L - ym, int(n))

    def rail(self):
        L, W, Rt = self.length, self.width, self.Rt
        part = block(-W / 2, W / 2, 0, L, 0, Rt)
        part += prism_y(self.profile(bottom=-0.01), 0, 0, L, Rt)
        if self.detent > 0:
            s, b = L - self.detent_dist, self.detent_base
            ridge = [(s - b / 2, self.h - 0.01), (s + b / 2, self.h - 0.01), (s, self.h + self.detent)]
            part += prism_x(ridge, -self.wt / 2, self.wt / 2, Rt)
        if self.lock:
            part -= y_cylinder(-1, 10, 0, Rt + self.v_screw, self.sc["pilot"])
        r, rh = self.hole_d / 2, self.hole_head / 2
        sink = rh - r
        for x in (-self.hole_x, self.hole_x):
            for y in self.holes_y(L):
                part -= Pos(x, y, -1) * Cylinder(r, Rt + 2, align=CMIN)
                if sink > 0:
                    part -= Pos(x, y, Rt - sink) * Cone(r, rh, sink + 0.01, align=CMIN)
        return part

    def channel_cuts(self, s0, s1, D):
        cut = None
        ss = s0 + self.stop
        for p in self.positions:
            t = self.t_of(p)
            c = prism_y(self.profile(grow=self.c, top_extra=self.c, bottom=-1), t, ss, s1 + 1)
            if self.detent > 0:
                s = ss + self.length - self.detent_dist
                hw = self.detent_base / 2 + self.c
                c += block(t - self.wt / 2 - self.c, t + self.wt / 2 + self.c, s - hw, s + hw, self.h, D + 1)
            if self.lock:
                c += y_cylinder(s0 - 1, ss + 1, t, self.v_screw, self.sc["clearance"])
            cut = c if cut is None else cut + c
        return self.to_adapter(cut)

    def strips(self, s0, s1, D):
        out = None
        for p in self.positions:
            t = self.t_of(p)
            b = block(t - self.strip / 2, t + self.strip / 2, s0 - 1, s1 + 1, -1, D + 1)
            out = b if out is None else out + b
        return self.to_adapter(out)

    def strip_rects(self, s0, s1):
        """Strip footprints as (x0, x1, y0, y1) in adapter coordinates."""
        rects = []
        for p in self.positions:
            if self.axis == "y":
                rects.append((p - self.strip / 2, p + self.strip / 2, s0, s1))
            else:
                rects.append((s0, s1, p - self.strip / 2, p + self.strip / 2))
        return rects

    def placed_rails(self, rail, s0):
        return [self.to_adapter(Pos(self.t_of(p), s0 + self.stop, -self.Rt) * rail) for p in self.positions]

    def check_across(self, lo, hi, warnings, inner=None):
        for p in self.positions:
            if p - self.strip / 2 < lo - 1e-6 or p + self.strip / 2 > hi + 1e-6:
                raise ConfigError(f"rail at position {p} (strip {self.strip:.1f} wide) does not fit the adapter ({lo:.1f}..{hi:.1f})")
            if inner and (p - self.strip / 2 < inner[0] or p + self.strip / 2 > inner[1]):
                warnings.append(f"rail at position {p} runs under a wall, keep it between {inner[0]:.1f} and {inner[1]:.1f}")
        ps = sorted(self.positions)
        for a, b in zip(ps, ps[1:]):
            if b - a < self.strip:
                raise ConfigError(f"rails at {a} and {b} are closer than the channel strip width {self.strip:.1f}")


def expand_prongs(cfg):
    prongs = []
    for index, entry in enumerate(cfg["prongs"]):
        p = merge(cfg["prong"], entry)
        side = str(p.get("side", "a")).lower()
        if side not in ("a", "b", "through"):
            raise ConfigError(f"prong {index}: side must be a, b or through, got {side!r}")
        count = int(p.get("count", 1))
        pitch = float(p.get("pitch", 0.0))
        if count > 1 and pitch <= p["width"]:
            raise ConfigError(f"prong {index}: pitch {pitch} must be larger than width {p['width']}")
        y_center = float(p.get("y", 0.0))
        for i in range(count):
            q = dict(p)
            q["side"] = side
            q["y"] = y_center + (i - (count - 1) / 2) * pitch
            q["group"] = str(p.get("group", "a" if side in ("a", "through") else "b"))
            q["label"] = f"#{index}" + (f".{i}" if count > 1 else "")
            prongs.append(q)
    if not prongs:
        raise ConfigError("no prongs defined")
    return prongs


def base_thickness(cfg, dove):
    t = cfg["base"]["thickness"]
    if t == "auto":
        return math.ceil(dove.depth * 2) / 2
    t = float(t)
    if t < dove.depth - 1e-6:
        raise ConfigError(f"base.thickness {t} is too thin for the dovetail channel, needs >= {dove.depth:.1f}")
    return t


class ProngAdapter:
    """Base with hanging walls; prong parts slide through wall windows into the device channels."""

    def __init__(self, cfg, dove):
        self.cfg = cfg
        self.dove = dove
        self.warnings = []
        dev = cfg["device"]
        if not dev["width"]:
            raise ConfigError("device.width is required")
        self.dw = float(dev["width"])
        self.E = self.dw + 2 * cfg["fit"]["side"]
        self.T = float(cfg["walls"]["thickness"])
        self.D = base_thickness(cfg, dove)
        self.c = float(cfg["fit"]["window"])
        self.z_dev = self.D + cfg["fit"]["top"]
        self.prongs = expand_prongs(cfg)
        self._sides()
        self._groups()
        self._layout()

    def _sides(self):
        used = {p["side"] for p in self.prongs}
        sides = self.cfg["walls"]["sides"]
        if sides == "auto":
            sides = {"a", "b"} if "through" in used or ("a" in used and "b" in used) else used
        sides = {str(s).lower() for s in sides}
        needed = {"a", "b"} if "through" in used else set()
        needed |= used - {"through"}
        missing = needed - sides
        if missing:
            raise ConfigError(f"prongs need wall(s) {sorted(missing)} but walls.sides is {sorted(sides)}")
        self.sides = sides
        self.x_in = {"a": -self.E / 2, "b": self.E / 2}
        self.x_out = {"a": -self.E / 2 - self.T, "b": self.E / 2 + self.T}

    def _groups(self):
        groups = {}
        for p in self.prongs:
            groups.setdefault(p["group"], []).append(p)
        sc = self.cfg["screw"]
        hd = self.cfg["head"]
        self.flush = str(hd["style"]).lower() == "none"
        if str(hd["style"]).lower() not in ("bar", "none"):
            raise ConfigError(f"head.style must be bar or none, got {hd['style']!r}")
        self.groups = []
        for name, members in groups.items():
            sides = {"a" if p["side"] == "through" else p["side"] for p in members}
            if len(sides) != 1:
                raise ConfigError(f"group {name!r} mixes prongs of side A and side B")
            side = sides.pop()
            if len({(p["offset"], p["thickness"]) for p in members}) != 1:
                raise ConfigError(f"group {name!r}: all prongs of one part need the same offset and thickness (use separate groups)")
            p0 = members[0]
            z0 = self.z_dev + p0["offset"]
            z1 = z0 + p0["thickness"]
            y0 = min(p["y"] - p["width"] / 2 for p in members) - hd["margin"]
            y1 = max(p["y"] + p["width"] / 2 for p in members) + hd["margin"]
            if self.flush:
                screw_z, screw_y = None, []
                bar_z1 = z1 + self.c + float(self.cfg["walls"]["below"])
            else:
                screw_z = z1 + self.c + sc["edge"] + sc["clearance"] / 2
                bar_z1 = screw_z + sc["clearance"] / 2 + sc["edge"]
                min_len = sc["head"] + 2 * sc["edge"]
                if y1 - y0 < min_len:
                    grow = (min_len - (y1 - y0)) / 2
                    y0, y1 = y0 - grow, y1 + grow
                screws = hd["screws"]
                if screws == "auto":
                    screws = 1 if y1 - y0 < 50 else 2
                inset = sc["head"] / 2 + 1.0
                screw_y = spread(y0 + inset, y1 - inset, int(screws)) if screws > 1 else [(y0 + y1) / 2]
            self.groups.append({
                "name": name, "side": side, "prongs": members, "z0": z0, "z1": z1,
                "screw_z": screw_z, "bar_z1": bar_z1, "y0": y0, "y1": y1, "screw_y": screw_y,
            })

    def _layout(self):
        cfg = self.cfg
        h = cfg["walls"]["height"]
        need = max(g["bar_z1"] for g in self.groups) - self.D
        if h == "auto":
            self.wall_h = need
        else:
            self.wall_h = float(h)
            if self.wall_h < need - 1e-6:
                raise ConfigError(f"walls.height {h} is too low, needs at least {need:.1f}")
        m = cfg["base"]["margin"]
        y0 = min(g["y0"] for g in self.groups) - m
        y1 = max(g["y1"] for g in self.groups) + m
        L = cfg["base"]["length"]
        if L != "auto":
            L = float(L)
            if -L / 2 > y0 + 1e-6 or L / 2 < y1 - 1e-6:
                raise ConfigError(f"base.length {L} does not cover the prong heads (y {y0:.1f}..{y1:.1f}, base is centred on y=0)")
            y0, y1 = -L / 2, L / 2
        self.y0, self.y1 = y0, y1
        ov = cfg["base"]["overhang"]
        self.bx0 = (self.x_out["a"] - ov) if "a" in self.sides else -self.E / 2 - ov
        self.bx1 = (self.x_out["b"] + ov) if "b" in self.sides else self.E / 2 + ov
        if self.dove.axis == "y":
            self.dove.check_across(self.bx0, self.bx1, self.warnings, (-self.E / 2, self.E / 2))
        else:
            self.dove.check_across(self.y0, self.y1, self.warnings)
        self.dove.fit_length(*self.s_range())

    def s_range(self):
        return (self.y0, self.y1) if self.dove.axis == "y" else (self.bx0, self.bx1)

    def prong_tip(self, p):
        if p["side"] == "through":
            if self.flush:
                return self.x_out["b"] - self.cfg["head"]["inset"]
            return self.x_out["b"] + self.cfg["through_protrusion"]
        if p["side"] == "a":
            return -self.dw / 2 + p["length"]
        return self.dw / 2 - p["length"]

    def body(self):
        cfg = self.cfg
        s0, s1 = self.s_range()
        part = block(self.bx0, self.bx1, self.y0, self.y1, 0, self.D)
        frame = cfg["base"]["frame"]
        if frame and self.E > 2 * frame and self.y1 - self.y0 > 2 * frame:
            window = block(-self.E / 2 + frame, self.E / 2 - frame, self.y0 + frame, self.y1 - frame, -1, self.D + 1)
            part -= window - self.dove.strips(s0, s1, self.D)
        for s in self.sides:
            part += block(self.x_in[s], self.x_out[s], self.y0, self.y1, self.D - 0.01, self.D + self.wall_h)
        for p in self.prongs:
            z0 = self.z_dev + p["offset"]
            z1 = z0 + p["thickness"]
            sides = ("a", "b") if p["side"] == "through" else (p["side"],)
            for s in sides:
                sign = -1 if s == "a" else 1
                part -= block(self.x_out[s] + sign, self.x_in[s] - sign,
                              p["y"] - p["width"] / 2 - self.c, p["y"] + p["width"] / 2 + self.c,
                              z0 - self.c, z1 + self.c)
        sc = cfg["screw"]
        for g in self.groups:
            s = g["side"]
            depth = self.T - 1.0
            x_end = self.x_out[s] + (depth if s == "a" else -depth)
            for y in g["screw_y"]:
                part -= x_cylinder(self.x_out[s] - (0.5 if s == "a" else -0.5), x_end, y, g["screw_z"], sc["pilot"])
        part -= self.dove.channel_cuts(s0, s1, self.D)
        return part

    def comb(self, g):
        s = g["side"]
        hd = self.cfg["head"]
        xo = self.x_out[s]
        if self.flush:
            part = None
            hx0 = hx1 = xo + (hd["inset"] if s == "a" else -hd["inset"])
        else:
            hx0, hx1 = (xo - hd["thickness"], xo) if s == "a" else (xo, xo + hd["thickness"])
            part = block(hx0, hx1, g["y0"], g["y1"], g["z0"], g["bar_z1"])
        for p in g["prongs"]:
            tip = self.prong_tip(p)
            root = hx0 if s == "a" else hx1
            if (s == "a" and tip <= xo) or (s == "b" and tip >= xo):
                raise ConfigError(f"prong {p['label']}: length {p['length']} does not reach past the wall")
            shaft = block(root, tip, p["y"] - p["width"] / 2, p["y"] + p["width"] / 2, g["z0"], g["z1"])
            ch = min(p["tip_chamfer"], p["thickness"] / 3)
            if ch > 0:
                tip_edges = shaft.edges().filter_by(Axis.Y).group_by(Axis.X)[-1 if s == "a" else 0]
                shaft = chamfer(tip_edges, ch)
            part = shaft if part is None else part + shaft
        sc = self.cfg["screw"]
        for y in g["screw_y"]:
            part -= x_cylinder(hx0 - 1, hx1 + 1, y, g["screw_z"], sc["clearance"])
        return part

    def parts(self):
        out = [("adapter", self.body())]
        out += [(f"prongs_{g['name']}", self.comb(g)) for g in self.groups]
        return out

    def check(self):
        a_spans = [(p["y"] - p["width"] / 2, p["y"] + p["width"] / 2, p["length"]) for p in self.prongs if p["side"] == "a"]
        for p in self.prongs:
            if p["side"] != "b":
                continue
            for lo, hi, la in a_spans:
                if p["y"] - p["width"] / 2 < hi and p["y"] + p["width"] / 2 > lo and la + p["length"] > self.dw:
                    self.warnings.append(f"prong {p['label']} (side B) meets a side A prong inside the device")
        if not self.flush and self.T - 1.0 < 4:
            self.warnings.append("walls thinner than 5 mm leave little thread length for the retaining screws")

    def strength(self):
        st = self.cfg["strength"]
        mass = float(self.cfg["device"]["mass"] or 0)
        rows = []
        if mass <= 0:
            return rows
        load = mass * 9.81 * st["load_factor"] / len(self.prongs)
        for p in self.prongs:
            if p["side"] == "through":
                moment = load * self.E / 8
                kind = f"beam {self.E:.0f}"
            else:
                moment = load * p["length"]
                kind = f"cantilever {p['length']:.0f}"
            stress = 6 * moment / (p["width"] * p["thickness"] ** 2)
            rows.append((p["label"], p["side"], kind, load, stress, stress <= st["allowable"]))
        return rows

    def report_lines(self, parts):
        cfg = self.cfg
        depth = self.wall_h - cfg["fit"]["top"]
        lines = [f"walls        {sorted(self.sides)}, {self.T:.1f} thick, reach {depth:.1f} mm below the device top, base {self.D:.1f} thick"]
        for g in self.groups:
            if self.flush:
                retention = "flush with the walls, held in by the device (no screws)"
            else:
                retention = f"{len(g['screw_y'])} retaining screw(s) <= {cfg['head']['thickness'] + self.T - 1.0:.0f} mm"
            lines.append(f"prong part {g['name']:<3} side {g['side'].upper()}, {len(g['prongs'])} prong(s), {retention}")
        rows = self.strength()
        if rows:
            lines.append(f"strength     {cfg['device']['mass']} kg device, load factor {cfg['strength']['load_factor']}, allowable {cfg['strength']['allowable']} MPa")
            for label, side, kind, load, stress, ok in rows:
                lines.append(f"  prong {label:<6} {side:<7} {kind:<14} {load:6.1f} N  {stress:5.1f} MPa  {'ok' if ok else 'TOO HIGH'}")
        return lines

    def device_ghost(self):
        dev = self.cfg["device"]
        length = dev["length"] or (self.y1 - self.y0 + 40)
        return (-self.dw / 2, self.dw / 2, -length / 2, length / 2, self.z_dev, self.z_dev + dev["height"])


class PlateAdapter:
    """Flat plate with the dovetail channel on top and screw holes for the device underneath."""

    def __init__(self, cfg, dove):
        self.cfg = cfg
        self.dove = dove
        self.warnings = []
        pc = cfg["plate"]
        self.L = float(pc["length"])
        self.W = float(pc["width"])
        self.D = base_thickness(cfg, dove)
        self.holes = [(float(x), float(y)) for x, y in pc["holes"]]
        self.hole_d = float(pc["hole"])
        self.hole_head = max(float(pc["head"]), self.hole_d)
        if self.dove.axis == "y":
            self.dove.check_across(-self.W / 2, self.W / 2, self.warnings)
        else:
            self.dove.check_across(-self.L / 2, self.L / 2, self.warnings)
        self.dove.fit_length(*self.s_range())
        for x, y in self.holes:
            r = self.hole_head / 2
            if abs(x) + r > self.W / 2 or abs(y) + r > self.L / 2:
                raise ConfigError(f"plate hole ({x}, {y}) is outside the plate")
            for x0, x1, y0, y1 in self.dove.strip_rects(*self.s_range()):
                if x0 - r < x < x1 + r and y0 - r < y < y1 + r:
                    raise ConfigError(f"plate hole ({x}, {y}) collides with the rail channel, move it or the rail")

    def s_range(self):
        return (-self.L / 2, self.L / 2) if self.dove.axis == "y" else (-self.W / 2, self.W / 2)

    def body(self):
        part = block(-self.W / 2, self.W / 2, -self.L / 2, self.L / 2, 0, self.D)
        r, rh = self.hole_d / 2, self.hole_head / 2
        for x, y in self.holes:
            part -= Pos(x, y, -1) * Cylinder(r, self.D + 2, align=CMIN)
            if rh > r:
                part -= Pos(x, y, -0.01) * Cone(rh, r, rh - r, align=CMIN)
        part -= self.dove.channel_cuts(*self.s_range(), self.D)
        return part

    def parts(self):
        return [("adapter", self.body())]

    def check(self):
        pass

    def report_lines(self, parts):
        kind = "countersunk from the rail side" if self.hole_head > self.hole_d else "pilot/through"
        return [f"plate        {self.W:.1f} x {self.L:.1f} x {self.D:.1f} mm, {len(self.holes)} hole(s) d{self.hole_d} {kind}"]

    def device_ghost(self):
        dev = self.cfg["device"]
        return (-self.W / 2, self.W / 2, -self.L / 2, self.L / 2, self.D, self.D + dev["height"])


def render_preview(path, title, assembly, ghost, print_parts):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Line3DCollection, Poly3DCollection
    import numpy as np

    light = np.array([0.4, -0.5, 0.75])
    light /= np.linalg.norm(light)

    def polys(shape, color, flip):
        verts, tris = shape.tessellate(0.2, 0.3)
        pts = np.array([[v.X, v.Y, v.Z] for v in verts])
        if flip:
            pts = pts * np.array([1, -1, -1])
        tri = pts[np.array(tris)]
        n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        shade = 0.45 + 0.55 * np.clip(np.abs(n @ light), 0, 1)
        return tri, np.clip(np.outer(shade, color), 0, 1)

    def draw(ax, items, flip, box_lines=None, elev=25, azim=-55):
        tris, cols = [], []
        for shape, color in items:
            t, c = polys(shape, np.array(color), flip)
            tris.append(t)
            cols.append(c)
        tris = np.concatenate(tris)
        cols = np.concatenate(cols)
        ax.add_collection3d(Poly3DCollection(tris, facecolors=cols, edgecolors="none"))
        allp = tris.reshape(-1, 3)
        if box_lines is not None:
            ax.add_collection3d(Line3DCollection(box_lines, colors=(0.2, 0.4, 0.8, 0.6), linewidths=0.8, linestyles="--"))
            allp = np.vstack([allp, box_lines.reshape(-1, 3)])
        lo, hi = allp.min(axis=0), allp.max(axis=0)
        ax.set_xlim(lo[0], hi[0])
        ax.set_ylim(lo[1], hi[1])
        ax.set_zlim(lo[2], hi[2])
        ax.set_box_aspect(np.maximum(hi - lo, 1))
        ax.view_init(elev=elev, azim=azim)
        ax.set_xlabel("X")
        ax.set_ylabel("Y")

    x0, x1, y0, y1, z0, z1 = ghost
    corners = np.array([[x, y, z] for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)])
    edges = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]
    lines = np.array([[corners[a], corners[b]] for a, b in edges]) * np.array([1, -1, -1])

    fig = plt.figure(figsize=(16, 6.5))
    fig.suptitle(title)
    ax = fig.add_subplot(1, 3, 1, projection="3d")
    ax.set_title("Mounted (desk on top, device dashed)")
    draw(ax, assembly, True, lines, elev=18, azim=-60)
    ax = fig.add_subplot(1, 3, 2, projection="3d")
    ax.set_title("Mounted, seen from below")
    draw(ax, assembly, True, lines, elev=-35, azim=-120)
    ax = fig.add_subplot(1, 3, 3, projection="3d")
    ax.set_title("Print layout (no supports)")
    draw(ax, print_parts, False, elev=35, azim=-60)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


GREY = (0.66, 0.67, 0.66)
RAIL = (1.0, 0.83, 0.0)
PALETTE = [(0.23, 0.23, 0.23), (0.88, 0.48, 0.0), (0.18, 0.44, 0.87), (0.76, 0.22, 0.23)]


class Result:
    """Everything one config produces: parts in adapter (assembly) coordinates and in print orientation."""

    def __init__(self, name, cfg, dove, adapter, parts, rail, rails):
        self.name = name
        self.cfg = cfg
        self.dove = dove
        self.adapter = adapter
        self.parts = parts
        self.rail = rail
        self.rails = rails
        self.warnings = adapter.warnings
        self.printed = [(label, Pos(0, 0, -part.bounding_box().min.Z) * part) for label, part in parts]
        self.printed.append(("rail", rail))

    @property
    def body(self):
        return self.parts[0][1]

    def side_of(self, label):
        for g in getattr(self.adapter, "groups", []):
            if label == f"prongs_{g['name']}":
                return g["side"]
        return None

    def count_of(self, label):
        return len(self.dove.positions) if label == "rail" else 1

    def color_of(self, label):
        if label == "adapter":
            return GREY
        if label == "rail":
            return RAIL
        prongs = [n for n, _ in self.parts[1:]]
        return PALETTE[prongs.index(label) % len(PALETTE)]

    def layout(self):
        """Printed parts in a row next to each other, one rail per rail position."""
        items, next_x = [], None
        for label, part in self.printed:
            for _ in range(self.count_of(label)):
                bb = part.bounding_box()
                if next_x is None:
                    laid = part
                    next_x = bb.max.X + 10
                else:
                    laid = Pos(next_x - bb.min.X, -bb.center().Y, 0) * part
                    next_x += bb.size.X + 10
                items.append((label, laid))
        return items


def load_config(path):
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    return raw, raw.get("name") or Path(path).stem


def generate(raw, name):
    cfg = merge(DEFAULTS, raw or {})
    dove = Dovetail(cfg)
    kind = str(cfg["adapter"]).lower()
    if kind == "prongs":
        adapter = ProngAdapter(cfg, dove)
    elif kind == "plate":
        adapter = PlateAdapter(cfg, dove)
    else:
        raise ConfigError(f"adapter must be prongs or plate, got {cfg['adapter']!r}")
    adapter.check()
    parts = adapter.parts()
    body = parts[0][1]
    rail = dove.rail()
    rails = dove.placed_rails(rail, adapter.s_range()[0])
    for label, part in parts[1:] + [(f"rail {i}", r) for i, r in enumerate(rails)]:
        clash = (part & body).volume
        if clash > 0.01:
            adapter.warnings.append(f"{label} intersects the adapter ({clash:.2f} mm3)")
    for i, r in enumerate(rails):
        for n, p in parts[1:]:
            if (r & p).volume > 0.01:
                adapter.warnings.append(f"rail {i} intersects {n}")
    res = Result(name, cfg, dove, adapter, parts, rail, rails)
    bed = sorted(float(v) for v in cfg["printer"]["bed"])
    for label, part in res.printed:
        size = sorted([part.bounding_box().size.X, part.bounding_box().size.Y])
        if size[0] > bed[0] or size[1] > bed[1]:
            fits_diag = size[1] <= math.hypot(*bed) - size[0]
            adapter.warnings.append(f"{label} ({size[1]:.0f} x {size[0]:.0f}) exceeds the {bed[1]:.0f} x {bed[0]:.0f} bed"
                                    + (", might fit diagonally" if fits_diag else ""))
    return res


def export(res, out_root, preview=True):
    out = Path(out_root) / res.name
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for label, part in res.printed:
        export_stl(part, str(out / f"{res.name}_{label}.stl"))
    export_step(Compound(children=[p for _, p in res.parts] + res.rails), str(out / f"{res.name}_assembly.step"))
    if preview:
        assembly = [(p, res.color_of(n)) for n, p in res.parts] + [(r, RAIL) for r in res.rails]
        layout = [(p, res.color_of(n)) for n, p in res.layout()]
        render_preview(out / f"{res.name}_preview.png", res.name, assembly, res.adapter.device_ghost(), layout)
    (out / f"{res.name}_report.txt").write_text(report_text(res) + "\n", encoding="utf-8")
    return out


def material_cm3(res):
    return sum(part.volume * res.count_of(label) for label, part in res.printed) / 1000


def report_lines(res):
    cfg, dove = res.cfg, res.dove
    lines = []
    for label, part in res.printed:
        bb = part.bounding_box()
        lines.append(f"{label:<12} {res.count_of(label)} x {bb.size.X:.1f} x {bb.size.Y:.1f} x {bb.size.Z:.1f} mm, {part.volume / 1000:.1f} cm3 each")
    lines += res.adapter.report_lines(res.printed)
    rh = cfg["rail"]["holes"]
    n_holes = 2 * len(dove.holes_y(dove.length))
    lines.append(f"rail         {len(dove.positions)} rail(s) {dove.length:.0f} mm long, slide along {dove.axis.upper()}, "
                 f"{n_holes} desk screws d{rh['diameter']} (countersunk d{rh['head']}) per rail")
    lines.append(f"locking      {locking_text(res)}")
    total = material_cm3(res)
    lines.append(f"material     {total:.1f} cm3 total (~{total * 1.24:.0f} g PLA / {total * 1.27:.0f} g PETG solid)")
    for w in res.warnings:
        lines.append(f"WARNING      {w}")
    return lines


def locking_text(res):
    dove = res.dove
    lock = []
    if dove.detent > 0:
        lock.append(f"click detent {dove.detent_dist:.0f} mm before the stop")
    if dove.lock:
        lock.append(f"lock screw d~{res.cfg['screw']['clearance'] - 0.4:.0f} x {dove.stop + 8:.0f} mm through the adapter front")
    return ", ".join(lock) if lock else "none (friction only)"


def report_text(res):
    return "\n".join([f"== {res.name} =="] + report_lines(res))


def build(config_path, out_root, preview=True):
    raw, name = load_config(config_path)
    res = generate(raw, name)
    export(res, out_root, preview)
    print(report_text(res))
    print()
    return res


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("configs", nargs="*", help="YAML config files (default: configs/*.yaml)")
    ap.add_argument("--out", default=str(ROOT / "out"), help="output folder")
    ap.add_argument("--no-preview", action="store_true", help="skip the PNG preview")
    args = ap.parse_args()
    configs = args.configs or sorted(str(p) for p in (ROOT / "configs").glob("*.yaml"))
    failed = False
    for path in configs:
        try:
            build(path, args.out, not args.no_preview)
        except ConfigError as e:
            print(f"{path}: {e}", file=sys.stderr)
            failed = True
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
