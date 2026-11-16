/**
 * fix_reflections.ts — Reduce reflectos del material cristal usando MaterialEditingLibrary.
 * Siempre imprime el marcador ###MCP### incluso si hay errores.
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
const COMMAND_PORT = 6784;

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
    console.error("[fix] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[fix] Editor conectado por TCP");
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
    console.error("[fix] ERROR: El editor no abrió el canal TCP.");
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

        # 1. Ver MaterialEditingLibrary
        mel = unreal.MaterialEditingLibrary
        resultado["cambios"].append("MaterialEditingLibrary disponible: " + str(mel is not None))

        # 2. Listar métodos de MaterialEditingLibrary relacionados con expressions
        mel_methods = [m for m in dir(mel) if not m.startswith('_') and ('expression' in m.lower() or 'material' in m.lower())]
        resultado["cambios"].append("Metodos MEL relevantes: " + str(mel_methods[:20]))

        # 3. Intentar obtener expresiones del material
        try:
            exprs = mel.get_material_expressions(mat)
            resultado["cambios"].append("Num expresiones: " + str(len(exprs) if exprs else 0))
            if exprs:
                for e in exprs:
                    resultado["cambios"].append("  Expr: " + e.get_class().get_name() + " / " + e.get_name())
        except Exception as e:
            resultado["errores"].append("get_material_expressions: " + str(e))

        # 4. Intentar encontrar Main Material Output
        try:
            main = mel.get_material_expression_by_name(mat, "MainMaterialOutput")
            if main:
                resultado["cambios"].append("MainMaterialOutput encontrado: " + str(main))
                # Ver pines de entrada
                for pin in ["Specular", "Roughness", "Opacity", "Emissive", "Metallic", "BaseColor", "Normal"]:
                    try:
                        connected = main.get_input(pin)
                        if connected:
                            resultado["cambios"].append("  " + pin + " <- " + connected.get_class().get_name() + " / " + connected.get_name())
                        else:
                            resultado["cambios"].append("  " + pin + " <- (nada)")
                    except Exception as pe:
                        resultado["errores"].append("Pin " + pin + ": " + str(pe))
            else:
                resultado["errores"].append("MainMaterialOutput no encontrado")
        except Exception as e:
            resultado["errores"].append("get_material_expression_by_name: " + str(e))

        # 5. Intentar crear una constante para Specular y conectarla
        try:
            const_spec = mel.new_material_expression(mat, unreal.MaterialExpressionConstant, -400, 0)
            const_spec.set_editor_property("R", 0.15)
            resultado["cambios"].append("Constante Specular creada: R=0.15")
        except Exception as e:
            resultado["errores"].append("Crear constante Specular: " + str(e))

        guardado = unreal.EditorAssetLibrary.save_asset(mat.get_path_name())
        resultado["saved"] = bool(guardado)
        resultado["ok"] = True

except Exception as e:
    resultado["errores"].append("Excepcion general: " + traceback.format_exc())

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
  console.error("[fix] Excepcion:", err);
  process.exit(1);
});
