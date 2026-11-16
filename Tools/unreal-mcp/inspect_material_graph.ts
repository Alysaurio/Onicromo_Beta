/**
 * inspect_material_graph.ts — Inspecciona el grafo del material cristal
 * para ver qué nodos están conectados a Specular, Roughness y Opacity
 * del Main Material Output.
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
const COMMAND_PORT = 6779;

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
    console.error("[inspect] ERROR: No se descubrió el editor.");
    process.exit(1);
  }

  const tcpServer = net.createServer((socket) => {
    console.log("[inspect] Editor conectado por TCP");
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
    console.error("[inspect] ERROR: El editor no abrió el canal TCP.");
    process.exit(1);
  }

  const pythonCode = `
import unreal, json

mat_path = "/Game/Materiales/Lab/Cristal/M_Cristal_Lab14"
mat = unreal.load_asset(mat_path)

print("MATERIAL:", mat.get_path_name() if mat else "NONE")

if mat is None:
    print("ERROR: no se pudo cargar")
else:
    expressions = mat.get_editor_property("expressions")
    print("Total expresiones:", len(expressions))
    
    main_output = None
    for exp in expressions:
        ename = exp.get_class().get_name()
        print("  EXPR: " + ename + " | nombre: " + exp.get_name())
        if ename == "MaterialExpressionMainMaterialOutput":
            main_output = exp
    
    if main_output:
        print("\n=== Conexiones del Main Material Output ===")
        for pin in ["Specular", "Roughness", "Opacity", "Emissive", "Metallic", "BaseColor", "Normal"]:
            try:
                connected = main_output.get_input(pin)
                if connected is not None:
                    print("  " + pin + " <- " + connected.get_class().get_name() + " (" + connected.get_name() + ")")
                    # Si es una constante, mostrar su valor
                    try:
                        val = connected.get_editor_property("R")
                        print("     valor R = " + str(val))
                    except:
                        pass
                else:
                    print("  " + pin + " <- (nada conectado, usa valor por defecto)")
            except Exception as e:
                print("  " + pin + " ERROR: " + str(e))
    
    print("\n=== Todas las expresiones y sus propiedades ===")
    for exp in expressions:
        ename = exp.get_class().get_name()
        print("\n  " + ename + " (" + exp.get_name() + ")")
        try:
            props = exp.get_editor_properties()
            for p in props:
                try:
                    v = exp.get_editor_property(p)
                    if str(v) not in ["None", ""]:
                        print("    " + p + " = " + str(v)[:80])
                except:
                    pass
        except Exception as e:
            print("    Error leyendo props: " + str(e))

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

  const outputArr: Array<{ type: string; output: string }> = (resultado as any).output ?? [];
  for (const out of outputArr) {
    console.log(out.output.trim());
  }
}

main().catch((err) => {
  console.error("[inspect] Excepción:", err);
  process.exit(1);
});
