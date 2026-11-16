/**
 * investigate_bp_editing.ts — Investiga qué se puede hacer para editar Blueprints
 * vía Python en UE 5.8.
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
const COMMAND_PORT = 6798;

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
    console.error("[investigate] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[investigate] Editor conectado por TCP");
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
    console.error("[investigate] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json, traceback

resultado = {"ok": False, "cambios": [], "errores": [], "capabilities": {}}

try:
    bp = unreal.load_asset("/Game/TopDown/Blueprints/BP_TopDownCharacter")
    if bp is None:
        resultado["errores"].append("No se pudo cargar BP_TopDownCharacter")
    else:
        resultado["cambios"].append("BP cargado: " + bp.get_path_name())

        # 1. Ver métodos de BlueprintEditorLibrary relacionados con grafos/nodos
        mel = unreal.BlueprintEditorLibrary
        mel_methods = [m for m in dir(mel) if not m.startswith('_')]
        resultado["capabilities"]["blueprint_editor_methods"] = mel_methods

        # 2. Intentar obtener grafos del BP
        try:
            graphs = unreal.BlueprintEditorLibrary.get_graphs(bp)
            resultado["cambios"].append("Grafos obtenidos: " + str(len(graphs) if graphs else 0))
            if graphs:
                for g in graphs:
                    gname = g.get_name() if hasattr(g, 'get_name') else str(g)
                    gclass = g.get_class().get_name() if hasattr(g, 'get_class') else str(type(g))
                    resultado["cambios"].append("  Grafo: " + gname + " (" + gclass + ")")
                    # Intentar listar nodos del grafo
                    try:
                        nodes = g.get_editor_property("Nodes") if hasattr(g, 'get_editor_property') else None
                        if nodes:
                            resultado["cambios"].append("    Nodos: " + str(len(nodes)))
                    except Exception as e:
                        resultado["errores"].append("    Nodos ERROR: " + str(e)[:100])
        except Exception as e:
            resultado["errores"].append("get_graphs ERROR: " + str(e)[:200])

        # 3. Intentar obtener el grafo de evento (EventGraph)
        try:
            event_graph = unreal.BlueprintEditorLibrary.get_event_graph(bp)
            resultado["cambios"].append("EventGraph obtenido: " + str(event_graph is not None))
            if event_graph:
                try:
                    nodes = event_graph.get_editor_property("Nodes")
                    resultado["cambios"].append("  EventGraph nodos: " + str(len(nodes) if nodes else 0))
                except Exception as e:
                    resultado["errores"].append("  EventGraph nodos ERROR: " + str(e)[:100])
        except Exception as e:
            resultado["errores"].append("get_event_graph ERROR: " + str(e)[:200])

        # 4. Intentar añadir una variable miembro
        try:
            pin_type = unreal.EdGraphPinType()
            pin_type.import_text('(PinCategory="float")')
            unreal.BlueprintEditorLibrary.add_member_variable(bp, "TestVar", pin_type)
            resultado["cambios"].append("Variable miembro añadida: TestVar")
        except Exception as e:
            resultado["errores"].append("add_member_variable ERROR: " + str(e)[:200])

        # 5. Intentar añadir un grafo de función
        try:
            fg = unreal.BlueprintEditorLibrary.add_function_graph(bp, "TestFunction")
            resultado["cambios"].append("Función grafo añadido: " + str(fg is not None))
        except Exception as e:
            resultado["errores"].append("add_function_graph ERROR: " + str(e)[:200])

        # 6. Intentar añadir un event override
        try:
            pos = unreal.IntPoint(100, 100)
            ev = unreal.BlueprintEditorLibrary.add_event_override(bp, "ReceiveBeginPlay", pos)
            resultado["cambios"].append("Event override añadido: " + str(ev is not None))
        except Exception as e:
            resultado["errores"].append("add_event_override ERROR: " + str(e)[:200])

        # 7. Intentar new_object de K2Node_CallFunction
        try:
            graph = unreal.BlueprintEditorLibrary.get_event_graph(bp)
            if graph:
                node = unreal.new_object(unreal.K2Node_CallFunction, outer=graph)
                resultado["cambios"].append("K2Node_CallFunction creado: " + str(node is not None))
                if node:
                    pins = node.get_editor_property("Pins") if hasattr(node, 'get_editor_property') else None
                    resultado["cambios"].append("    Pins: " + str(len(pins) if pins else 0))
        except Exception as e:
            resultado["errores"].append("new_object K2Node ERROR: " + str(e)[:200])

        # 8. Ver métodos de EdGraphPin
        try:
            pin_methods = [m for m in dir(unreal.BlueprintGraphPin) if not m.startswith('_')]
            resultado["capabilities"]["blueprint_graph_pin_methods"] = pin_methods
        except Exception as e:
            resultado["errores"].append("Pin methods ERROR: " + str(e)[:100])

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
  console.error("[investigate] Excepcion:", err);
  process.exit(1);
});
