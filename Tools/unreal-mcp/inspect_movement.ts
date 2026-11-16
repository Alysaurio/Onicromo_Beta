/**
 * inspect_movement.ts — Inspecciona el CharacterMovementComponent y el ABP de BP_TopDownCharacter.
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
const COMMAND_PORT = 6792;

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
    console.error("[inspect_movement] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[inspect_movement] Editor conectado por TCP");
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
    console.error("[inspect_movement] ERROR: El editor no abrió el canal TCP.");
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
        resultado["cambios"].append("BP cargado: " + bp.get_path_name())

        # Obtener subobject data para componentes SCS
        sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)
        resultado["cambios"].append("Subobject handles: " + str(len(handles)))

        cmc_handle = None
        for h in handles:
            data = sds.k2_find_subobject_data_from_handle(h)
            exp = data.export_text()
            if 'CharacterMovementComponent' in exp:
                cmc_handle = h
                # Extraer nombre del componente
                if 'ObjectName=' in exp:
                    nombre = exp.split('ObjectName=')[1].split('"')[0]
                    resultado["cambios"].append("CMC encontrado: " + nombre)
                break

        if cmc_handle:
            cmc_data = sds.k2_find_subobject_data_from_handle(cmc_handle)
            cmc_template = unreal.load_object(None, cmc_data.export_text().split('WeakObjectPtr="')[1].split('"')[0] if 'WeakObjectPtr="' in cmc_data.export_text() else None)
            if cmc_template:
                # Leer propiedades de movimiento
                for prop in ["MaxWalkSpeed", "MaxWalkSpeedCrouched", "MaxCustomMovementSpeed", "MaxAcceleration", "BrakingDecelerationWalking", "bUseControllerDesiredRotation", "bOrientRotationToMovement", "RotationRate"]:
                    try:
                        v = cmc_template.get_editor_property(prop)
                        resultado["cambios"].append("  CMC." + prop + " = " + str(v))
                    except Exception as e:
                        resultado["errores"].append("  CMC." + prop + " ERROR: " + str(e)[:100])

        # Ver AnimBlueprint asignada al mesh
        try:
            # Buscar el componente Mesh
            mesh_handle = None
            for h in handles:
                data = sds.k2_find_subobject_data_from_handle(h)
                exp = data.export_text()
                if 'SkeletalMeshComponent' in exp or 'Mesh' in exp:
                    if 'ObjectName=' in exp:
                        nombre = exp.split('ObjectName=')[1].split('"')[0]
                        if nombre == 'Mesh' or 'Mesh' in nombre:
                            mesh_handle = h
                            resultado["cambios"].append("Mesh encontrado: " + nombre)
                            break

            if mesh_handle:
                mesh_data = sds.k2_find_subobject_data_from_handle(mesh_handle)
                mesh_template = unreal.load_object(None, mesh_data.export_text().split('WeakObjectPtr="')[1].split('"')[0] if 'WeakObjectPtr="' in mesh_data.export_text() else None)
                if mesh_template:
                    try:
                        abp = mesh_template.get_editor_property("anim_class")
                        resultado["cambios"].append("AnimBlueprint: " + (abp.get_path_name() if abp else "None"))
                    except Exception as e:
                        resultado["errores"].append("AnimBlueprint ERROR: " + str(e)[:100])
                    try:
                        mesh = mesh_template.get_editor_property("skeletal_mesh")
                        resultado["cambios"].append("SkeletalMesh: " + (mesh.get_path_name() if mesh else "None"))
                    except Exception as e:
                        resultado["errores"].append("SkeletalMesh ERROR: " + str(e)[:100])

        except Exception as e:
            resultado["errores"].append("Mesh/ABP ERROR: " + str(e)[:200])

        # Ver el ABP_Frozono
        abp_path = "/Game/TopDown/Blueprints/ABP_Frozono"
        abp = unreal.load_asset(abp_path)
        if abp:
            resultado["cambios"].append("ABP_Frozono cargado: " + abp.get_path_name())
            try:
                skel = abp.get_editor_property("target_skeleton")
                resultado["cambios"].append("  Target skeleton: " + (skel.get_path_name() if skel else "None"))
            except Exception as e:
                resultado["errores"].append("  Target skeleton ERROR: " + str(e)[:100])
        else:
            resultado["errores"].append("No se pudo cargar ABP_Frozono")

        # Ver plugins habilitados relacionados con BP/edicion
        try:
            plugin_mgr = unreal.get_editor_subsystem(unreal.PluginManager)
            plugins = plugin_mgr.get_enabled_plugins()
            bp_plugins = [p for p in plugins if any(x in p.get_name().lower() for x in ['python', 'blueprint', 'editor scripting', 'subobject'])]
            resultado["cambios"].append("Plugins BP/Python habilitados: " + str(len(bp_plugins)))
            for p in bp_plugins:
                resultado["cambios"].append("  - " + p.get_name() + " (" + p.get_descriptor().get_file_name() + ")")
        except Exception as e:
            resultado["errores"].append("Plugins ERROR: " + str(e)[:200])

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
  console.error("[inspect_movement] Excepcion:", err);
  process.exit(1);
});
