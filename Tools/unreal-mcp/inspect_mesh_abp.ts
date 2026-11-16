/**
 * inspect_mesh_abp.ts — Inspecciona el Mesh component y el ABP_Frozono en detalle.
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
const COMMAND_PORT = 6793;

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
    console.error("[inspect_mesh_abp] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[inspect_mesh_abp] Editor conectado por TCP");
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
    console.error("[inspect_mesh_abp] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json, traceback

resultado = {"ok": False, "cambios": [], "errores": []}

try:
    bp_path = "/Game/TopDown/Blueprints/BP_TopDownCharacter"
    bp = unreal.load_asset(bp_path)
    if bp is None:
        resultado["errores"].append("No se pudo cargar BP_TopDownCharacter")
    else:
        sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)

        # Buscar Mesh component
        for h in handles:
            data = sds.k2_find_subobject_data_from_handle(h)
            exp = data.export_text()
            if 'ObjectName=' in exp:
                nombre = exp.split('ObjectName=')[1].split('"')[0]
                clase = exp.split('Class=')[1].split('"')[0] if 'Class=' in exp else '?'
                if 'Mesh' in nombre or 'SkeletalMesh' in clase:
                    resultado["cambios"].append("Componente: " + nombre + " (" + clase + ")")
                    if 'SkeletalMeshComponent' in clase:
                        try:
                            tmpl_path = exp.split('WeakObjectPtr="')[1].split('"')[0] if 'WeakObjectPtr="' in exp else None
                            if tmpl_path:
                                tmpl = unreal.load_object(None, tmpl_path)
                                if tmpl:
                                    try:
                                        abp = tmpl.get_editor_property("anim_class")
                                        resultado["cambios"].append("  anim_class = " + (abp.get_path_name() if abp else "None"))
                                    except:
                                        pass
                                    try:
                                        skm = tmpl.get_editor_property("skeletal_mesh")
                                        resultado["cambios"].append("  skeletal_mesh = " + (skm.get_path_name() if skm else "None"))
                                    except:
                                        pass
                                    try:
                                        scale = tmpl.get_editor_property("relative_scale3d")
                                        resultado["cambios"].append("  relative_scale3d = " + str(scale))
                                    except:
                                        pass
                                    try:
                                        loc = tmpl.get_editor_property("relative_location")
                                        resultado["cambios"].append("  relative_location = " + str(loc))
                                    except:
                                        pass

        # Inspeccionar ABP_Frozono
        abp = unreal.load_asset("/Game/TopDown/Blueprints/ABP_Frozono")
        if abp:
            resultado["cambios"].append("ABP_Frozono: " + abp.get_path_name())
            try:
                skel = abp.get_editor_property("target_skeleton")
                resultado["cambios"].append("  target_skeleton = " + (skel.get_path_name() if skel else "None"))
            except Exception as e:
                resultado["errores"].append("  target_skeleton ERROR: " + str(e)[:100])

            # Ver el anim graph (nodos)
            try:
                ag = abp.get_editor_property("anim_graph")
                resultado["cambios"].append("  anim_graph = " + str(ag))
            except Exception as e:
                resultado["errores"].append("  anim_graph ERROR: " + str(e)[:100])

        # Ver el BlendSpace
        bs = unreal.load_asset("/Game/Modelos3D/Entidades/Player/BS_Frozono_Movimiento")
        if bs:
            resultado["cambios"].append("BlendSpace: " + bs.get_path_name())
            try:
                skel_bs = bs.get_editor_property("target_skeleton")
                resultado["cambios"].append("  target_skeleton = " + (skel_bs.get_path_name() if skel_bs else "None"))
            except:
                pass

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
  console.error("[inspect_mesh_abp] Excepcion:", err);
  process.exit(1);
});
