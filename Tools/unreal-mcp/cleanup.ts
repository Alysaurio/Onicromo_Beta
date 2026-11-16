/**
 * cleanup.ts — Elimina las 3 constantes huérfanas creadas por los scripts anteriores.
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
const COMMAND_PORT = 6790;

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
    console.error("[cleanup] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[cleanup] Editor conectado por TCP");
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
    console.error("[cleanup] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json, traceback

resultado = {"ok": False, "cambios": [], "errores": []}

try:
    mat_path = "/Game/Materiales/Lab/Cristal/M_Cristal_Lab14"
    mat = unreal.load_asset(mat_path)
    if mat is None:
        resultado["errores"].append("No se pudo cargar el material")
    else:
        resultado["material"] = mat.get_path_name()
        mel = unreal.MaterialEditingLibrary

        exprs = mel.get_material_expressions(mat)
        resultado["cambios"].append("Expresiones antes: " + str(len(exprs) if exprs else 0))

        # Eliminar todas las constantes huérfanas
        constantes = [e for e in (exprs or []) if e.get_class().get_name() == "MaterialExpressionConstant"]
        resultado["cambios"].append("Constantes encontradas: " + str(len(constantes)))

        eliminadas = 0
        for c in constantes:
            try:
                mel.delete_material_expression(mat, c)
                eliminadas += 1
            except Exception as e:
                resultado["errores"].append("Eliminar: " + str(e)[:100])
        resultado["cambios"].append("Constantes eliminadas: " + str(eliminadas))

        # Verificar que quedan las expresiones originales (no constantes)
        exprs2 = mel.get_material_expressions(mat)
        no_const = [e for e in (exprs2 or []) if e.get_class().get_name() != "MaterialExpressionConstant"]
        resultado["cambios"].append("Expresiones despues: " + str(len(exprs2) if exprs2 else 0))
        resultado["cambios"].append("Expresiones no-constantes: " + str(len(no_const)))
        for e in no_const:
            resultado["cambios"].append("  - " + e.get_class().get_name() + " / " + e.get_name())

        guardado = unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
        resultado["saved"] = bool(guardado)
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
  console.error("[cleanup] Excepcion:", err);
  process.exit(1);
});
