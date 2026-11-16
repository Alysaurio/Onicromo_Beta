/**
 * set_material_translucent.ts — Convierte el material /Game/Materiales/Lab/Cristal/M_Cristal_Lab14
 * en translúcido real y reduce su reflectividad.
 *
 * Usa el protocolo ue_py (Python Remote Execution) directamente, sin depender
 * del servidor Deno completo.
 *
 * Uso:
 *   deno run -A Tools/unreal-mcp/set_material_translucent.ts
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
const COMMAND_PORT = 6776;

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
      console.log("[set_material_translucent] Editor descubierto:", editorId);
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

  // Descubrir editor
  console.log("[set_material_translucent] Enviando ping UDP multicast...");
  const discoveryDeadline = Date.now() + 15000;
  while (!editorId && Date.now() < discoveryDeadline) {
    sendUdp(udp, { type: TYPE_PING });
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!editorId) {
    console.error("[set_material_translucent] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  // Servidor TCP para callback del editor
  const tcpServer = net.createServer((socket) => {
    console.log("[set_material_translucent] Editor conectado por TCP");
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
    console.error("[set_material_translucent] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  // --- Código Python (nombres de enum correctos para UE 5.8) ---
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

    # 1) Translúcido de verdad (BLEND_TRANSLUCENT en UE 5.8)
    try:
        mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
        cambios.append("blend_mode = BLEND_TRANSLUCENT")
    except Exception as e:
        cambios.append("blend_mode ERROR: " + str(e))

    # 2) Doble cara
    try:
        mat.set_editor_property("two_sided", True)
        cambios.append("two_sided = True")
    except Exception as e:
        cambios.append("two_sided ERROR: " + str(e))

    # 3) Sombreado estándar (MSM_DEFAULT_LIT en UE 5.8)
    try:
        mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
        cambios.append("shading_model = MSM_DEFAULT_LIT")
    except Exception as e:
        cambios.append("shading_model ERROR: " + str(e))

    # 4) Reducir reflectividad: bajar Specular y subir Roughness
    for nombre, valor in [("Specular", 0.3), ("Roughness", 0.8)]:
        try:
            actual = mat.get_scalar_parameter_default_value(nombre)
            mat.set_scalar_parameter_default_value(nombre, valor)
            cambios.append("param " + nombre + ": " + str(actual) + " -> " + str(valor))
        except Exception:
            pass  # parámetro no existe en este material

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

  // El resultado viene en output[0].output como JSON con marcador ###MCP###
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
    console.log("Material modificado y guardado con éxito:");
    for (const c of (parsedPayload.cambios ?? [])) {
      console.log("  - " + c);
    }
    console.log("Guardado en disco:", parsedPayload.saved);
  } else {
    console.error("El material no se modificó correctamente.");
    if (parsedPayload?.error) console.error("Error:", parsedPayload.error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[set_material_translucent] Excepción:", err);
  process.exit(1);
});
