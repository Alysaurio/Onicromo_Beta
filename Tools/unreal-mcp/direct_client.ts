/**
 * direct_client.ts — Cliente directo del protocolo "ue_py" de Unreal Engine
 * (Python Remote Execution del plugin PythonScriptPlugin).
 *
 * Implementa el lado cliente que el servidor unreal-mcp usa para hablar con el
 * editor: descubrimiento UDP multicast + canal TCP del editor→cliente.
 *
 * Uso:
 *   deno run -A Tools/unreal-mcp/direct_client.ts
 *
 * Requisitos en el editor (ya configurados en este proyecto):
 *   - Plugin PythonScriptPlugin habilitado (Onicromo_Beta.uproject)
 *   - bRemoteExecution=True en Config/DefaultEngine.ini
 *   - Editor abierto con el proyecto Onicromo_Beta
 */

import dgram from "node:dgram";
import net from "node:net";

// ---------------------------------------------------------------------------
// Constantes del protocolo (deben coincidir con remote_execution.py del engine)
// ---------------------------------------------------------------------------
const PROTOCOL_VERSION = 1;
const PROTOCOL_MAGIC = "ue_py";
const TYPE_PING = "ping";
const TYPE_PONG = "pong";
const TYPE_OPEN_CONNECTION = "open_connection";
const TYPE_CLOSE_CONNECTION = "close_connection";
const TYPE_COMMAND = "command";
const TYPE_COMMAND_RESULT = "command_result";

const MULTICAST_GROUP = "239.0.0.1";
const MULTICAST_PORT = 6766;
const MULTICAST_BIND = "127.0.0.1";
const COMMAND_PORT = 6776;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const nodeId = crypto.randomUUID();
let editorId: string | null = null;
let tcpChannel: net.Socket | null = null;
let pendingResult: ((data: Record<string, unknown>) => void) | null = null;

function sendUdp(socket: dgram.Socket, msg: Record<string, unknown>, dest?: string, port?: number): void {
  const payload: Record<string, unknown> = {
    version: PROTOCOL_VERSION,
    magic: PROTOCOL_MAGIC,
    type: msg.type,
    source: nodeId,
  };
  // El "dest" en el JSON es solo identificación lógica del nodo remoto.
  // El envío UDP siempre va al grupo multicast (el editor escucha ahí).
  if (dest) payload.dest = dest;
  if (msg.data) payload.data = msg.data;
  socket.send(encoder.encode(JSON.stringify(payload)), port ?? MULTICAST_PORT, MULTICAST_GROUP);
}

async function main(): Promise<void> {
  // --- UDP: descubrimiento ---
  const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });

  udp.on("message", (msg: Buffer) => {
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(msg.toString("utf-8")); } catch { return; }
    if (parsed.magic !== PROTOCOL_MAGIC || parsed.version !== PROTOCOL_VERSION) return;
    if (parsed.source === nodeId) return;
    if (parsed.type === TYPE_PONG) {
      editorId = parsed.source as string;
      console.log("[direct_client] Editor descubierto:", editorId);
      console.log("[direct_client] Datos del editor:", JSON.stringify(parsed.data));
    } else if (parsed.type === TYPE_COMMAND_RESULT && pendingResult) {
      const cb = pendingResult;
      pendingResult = null;
      cb(parsed.data as Record<string, unknown>);
    }
  });

  await new Promise<void>((resolve, reject) => {
    udp.bind(MULTICAST_PORT, MULTICAST_BIND, () => {
      try { udp.addMembership(MULTICAST_GROUP, MULTICAST_BIND); } catch (e) { console.warn("[direct_client] addMembership warning:", (e as Error).message); }
      resolve();
    });
    udp.once("error", reject);
  });

  // Enviar ping y esperar pong del editor
  console.log("[direct_client] Enviando ping UDP multicast a", MULTICAST_GROUP + ":" + MULTICAST_PORT);
  const discoveryDeadline = Date.now() + 15000;
  while (!editorId && Date.now() < discoveryDeadline) {
    sendUdp(udp, { type: TYPE_PING });
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!editorId) {
    console.error("[direct_client] ERROR: No se descubrió el editor por UDP multicast.");
    console.error("[direct_client] Verifica: UnrealEditor abierto con el proyecto Onicromo_Beta,");
    console.error("[direct_client] PythonScriptPlugin habilitado y bRemoteExecution=True.");
    process.exit(1);
  }

  // --- TCP: servidor para que el editor se conecte (callback) ---
  const tcpServer = net.createServer((socket) => {
    console.log("[direct_client] Editor conectado por TCP desde", socket.remoteAddress + ":" + socket.remotePort);
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
      } catch { /* mensaje TCP ilegible, ignorar */ }
    });
    socket.on("close", () => { tcpChannel = null; });
  });

  await new Promise<void>((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(COMMAND_PORT, MULTICAST_BIND, () => resolve());
  });

  // Enviar open_connection al editor para que se conecte a nuestro TCP
  console.log("[direct_client] Enviando open_connection al editor (callback TCP en", COMMAND_PORT + ")...");
  for (let attempt = 0; attempt < 8 && !tcpChannel; attempt++) {
    sendUdp(udp, { type: TYPE_OPEN_CONNECTION, data: { command_ip: MULTICAST_BIND, command_port: COMMAND_PORT } }, editorId);
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!tcpChannel) {
    console.error("[direct_client] ERROR: El editor no abrió el canal TCP hacia", MULTICAST_BIND + ":" + COMMAND_PORT);
    process.exit(1);
  }

  // --- Código Python a ejecutar en el editor ---
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

    # 1) Translúcido de verdad
    try:
        mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_Translucent)
        cambios.append("blend_mode = BLEND_Translucent")
    except Exception as e:
        cambios.append("blend_mode ERROR: " + str(e))

    # 2) Doble cara (se ve bien desde ambos lados)
    try:
        mat.set_editor_property("two_sided", True)
        cambios.append("two_sided = True")
    except Exception as e:
        cambios.append("two_sided ERROR: " + str(e))

    # 3) Sombreado estándar (apropiado para translúcido/lit)
    try:
        mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DefaultLit)
        cambios.append("shading_model = MSM_DefaultLit")
    except Exception as e:
        cambios.append("shading_model ERROR: " + str(e))

    # 4) Reducir reflectividad (si el grafo expone estos parámetros)
    for nombre, valor in [("Specular", 0.3), ("Roughness", 0.8)]:
        try:
            actual = mat.get_scalar_parameter_default_value(nombre)
            mat.set_scalar_parameter_default_value(nombre, valor)
            cambios.append("param " + nombre + ": " + str(actual) + " -> " + str(valor))
        except Exception:
            pass  # parámetro no existe en este material

    # 5) Guardar
    guardado = unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
    payload["saved"] = bool(guardado)
    payload["cambios"] = cambios
    payload["ok"] = True

print("###MCP###" + json.dumps(payload, default=str))
`;

  // Enviar comando TYPE_COMMAND y esperar resultado
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

  console.log("\n=== RESULTADO DEL EDITOR ===");
  console.log(JSON.stringify(resultado, null, 2));

  if (resultado.ok === true) {
    console.log("\n[direct_client] Material modificado y guardado con éxito.");
  } else {
    console.error("\n[direct_client] El editor reportó un error:", resultado.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[direct_client] Excepción:", err);
  process.exit(1);
});
