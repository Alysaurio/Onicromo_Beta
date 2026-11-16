/**
 * fix_anim.ts — Verifica y asigna el AnimBlueprint al Mesh de BP_TopDownCharacter.
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
const COMMAND_PORT = 6796;

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
    console.error("[fix_anim] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[fix_anim] Editor conectado por TCP");
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
    console.error("[fix_anim] ERROR: El editor no abrió el canal TCP.");
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
        sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)

        # Buscar Mesh component (SkeletalMeshComponent)
        mesh_handle = None
        for h in handles:
            data = sds.k2_find_subobject_data_from_handle(h)
            exp = data.export_text()
            if 'ObjectName=' in exp:
                nombre = exp.split('ObjectName=')[1].split('"')[0]
                clase = exp.split('Class=')[1].split('"')[0] if 'Class=' in exp else '?'
                if 'SkeletalMeshComponent' in clase and (nombre == 'Mesh' or 'Mesh' in nombre):
                    mesh_handle = h
                    resultado["cambios"].append("Mesh encontrado: " + nombre)
                    break

        if mesh_handle:
            mesh_data = sds.k2_find_subobject_data_from_handle(mesh_handle)
            exp = mesh_data.export_text()
            tmpl_path = exp.split('WeakObjectPtr="')[1].split('"')[0] if 'WeakObjectPtr="' in exp else None
            if tmpl_path:
                mesh = unreal.load_object(None, tmpl_path)
                if mesh:
                    # Leer anim_class actual
                    try:
                        abp_actual = mesh.get_editor_property("anim_class")
                        resultado["cambios"].append("anim_class actual: " + str(abp_actual.get_path_name() if abp_actual else "None"))
                    except Exception as e:
                        resultado["errores"].append("Leer anim_class ERROR: " + str(e)[:100])

                    # Cargar ABP_Frozono y asignarlo
                    abp = unreal.load_asset("/Game/TopDown/Blueprints/ABP_Frozono")
                    if abp:
                        try:
                            mesh.set_editor_property("anim_class", abp)
                            resultado["cambios"].append("anim_class asignado a ABP_Frozono")
                        except Exception as e:
                            resultado["errores"].append("Asignar anim_class ERROR: " + str(e)[:200])
                    else:
                        resultado["errores"].append("No se pudo cargar ABP_Frozono")

                    # Verificar skeletal mesh
                    try:
                        skm = mesh.get_editor_property("skeletal_mesh")
                        resultado["cambios"].append("skeletal_mesh: " + str(skm.get_path_name() if skm else "None"))
                    except Exception as e:
                        resultado["errores"].append("Leer skeletal_mesh ERROR: " + str(e)[:100])

        # Guardar
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
  console.error("[fix_anim] Excepcion:", err);
  process.exit(1);
});
