"""Local web UI for the DeskMount generator.

Usage:
    python ui_server.py [--port 8765] [--no-browser]

Serves ui/ and a small JSON API on 127.0.0.1 only.
"""

import argparse
import io
import json
import os
import re
import threading
import time
import traceback
import webbrowser
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq

import deskmount as dm

ROOT = Path(__file__).parent
UI = ROOT / "ui"
CONFIGS = ROOT / "configs"
OUT = ROOT / "out"
NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
BUILD_LOCK = threading.Lock()


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def check_name(name):
    if not isinstance(name, str) or not NAME_RE.match(name):
        raise ApiError("name may only contain letters, digits, '-' and '_'")
    return name


def mesh(shape):
    verts, tris = shape.tessellate(0.1, 0.25)
    return {
        "p": [round(c, 3) for v in verts for c in (v.X, v.Y, v.Z)],
        "i": [i for t in tris for i in t],
    }


def hex_color(rgb):
    return "#" + "".join(f"{round(c * 255):02x}" for c in rgb)


def bbox(shape):
    bb = shape.bounding_box()
    return [round(bb.min.X, 2), round(bb.min.Y, 2), round(bb.min.Z, 2), round(bb.max.X, 2), round(bb.max.Y, 2), round(bb.max.Z, 2)]


def build_payload(res, ms):
    dove = res.dove
    assembly = []
    for label, part in res.parts:
        side = res.side_of(label)
        explode = [0.0, 0.0, 0.0]
        if side:
            size_x = part.bounding_box().size.X
            explode[0] = (-1 if side == "a" else 1) * (size_x * 0.6 + 15)
        assembly.append({"label": label, "role": "adapter" if label == "adapter" else "prongs", "side": side,
                         "color": hex_color(res.color_of(label)), "explode": explode, "bbox": bbox(part), **mesh(part)})
    slide = 0.6 * dove.length
    for i, rail in enumerate(res.rails):
        explode = [0.0, slide, -15.0] if dove.axis == "y" else [slide, 0.0, -15.0]
        assembly.append({"label": "rail" if len(res.rails) == 1 else f"rail {i + 1}", "role": "rail", "side": None,
                         "color": hex_color(dm.RAIL), "explode": explode, "bbox": bbox(rail), **mesh(rail)})
    layout = [{"label": label, "color": hex_color(res.color_of(label)), **mesh(part)} for label, part in res.layout()]

    s0 = res.adapter.s_range()[0]
    p0 = dove.positions[0]
    if dove.axis == "y":
        arrow = {"origin": [p0, s0 - 25, -dove.Rt / 2], "dir": [0, 1, 0]}
    else:
        arrow = {"origin": [s0 - 25, p0, -dove.Rt / 2], "dir": [1, 0, 0]}

    parts = []
    for label, part in res.printed:
        bb = part.bounding_box()
        parts.append({"label": label, "count": res.count_of(label),
                      "size": [round(bb.size.X, 1), round(bb.size.Y, 1), round(bb.size.Z, 1)],
                      "volume": round(part.volume / 1000, 1)})
    strength = []
    if hasattr(res.adapter, "strength"):
        for label, side, kind, load, stress, ok in res.adapter.strength():
            strength.append({"label": label, "side": side, "kind": kind, "load": round(load, 1),
                             "stress": round(stress, 1), "ok": ok})
    total = dm.material_cm3(res)
    return {
        "name": res.name,
        "ms": ms,
        "assembly": assembly,
        "layout": layout,
        "ghost": list(res.adapter.device_ghost()),
        "deskZ": -dove.Rt,
        "arrow": arrow,
        "bed": res.cfg["printer"]["bed"],
        "parts": parts,
        "strength": strength,
        "allowable": res.cfg["strength"]["allowable"],
        "material": {"cm3": round(total, 1), "pla": round(total * 1.24), "petg": round(total * 1.27)},
        "details": [line for line in dm.report_lines(res) if not line.startswith("WARNING")],
        "rail": {"count": len(dove.positions), "length": round(dove.length, 1), "axis": dove.axis,
                 "screws": 2 * len(dove.holes_y(dove.length))},
        "locking": dm.locking_text(res),
        "warnings": list(res.warnings),
    }


def run_generate(values, name):
    with BUILD_LOCK:
        t0 = time.perf_counter()
        res = dm.generate(values, name)
        return res, round((time.perf_counter() - t0) * 1000)


def to_yaml_node(value, top_key=None):
    if isinstance(value, dict):
        node = CommentedMap()
        for k, v in value.items():
            node[k] = to_yaml_node(v)
        return node
    if isinstance(value, list):
        seq = CommentedSeq()
        for item in value:
            child = to_yaml_node(item)
            if isinstance(child, (CommentedMap, CommentedSeq)):
                child.fa.set_flow_style()
            seq.append(child)
        if not any(isinstance(item, dict) for item in value):
            seq.fa.set_flow_style()
        return seq
    return value


def sync(target, values):
    for key in list(target.keys()):
        if key not in values:
            del target[key]
    for key, value in values.items():
        if isinstance(value, dict) and isinstance(target.get(key), CommentedMap):
            sync(target[key], value)
        else:
            target[key] = to_yaml_node(value)


def save_config(name, values):
    yaml = YAML()
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.width = 120
    path = CONFIGS / f"{name}.yaml"
    if path.exists():
        doc = yaml.load(path.read_text(encoding="utf-8")) or CommentedMap()
        sync(doc, values)
    else:
        doc = to_yaml_node(values)
        doc.yaml_set_start_comment("Created with the DeskMount UI")
    buf = io.StringIO()
    yaml.dump(doc, buf)
    path.write_text(buf.getvalue(), encoding="utf-8")
    return path


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI), **kwargs)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}")

    def handle_api(self, method):
        url = urlparse(self.path)
        route = url.path
        query = parse_qs(url.query)
        try:
            if method == "GET" and route == "/api/init":
                configs = sorted(p.stem for p in CONFIGS.glob("*.yaml"))
                return self.send_json({"configs": configs, "defaults": dm.DEFAULTS})
            if method == "GET" and route == "/api/config":
                name = check_name(query.get("name", [""])[0])
                path = CONFIGS / f"{name}.yaml"
                if not path.exists():
                    raise ApiError(f"config {name} not found", 404)
                raw, _ = dm.load_config(path)
                return self.send_json({"name": name, "values": raw})
            if method == "POST" and route == "/api/build":
                req = self.read_json()
                name = check_name(req.get("name") or "untitled")
                res, ms = run_generate(req.get("values") or {}, name)
                return self.send_json(build_payload(res, ms))
            if method == "POST" and route == "/api/save":
                req = self.read_json()
                name = check_name(req.get("name"))
                path = CONFIGS / f"{name}.yaml"
                if path.exists() and not req.get("overwrite"):
                    raise ApiError(f"config {name} already exists", 409)
                save_config(name, req.get("values") or {})
                return self.send_json({"saved": name, "configs": sorted(p.stem for p in CONFIGS.glob("*.yaml"))})
            if method == "POST" and route == "/api/export":
                req = self.read_json()
                name = check_name(req.get("name"))
                res, _ = run_generate(req.get("values") or {}, name)
                with BUILD_LOCK:
                    out = dm.export(res, OUT, preview=True)
                files = sorted(p.name for p in out.iterdir() if p.is_file())
                return self.send_json({"name": name, "files": files, "folder": str(out)})
            if method == "POST" and route == "/api/open":
                name = check_name(self.read_json().get("name"))
                folder = OUT / name
                if not folder.exists():
                    raise ApiError("nothing exported yet", 404)
                os.startfile(folder)
                return self.send_json({"opened": str(folder)})
            if method == "GET" and route.startswith("/api/zip/"):
                name = check_name(unquote(route[len("/api/zip/"):]))
                folder = OUT / name
                if not folder.exists():
                    raise ApiError("nothing exported yet", 404)
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                    for p in sorted(folder.iterdir()):
                        if p.is_file():
                            zf.write(p, p.name)
                data = buf.getvalue()
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Content-Disposition", f'attachment; filename="{name}.zip"')
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return None
            raise ApiError("unknown endpoint", 404)
        except ApiError as e:
            return self.send_json({"error": str(e)}, e.status)
        except dm.ConfigError as e:
            return self.send_json({"error": str(e), "config": True}, 422)
        except Exception as e:
            traceback.print_exc()
            return self.send_json({"error": f"{type(e).__name__}: {e}"}, 500)

    def serve_out(self):
        parts = unquote(urlparse(self.path).path).split("/")
        if len(parts) != 4:
            return self.send_error(404)
        name, file = check_name(parts[2]), parts[3]
        path = (OUT / name / file).resolve()
        if path.parent != (OUT / name).resolve() or not path.is_file():
            return self.send_error(404)
        data = path.read_bytes()
        self.send_response(200)
        ctype = {"png": "image/png", "txt": "text/plain; charset=utf-8"}.get(path.suffix[1:], "application/octet-stream")
        self.send_header("Content-Type", ctype)
        if ctype == "application/octet-stream":
            self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self.handle_api("GET")
        if self.path.startswith("/out/"):
            try:
                return self.serve_out()
            except ApiError:
                return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self.handle_api("POST")
        self.send_error(404)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://localhost:{args.port}/"
    print(f"DeskMount UI on {url} (Ctrl+C to stop)")
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
