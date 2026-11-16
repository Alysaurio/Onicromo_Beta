/**
 * bp_editing_options.ts — Explora opciones para editar BP y verifica
 * si la clase C++ Onicromo_BetaCharacter está disponible.
 */

import dgram from "node:dgram";
import net from "node:net";

const PROTOCOL_VERSION = 1;
const PROTOCOL_MAGIC = "ue_py";
const TYPE_PING = "ping";
const TYPE_PONG = "pong";
const TYPE_OPEN_CONNECTION = "open_connection";
const TYPE_COMMAND = "command";
const TYPE_COMMAND_RESULT = "command_result";

const MULTICAST_GROUP = "239.0.0.1";
const MULTICAST_PORT = 6766;
const MULTICAST_BIND = "127.0.0.1";
const COMMAND_PORT = 6799;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const nodeId = crypto.randomUUID();
let editorId: string | null = null;
let tcpChannel: net.Socket | null = null;
let pendingResult: ((data: Record<string, unknown>) => void) | null = null;

function sendUdp(socket: dgram.Socket, msg: Record<string, unknown>): void {
  const payload: Record<string, unknown> = {
    version: PROTOCOL_VERSION,
    magic: PROTOCOL_MAGIC,
    type: msg.type,
    source: nodeId,
  };
  if (msg.data) payload.data = msg.data;
  socket.send(encoder.encode(JSON.stringify(payload)), MULTICAST_PORT, MULTICAST_GROUP);
}

async function main(): Promise<void> {
  const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
  udp.on("message", (msg: Buffer) => {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(msg.toString("utf-8")); } catch { return; }
    if (parsed.magic !== PROTOCOL_MAGIC || parsed.version !== PROTOCOL_VERSION) return;
    if (parsed.source === nodeId) return;
    if (parsed.type === TYPE_PONG) {
      editorId = parsed.source as string;
    } else if (parsed.type === TYPE_COMMAND_RESULT && pendingResult) {
      const cb = pendingResult;
      pendingResult = null;
      cb(parsed.data as Record<string, unknown>);
    }
  });

  await new Promise<void>((resolve, reject) => {
    udp.bind(MULTICAST_PORT, MULTICAST_BIND, () => {
      try { udp.addMembership(MULTICAST_GROUP, MULTICAST_BIND); } catch {}
      resolve();
    });
    udp.once("error", reject);
  });

  const discoveryDeadline = Date.now() + 15000;
  while (!editorId && Date.now() < discoveryDeadline) {
    sendUdp(udp, { type: TYPE_PING });
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!editorId) {
    console.error("[bp_options] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[bp_options] Editor conectado por TCP");
    tcpChannel = socket;
    socket.on("data", (chunk: Buffer) => {
      const text = decoder.decode(chunk);
      try {
        const msg = JSON.parse(text);
        if (msg.type === TYPE_COMMAND_RESULT && pendingResult) {
          const cb = pendingResult;
          pendingResult = null;
          cb(msg.data as Record<string, unknown>);
        }
      } catch {}
    });
  });

  await new Promise<void>((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(COMMAND_PORT, MULTICAST_BIND, () => resolve());
  });

  for (let attempt = 0; attempt < 8 && !tcpChannel; attempt++) {
    sendUdp(udp, { type: TYPE_OPEN_CONNECTION, data: { command_ip: MULTICAST_BIND, command_port: COMMAND_PORT } });
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!tcpChannel) {
    console.error("[bp_options] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json, traceback

resultado = {"ok": False, "cambios": [], "errores": [], "options": {}}

try:
    # 1. Verificar si la clase C++ Onicromo_BetaCharacter está disponible
    cpp_class = unreal.load_class(None, "/Script/Onicromo_Beta.Onicromo_BetaCharacter")
    resultado["options"]["cpp_class_available"] = cpp_class is not None
    if cpp_class:
        resultado["cambios"].append("Clase C++ Onicromo_BetaCharacter disponible: SI")
        resultado["cambios"].append("  Ruta: " + cpp_class.get_path_name())
    else:
        resultado["cambios"].append("Clase C++ Onicromo_BetaCharacter disponible: NO (necesita recompilar)")

    # 2. Cargar BP_TopDownCharacter
    bp = unreal.load_asset("/Game/TopDown/Blueprints/BP_TopDownCharacter")
    if bp is None:
        resultado["errores"].append("No se pudo cargar BP_TopDownCharacter")
    else:
        resultado["cambios"].append("BP cargado: " + bp.get_path_name())

        # 3. Obtener clase padre actual del BP
        try:
            bp_class = unreal.BlueprintEditorLibrary.get_blueprint_parent_class(bp)
            resultado["options"]["current_parent"] = bp_class.get_path_name() if bp_class else "None"
            resultado["cambios"].append("Clase padre actual: " + str(bp_class.get_path_name() if bp_class else "None"))
        except Exception as e:
            resultado["errores"].append("get_blueprint_parent_class ERROR: " + str(e)[:200])

        # 4. Listar grafos del BP
        try:
            graph_names = unreal.BlueprintEditorLibrary.list_graph_names(bp)
            resultado["options"]["graph_names"] = graph_names
            resultado["cambios"].append("Grafos: " + str(graph_names))
        except Exception as e:
            resultado["errores"].append("list_graph_names ERROR: " + str(e)[:200])

        # 5. Encontrar grafos específicos
        for gname in ["EventGraph", "FunctionGraph", "AnimationGraph"]:
            try:
                g = unreal.BlueprintEditorLibrary.find_graph(bp, gname)
                if g:
                    resultado["cambios"].append("Grafo encontrado: " + gname + " (" + g.get_name() + ")")
                    # Listar nodos
                    try:
                        nodes = g.get_editor_property("Nodes")
                        if nodes:
                            resultado["cambios"].append("  Nodos en " + gname + ": " + str(len(nodes)))
                            for n in nodes[:5]:
                                ntitle = n.get_node_title() if hasattr(n, 'get_node_title') else str(n)
                                resultado["cambios"].append("    - " + str(ntitle))
                    except Exception as e:
                        resultado["errores"].append("  Nodos " + gname + " ERROR: " + str(e)[:100])
                else:
                    resultado["cambios"].append("Grafo no encontrado: " + gname)
            except Exception as e:
                resultado["errores"].append("find_graph " + gname + " ERROR: " + str(e)[:100])

        # 6. Listar funciones
        try:
            funcs = unreal.BlueprintEditorLibrary.list_functions(bp)
            resultado["options"]["functions"] = [f.name for f in funcs]
            resultado["cambios"].append("Funciones: " + str([f.name for f in funcs]))
        except Exception as e:
            resultado["errores"].append("list_functions ERROR: " + str(e)[:200])

        # 7. Listar eventos
        try:
            events = unreal.BlueprintEditorLibrary.list_events(bp)
            resultado["options"]["events"] = [e.name for e in events]
            resultado["cambios"].append("Eventos: " + str([e.name for e in events]))
        except Exception as e:
            resultado["errores"].append("list_events ERROR: " + str(e)[:200])

        # 8. Listar todas las variables miembro (no nativas)
        try:
            all_vars = unreal.BlueprintEditorLibrary.list_member_variable_names(bp)
            bp_vars = [v for v in all_vars if not str(v).startswith("/Script/")]
            resultado["options"]["member_variables"] = bp_vars
            resultado["cambios"].append("Variables miembro BP: " + str(bp_vars))
        except Exception as e:
            resultado["errores"].append("list_member_variable_names ERROR: " + str(e)[:200])

        resultado["ok"] = True

except Exception as e:
    resultado["errores"].append("Excepcion: " + traceback.format_exc())

print("###MCP###" + json.dumps(resultado, default=str))
`;

  let resultadoFinal: Record<string, unknown> | null = null;
  const resultado = await new Promise<Record<string, unknown>>((resolve, reject) => {
    pendingResult = (data) => {
      resultadoFinal = data;
      setTimeout(() => {
        tcpServer.close();
        udp.close();
        resolve(data);
      }, 500);
    };
    const timer = setTimeout(() => {
      if (pendingResult) {
        pendingResult = null;
        tcpServer.close();
        udp.close();
        reject(new Error("Timeout (30 s)"));
      }
    }, 30000);
    const msg: Record<string, unknown> = {
      version: PROTOCOL_VERSION,
      magic: PROTOCOL_MAGIC,
      type: TYPE_COMMAND,
      source: nodeId,
      dest: editorId,
      data: { command: pythonCode, unattended: true, exec_mode: "ExecuteFile" },
    };
    tcpChannel!.write(encoder.encode(JSON.stringify(msg)));
  });

  console.log("\n=== OUTPUT ===");
  const outputArr: Array<{ type: string; output: string }> = (resultado as any).output ?? [];
  for (const out of outputArr) {
    console.log(out.output.trim());
  }
}

main().catch((err) => {
  console.error("[bp_options] Excepcion:", err);
  process.exit(1);
});
