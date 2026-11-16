/**
 * reparent_and_clean.ts — Reparenta BP_TopDownCharacter a Onicromo_BetaCharacter
 * y limpia las variables de prueba añadidas durante la investigación.
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
const COMMAND_PORT = 6800;

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
    console.error("[reparent] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[reparent] Editor conectado por TCP");
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
    console.error("[reparent] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json, traceback

resultado = {"ok": False, "cambios": [], "errores": [], "saved": False}

try:
    bp_path = "/Game/TopDown/Blueprints/BP_TopDownCharacter"
    bp = unreal.load_asset(bp_path)
    if bp is None:
        resultado["errores"].append("No se pudo cargar BP_TopDownCharacter")
    else:
        resultado["cambios"].append("BP cargado: " + bp.get_path_name())
        mel = unreal.BlueprintEditorLibrary

        # 1. Eliminar variable de prueba TestVar
        try:
            all_vars = mel.list_member_variable_names(bp)
            for v in all_vars:
                if str(v) == "TestVar":
                    # No hay método directo para eliminar variable miembro,
                    # pero podemos intentar cambiar su tipo o dejarla
                    resultado["cambios"].append("Variable TestVar encontrada (no se puede eliminar fácilmente)")
                    break
        except Exception as e:
            resultado["errores"].append("Eliminar TestVar ERROR: " + str(e)[:100])

        # 2. Eliminar función de prueba TestFunction
        try:
            mel.remove_function_graph(bp, "TestFunction")
            resultado["cambios"].append("Función TestFunction eliminada")
        except Exception as e:
            resultado["errores"].append("remove_function_graph TestFunction ERROR: " + str(e)[:100])

        # 3. Reparentar BP a Onicromo_BetaCharacter
        cpp_class = unreal.load_class(None, "/Script/Onicromo_Beta.Onicromo_BetaCharacter")
        if cpp_class:
            try:
                mel.reparent_blueprint(bp, cpp_class)
                resultado["cambios"].append("Reparentado a Onicromo_BetaCharacter: OK")
            except Exception as e:
                resultado["errores"].append("reparent_blueprint ERROR: " + str(e)[:300])
        else:
            resultado["errores"].append("Clase C++ Onicromo_BetaCharacter no encontrada")

        # 4. Verificar que AnimBlueprint sigue asignado (vía subobject data)
        sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)
        for h in handles:
            data = sds.k2_find_subobject_data_from_handle(h)
            exp = data.export_text()
            if 'ObjectName=' in exp:
                nombre = exp.split('ObjectName=')[1].split('"')[0]
                clase = exp.split('Class=')[1].split('"')[0] if 'Class=' in exp else '?'
                if 'SkeletalMeshComponent' in clase and (nombre == 'Mesh' or 'Mesh' in nombre):
                    tmpl_path = exp.split('WeakObjectPtr="')[1].split('"')[0] if 'WeakObjectPtr="' in exp else None
                    if tmpl_path:
                        mesh = unreal.load_object(None, tmpl_path)
                        if mesh:
                            try:
                                abp = mesh.get_editor_property("anim_class")
                                resultado["cambios"].append("AnimBlueprint: " + str(abp.get_path_name() if abp else "None"))
                            except:
                                pass
                    break

        # 5. Compilar el BP
        try:
            mel.compile_blueprint(bp)
            resultado["cambios"].append("BP compilado: OK")
        except Exception as e:
            resultado["errores"].append("compile_blueprint ERROR: " + str(e)[:200])

        # 6. Guardar
        try:
            guardado = unreal.EditorAssetLibrary.save_asset(bp.get_path_name())
            resultado["saved"] = bool(guardado)
            resultado["cambios"].append("BP guardado: " + str(guardado))
        except Exception as e:
            resultado["errores"].append("Guardar ERROR: " + str(e)[:200])

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
  console.error("[reparent] Excepcion:", err);
  process.exit(1);
});
