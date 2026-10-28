#!/usr/bin/env sh
# Start the DeskMount UI on Linux / macOS. Creates the venv on first start.
# Extra arguments go to ui_server.py, e.g. ./start-ui.sh --host 0.0.0.0 --no-browser
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
fi
exec .venv/bin/python ui_server.py "$@"
