/**
 * inspect_player.ts — Inspecciona BP_TopDownCharacter y las animaciones del player.
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
const COMMAND_PORT = 6791;

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
    console.error("[inspect_player] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[inspect_player] Editor conectado por TCP");
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
    console.error("[inspect_player] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json, traceback

resultado = {"ok": False, "cambios": [], "errores": [], "assets": {}}

try:
    # 1. Listar assets en TopDown/Blueprints
    try:
        bp_assets = unreal.EditorAssetLibrary.list_assets("/Game/TopDown/Blueprints", recursive=True, include_folder=False)
        resultado["assets"]["blueprints"] = bp_assets
        resultado["cambios"].append("Blueprints encontrados: " + str(len(bp_assets)))
    except Exception as e:
        resultado["errores"].append("Listar blueprints: " + str(e))

    # 2. Cargar BP_TopDownCharacter
    bp_path = "/Game/TopDown/Blueprints/BP_TopDownCharacter"
    bp = unreal.load_asset(bp_path + ".BP_TopDownCharacter")
    if bp is None:
        # Probar sin .BP_TopDownCharacter
        bp = unreal.load_asset(bp_path)
    if bp is None:
        resultado["errores"].append("No se pudo cargar BP_TopDownCharacter")
    else:
        resultado["assets"]["character"] = bp.get_path_name()
        resultado["cambios"].append("Personaje cargado: " + bp.get_path_name())

        # 3. Listar componentes
        try:
            comps = bp.get_editor_properties()
            # Buscar componentes SCS
            sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
            handles = sds.k2_gather_subobject_data_for_blueprint(bp)
            resultado["cambios"].append("Subobject handles: " + str(len(handles)))
            for h in handles:
                data = sds.k2_find_subobject_data_from_handle(h)
                exp = data.export_text()
                # Extraer nombre de clase del componente
                if 'ObjectName=' in exp:
                    nombre = exp.split('ObjectName=')[1].split('"')[0]
                    clase = exp.split('Class=')[1].split('"')[0] if 'Class=' in exp else '?'
                    resultado["cambios"].append("  Componente: " + nombre + " (" + clase + ")")
        except Exception as e:
            resultado["errores"].append("Listar componentes: " + str(e))

        # 4. Ver variables de miembro del BP
        try:
            vars_list = unreal.BlueprintEditorLibrary.list_member_variable_names(bp)
            resultado["cambios"].append("Variables miembro: " + str(len(vars_list)))
            for v in vars_list:
                resultado["cambios"].append("  Var: " + str(v))
        except Exception as e:
            resultado["errores"].append("Listar variables: " + str(e))

        # 5. Ver funciones del BP
        try:
            funcs = unreal.BlueprintEditorLibrary.list_functions(bp)
            resultado["cambios"].append("Funciones: " + str(len(funcs)))
            for f in funcs:
                resultado["cambios"].append("  Func: " + str(f))
        except Exception as e:
            resultado["errores"].append("Listar funciones: " + str(e))

    # 6. Listar animaciones en /Game/Modelos3D/Entidades/Player
    try:
        anim_assets = unreal.EditorAssetLibrary.list_assets("/Game/Modelos3D/Entidades/Player", recursive=True, include_folder=False)
        resultado["assets"]["animaciones"] = anim_assets
        resultado["cambios"].append("Assets de animacion: " + str(len(anim_assets)))
        for a in anim_assets:
            resultado["cambios"].append("  " + a)
    except Exception as e:
        resultado["errores"].append("Listar animaciones: " + str(e))

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
  console.error("[inspect_player] Excepcion:", err);
  process.exit(1);
});
