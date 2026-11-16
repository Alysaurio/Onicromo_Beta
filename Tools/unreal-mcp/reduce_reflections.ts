/**
 * reduce_reflections.ts — Reduce los reflectos del material cristal.
 *
 * Ajusta Specular (bajo) y Roughness (alto) para que el cristal no refleje demasiado.
 * También inspecciona el grafo para ver si hay nodos conectados a Specular/Roughness
 * del Main Material Output.
 *
 * Uso:
 *   deno run -A Tools/unreal-mcp/reduce_reflections.ts
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
const COMMAND_PORT = 6777;

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

  console.log("[reduce_reflections] Enviando ping UDP multicast...");
  const discoveryDeadline = Date.now() + 15000;
  while (!editorId && Date.now() < discoveryDeadline) {
    sendUdp(udp, { type: TYPE_PING });
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!editorId) {
    console.error("[reduce_reflections] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[reduce_reflections] Editor conectado por TCP");
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
    console.error("[reduce_reflections] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json

mat_path = "/Game/Materiales/Lab/Cristal/M_Cristal_Lab14"
mat = unreal.load_asset(mat_path)

payload = {"ok": False, "material": mat_path}

if mat is None:
    payload["error"] = "No se pudo cargar el material: " + mat_path
else:
    payload["material_name"] = mat.get_path_name()
    cambios = []

    # Ver propiedades actuales antes
    try:
        sm = mat.get_editor_property("shading_model")
        bm = mat.get_editor_property("blend_mode")
        ts = mat.get_editor_property("two_sided")
        print("Antes -> shading_model:", sm, " blend_mode:", bm, " two_sided:", ts)
    except Exception as e:
        print("No se pudieron leer propiedades previas:", e)

    # 1) Specular bajo = menos reflejo especular brillante
    try:
        mat.set_editor_property("specular", 0.15)
        cambios.append("specular: -> 0.15")
    except Exception as e:
        cambios.append("specular ERROR: " + str(e))

    # 2) Roughness alto = reflejo difuso/difuminado, no espejo
    try:
        mat.set_editor_property("roughness", 0.85)
        cambios.append("roughness: -> 0.85")
    except Exception as e:
        cambios.append("roughness ERROR: " + str(e))

    # 3) Opacidad alta (translúcido, no transparente total) para que se vea el cristal
    try:
        mat.set_editor_property("opacity", 0.85)
        cambios.append("opacity: -> 0.85")
    except Exception as e:
        cambios.append("opacity ERROR: " + str(e))

    # 4) Inspeccionar expresiones del grafo conectadas al Main Material Output
    try:
        expressions = mat.get_editor_property("expressions")
        print("\nExpresiones del grafo (" + str(len(expressions)) + "):")
        for exp in expressions:
            ename = exp.get_class().get_name()
            print("  - " + ename + " (" + exp.get_name() + ")")
            # Si es Main Material Output, ver qué está conectado a Specular/Roughness
            if ename == "MaterialExpressionMainMaterialOutput":
                for pin_name in ["Specular", "Roughness", "Opacity", "Emissive", "Metallic"]:
                    try:
                        connected = exp.get_input(pin_name)
                        if connected is not None:
                            print("     " + pin_name + " <- " + connected.get_class().get_name() + " (" + connected.get_name() + ")")
                    except Exception:
                        pass
    except Exception as e:
        print("Error inspeccionando expresiones:", e)

    guardado = unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
    payload["saved"] = bool(guardado)
    payload["cambios"] = cambios
    payload["ok"] = True

print("###MCP###" + json.dumps(payload, default=str))
`;

  const resultado = await new Promise<Record<string, unknown>>((resolve, reject) => {
    pendingResult = (data) => {
      tcpServer.close();
      udp.close();
      resolve(data);
    };
    const timer = setTimeout(() => {
      if (pendingResult) {
        pendingResult = null;
        tcpServer.close();
        udp.close();
        reject(new Error("Timeout esperando resultado del editor (30 s)"));
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

  const outputArr: Array<{ type: string; output: string }> = (resultado as any).output ?? [];
  let parsedPayload: Record<string, unknown> | null = null;
  for (const out of outputArr) {
    console.log("[editor output] " + out.output.trim());
    const idx = out.output.indexOf("###MCP###");
    if (idx !== -1) {
      try { parsedPayload = JSON.parse(out.output.slice(idx + "###MCP###".length)); } catch {}
    }
  }

  console.log("\n=== RESUMEN ===");
  if (parsedPayload?.ok === true) {
    console.log("Material ajustado:");
    for (const c of (parsedPayload.cambios ?? [])) {
      console.log("  - " + c);
    }
    console.log("Guardado en disco:", parsedPayload.saved);
  } else {
    console.error("No se pudieron aplicar los cambios.");
    if (parsedPayload?.error) console.error("Error:", parsedPayload.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[reduce_reflections] Excepción:", err);
  process.exit(1);
});
