#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
remote_client.py — Cliente CLI para ejecutar Python dentro del editor Unreal.

Habla el protocolo oficial "Python Remote Execution v1" del plugin
PythonScriptPlugin (UDP multicast 239.0.0.1:6766 + canal TCP 127.0.0.1:6776),
reutilizando el remote_execution.py del motor.

Uso:
    python remote_client.py "print('hola')"
    python remote_client.py @ruta/script.py
    python remote_client.py --mode EvaluateStatement "1 + 1"
    python remote_client.py --filter Onicromo_Beta --wait 20 @script.py

Requisitos: UnrealEditor abierto con el proyecto y Remote Execution activado
(Config/DefaultEngine.ini -> bRemoteExecution=True).

Salida: imprime en stdout un JSON {success, result, output} y el texto
devuelto por el editor. Código de salida 0 si success, 1 si no.
"""
import argparse
import json
import logging
import os
import sys

DEFAULT_UE_ROOT = r"C:\Program Files\Epic Games\UE_5.8"
UE_REMOTE_PY = os.path.join(
    DEFAULT_UE_ROOT,
    "Engine", "Plugins", "Experimental", "PythonScriptPlugin", "Content", "Python",
)


def load_remote_execution():
    path = UE_REMOTE_PY
    if not os.path.isdir(path):
        sys.stderr.write("No se encuentra el Python del motor en: %s\n" % path)
        sys.exit(2)
    if path not in sys.path:
        sys.path.insert(0, path)
    import remote_execution as re  # noqa: E402 (módulo del motor)
    return re


def main():
    ap = argparse.ArgumentParser(description="Ejecuta Python en el editor Unreal (remote execution).")
    ap.add_argument("code", help="Código Python, o @archivo para leerlo de un fichero.")
    ap.add_argument("--mode", default="ExecuteFile",
                    choices=["ExecuteFile", "ExecuteStatement", "EvaluateStatement"])
    ap.add_argument("--filter", default="Onicromo_Beta",
                    help="Subcadena para elegir nodo editor (nombre de proyecto).")
    ap.add_argument("--wait", type=float, default=15.0,
                    help="Segundos máximos de espera del editor en descubrirse.")
    ap.add_argument("--json", action="store_true",
                    help="Imprime solo el JSON del resultado.")
    args = ap.parse_args()

    code = args.code
    if code.startswith("@"):
        with open(code[1:], "r", encoding="utf-8") as fh:
            code = fh.read()

    remote_execution = load_remote_execution()
    remote_execution.set_log_level(logging.ERROR)

    session = remote_execution.RemoteExecution()
    session.start()
    try:
        # --- 1) Descubrimiento del nodo editor ---
        import time
        deadline = time.time() + args.wait
        nodes = []
        while time.time() < deadline:
            nodes = session.remote_nodes
            if nodes:
                break
            time.sleep(0.2)
        if not nodes:
            sys.stderr.write(
                "No se detectó ningún editor Unreal con Remote Execution activo "
                "(multicast 239.0.0.1:6766, espera %.0fs).\n"
                "Checklist: editor abierto, PythonScriptPlugin habilitado, "
                "bRemoteExecution=True y reinicio del editor.\n" % args.wait
            )
            sys.exit(3)

        node = None
        for n in nodes:
            if args.filter and args.filter in json.dumps(n, default=str):
                node = n
                break
        if node is None:
            node = nodes[0]
        sys.stderr.write("[remote] nodo: %s %s\n" % (
            node.get("node_id", "?"), json.dumps({k: v for k, v in node.items() if k != "node_id"}, default=str)))

        # --- 2) Canal TCP de comandos (el editor conecta hacia nosotros) ---
        session.open_command_connection(node["node_id"])

        # --- 3) Ejecución ---
        result = session.run_command(code, unattended=True, exec_mode=args.mode)

        output_arr = result.get("output") or []
        if isinstance(output_arr, list):
            output_text = "".join(
                (e.get("output", "") if e.get("type", "Info") == "Info"
                 else "[%s] %s" % (e.get("type"), e.get("output", "")))
                for e in output_arr if isinstance(e, dict)
            )
        else:
            output_text = str(output_arr)

        payload = {
            "success": bool(result.get("success")),
            "result": result.get("result"),
            "output": output_text,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False))
        else:
            if output_text:
                sys.stdout.write(output_text)
                if not output_text.endswith("\n"):
                    sys.stdout.write("\n")
            if payload["result"]:
                sys.stdout.write("--- result ---\n%s\n" % payload["result"])
            if not payload["success"]:
                sys.stdout.write("*** EL COMANDO FALLÓ ***\n")
        sys.exit(0 if payload["success"] else 1)
    finally:
        try:
            session.stop()
        except Exception:
            pass


if __name__ == "__main__":
    main()
