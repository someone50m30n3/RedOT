#!/usr/bin/env python3
# REDoT Web Console Backend Controller

import os
import json
import subprocess
import threading
import uuid
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pathlib import Path

MODULES_DIR = Path("../modules")
LOGS_DIR = Path("../logs")
RESULTS_DIR = Path("../results")
CONFIG_EXT = ".json"

app = Flask(__name__)
CORS(app)

# Ensure directories exist
LOGS_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

executions = {}  # Stores running processes and logs


def discover_modules():
    found = []
    for pyfile in MODULES_DIR.rglob("*.py"):
        module_info = {
            "id": str(uuid.uuid4()),
            "name": pyfile.stem,
            "path": str(pyfile),
            "inputs": [],
            "output": ""
        }

        metadata_file = pyfile.with_suffix(CONFIG_EXT)
        if metadata_file.exists():
            try:
                with open(metadata_file) as f:
                    metadata = json.load(f)
                    module_info.update(metadata)
            except Exception:
                pass
        else:
            try:
                with open(pyfile) as f:
                    first_lines = "".join([next(f) for _ in range(10)])
                    if "@input" in first_lines:
                        inputs = []
                        for line in first_lines.splitlines():
                            if "-" in line:
                                parts = line.strip("- ").split(":")
                                if len(parts) == 2:
                                    inputs.append({
                                        "name": parts[0].strip(),
                                        "type": "text",
                                        "description": parts[1].strip()
                                    })
                        module_info["inputs"] = inputs
            except Exception:
                pass

        found.append(module_info)
    return found


@app.route("/api/modules", methods=["GET"])
def api_list_modules():
    return jsonify(discover_modules())


@app.route("/api/run", methods=["POST"])
def api_run_module():
    data = request.json
    module_path = data.get("path")
    inputs = data.get("inputs", {})

    if not module_path or not os.path.isfile(module_path):
        return jsonify({"error": "Invalid module path"}), 400

    args = ["python3", module_path]
    for k, v in inputs.items():
        args.append(f"--{k}")
        args.append(str(v))

    exec_id = str(uuid.uuid4())
    logfile = LOGS_DIR / f"{exec_id}.log"

    with open(logfile, "w") as out:
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

        executions[exec_id] = {"proc": proc, "log": str(logfile)}

        def stream_output():
            for line in proc.stdout:
                out.write(line)
                out.flush()
        threading.Thread(target=stream_output, daemon=True).start()

    return jsonify({"exec_id": exec_id})


@app.route("/api/output/<exec_id>", methods=["GET"])
def api_get_output(exec_id):
    info = executions.get(exec_id)
    if not info:
        return jsonify({"error": "Execution ID not found."}), 404

    logfile_path = info.get("log")
    if not logfile_path or not os.path.isfile(logfile_path):
        return jsonify({"error": "Log file not available."}), 404

    try:
        with open(logfile_path, "r") as f:
            log_data = f.read()

        proc = info.get("proc")
        done = proc.poll() is not None if proc else True

        return jsonify({
            "log": log_data,
            "done": done
        })

    except Exception as e:
        return jsonify({
            "error": f"Log read error: {str(e)}",
            "log": "",
            "done": True
        }), 500


@app.route("/api/results/<filename>", methods=["GET"])
def api_get_results(filename):
    try:
        return send_from_directory(RESULTS_DIR, filename, as_attachment=True)
    except FileNotFoundError:
        return jsonify({"error": "File not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050)
