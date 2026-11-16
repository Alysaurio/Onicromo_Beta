/**
 * reduce_reflections_v2.ts — Reduce reflectos del material cristal.
 * Versión más robusta: imprime todo el output del editor para depurar.
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
const COMMAND_PORT = 6778;

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
      console.log("[v2] Editor descubierto:", editorId);
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
    console.error("[v2] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[v2] Editor conectado por TCP desde", socket.remoteAddress);
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
    console.error("[v2] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json

mat_path = "/Game/Materiales/Lab/Cristal/M_Cristal_Lab14"
mat = unreal.load_asset(mat_path)

print("MATERIAL:", mat.get_path_name() if mat else "NONE")

if mat is None:
    print("ERROR: no se pudo cargar el material")
else:
    # Leer valores actuales
    for p in ["blend_mode", "two_sided", "shading_model", "specular", "roughness", "opacity"]:
        try:
            v = mat.get_editor_property(p)
            print("ANTES " + p + " = " + str(v))
        except Exception as e:
            print("ANTES " + p + " ERROR: " + str(e))

    # Aplicar cambios para reducir reflectos
    try:
        mat.set_editor_property("specular", 0.15)
        print("DESPUES specular = 0.15")
    except Exception as e:
        print("specular ERROR: " + str(e))

    try:
        mat.set_editor_property("roughness", 0.85)
        print("DESPUES roughness = 0.85")
    except Exception as e:
        print("roughness ERROR: " + str(e))

    try:
        mat.set_editor_property("opacity", 0.85)
        print("DESPUES opacity = 0.85")
    except Exception as e:
        print("opacity ERROR: " + str(e))

    guardado = unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
    print("GUARDADO:", guardado)

print("###MCP###" + json.dumps({"ok": True}, default=str))
`;

  let resultadoFinal: Record<string, unknown> | null = null;
  const resultado = await new Promise<Record<string, unknown>>((resolve, reject) => {
    pendingResult = (data) => {
      resultadoFinal = data;
      tcpServer.close();
      udp.close();
      resolve(data);
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

  console.log("\n=== OUTPUT COMPLETO DEL EDITOR ===");
  const outputArr: Array<{ type: string; output: string }> = (resultado as any).output ?? [];
  let foundMarker = false;
  for (const out of outputArr) {
    const txt = out.output.trim();
    console.log(txt);
    if (txt.includes("###MCP###")) {
      foundMarker = true;
      const idx = txt.indexOf("###MCP###");
      try {
        const parsed = JSON.parse(txt.slice(idx + "###MCP###".length));
        console.log("\n=== PAYLOAD ESTRUCTURADO ===");
        console.log(JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log("No se pudo parsear el payload:", e);
      }
    }
  }

  if (!foundMarker) {
    console.log("\n(No se encontró el marcador ###MCP### en el output)");
  }

  console.log("\n=== RESULTADO BRUTO ===");
  console.log("success:", resultado.success);
  console.log("result:", resultado.result);
}

main().catch((err) => {
  console.error("[v2] Excepción:", err);
  process.exit(1);
});
