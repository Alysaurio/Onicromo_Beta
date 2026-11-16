/**
 * fix_reflections_v2.ts — Conecta constantes al material usando nombres de propiedad como string.
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
const COMMAND_PORT = 6786;

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

resultado = {"ok": False, "cambios": [], "errores": [], "saved": False}

try:
    mat_path = "/Game/Materiales/Lab/Cristal/M_Cristal_Lab14"
    mat = unreal.load_asset(mat_path)
    if mat is None:
        resultado["errores"].append("No se pudo cargar el material")
    else:
        resultado["material"] = mat.get_path_name()
        mel = unreal.MaterialEditingLibrary

        exprs = mel.get_material_expressions(mat)
        resultado["cambios"].append("Expresiones existentes: " + str(len(exprs) if exprs else 0))

        # Buscar las constantes que creamos antes (especulamos que son las últimas 3)
        # O crear nuevas si no existen
        constantes = [e for e in (exprs or []) if e.get_class().get_name() == "MaterialExpressionConstant"]
        resultado["cambios"].append("Constantes encontradas: " + str(len(constantes)))

        # Si no hay constantes, crearlas
        if len(constantes) < 3:
            const_spec = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -600, -200)
            const_spec.set_editor_property("R", 0.15)
            constantes.append(const_spec)
            resultado["cambios"].append("Constante Specular creada (R=0.15)")

            const_rough = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -600, 0)
            const_rough.set_editor_property("R", 0.85)
            constantes.append(const_rough)
            resultado["cambios"].append("Constante Roughness creada (R=0.85)")

            const_opacity = mel.create_material_expression(mat, unreal.MaterialExpressionConstant, -600, 200)
            const_opacity.set_editor_property("R", 0.85)
            constantes.append(const_opacity)
            resultado["cambios"].append("Constante Opacity creada (R=0.85)")

        # Intentar conectar con diferentes enfoques
        # Enfoque 1: connect_material_property con nombre de propiedad como string
        conectados = 0
        for i, (const_expr, prop_name) in enumerate([(constantes[-3], "Specular"), (constantes[-2], "Roughness"), (constantes[-1], "Opacity")]):
            try:
                mel.connect_material_property(const_expr, prop_name, "")
                conectados += 1
                resultado["cambios"].append("Conectado " + prop_name + " (enfoque string)")
            except Exception as e:
                resultado["errores"].append("Conectar " + prop_name + " (string): " + str(e)[:200])

        # Enfoque 2: connect_material_expressions (conectar expresión a expresión)
        # Necesitamos encontrar el Main Material Output y conectar las constantes a sus pines
        main_output = None
        for e in (exprs or []):
            if e.get_class().get_name() == "MaterialExpressionMainMaterialOutput":
                main_output = e
                break

        if main_output:
            resultado["cambios"].append("MainMaterialOutput encontrado")
            # Intentar usar set_input en el Main Material Output
            for pin_name, const_expr in [("Specular", constantes[-3]), ("Roughness", constantes[-2]), ("Opacity", constantes[-1])]:
                try:
                    main_output.set_input(pin_name, const_expr)
                    resultado["cambios"].append("Conectado " + pin_name + " via set_input")
                except Exception as e:
                    resultado["errores"].append("set_input " + pin_name + ": " + str(e)[:200])
        else:
            resultado["errores"].append("MainMaterialOutput no encontrado")

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
