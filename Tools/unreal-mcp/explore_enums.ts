/**
 * explore_enums.ts — Explora los valores de enum disponibles en el editor UE
 * para BlendMode y MaterialShadingModel.
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
const COMMAND_PORT = 6776;

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

async function runCommand(code: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    pendingResult = (data) => {
      resolve(data);
    };
    const timer = setTimeout(() => {
      if (pendingResult) { pendingResult = null; reject(new Error("Timeout")); }
    }, 30000);
    const msg: Record<string, unknown> = {
      version: PROTOCOL_VERSION,
      magic: PROTOCOL_MAGIC,
      type: TYPE_COMMAND,
      source: nodeId,
      dest: editorId!,
      data: { command: code, unattended: true, exec_mode: "ExecuteFile" },
    };
    tcpChannel!.write(encoder.encode(JSON.stringify(msg)));
  });
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
  if (!editorId) { console.error("No se descubrió el editor"); process.exit(1); }

  const tcpServer = net.createServer((socket) => {
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
  if (!tcpChannel) { console.error("No se abrió el canal TCP"); process.exit(1); }

  // Explorar enums
  const code = `
import unreal, json

print("=== BlendMode ===")
try:
    bm = unreal.BlendMode
    print("BlendMode type:", type(bm))
    print("BlendMode members:", [x for x in dir(bm) if not x.startswith('_')])
except Exception as e:
    print("BlendMode ERROR:", e)

print("=== MaterialShadingModel ===")
try:
    sm = unreal.MaterialShadingModel
    print("MaterialShadingModel type:", type(sm))
    print("MaterialShadingModel members:", [x for x in dir(sm) if not x.startswith('_')])
except Exception as e:
    print("MaterialShadingModel ERROR:", e)

print("=== Unreal material module enums ===")
# Buscar BlendMode en otros lugares
for name in dir(unreal):
    if 'Blend' in name or 'blend' in name.lower():
        print("Found:", name, type(getattr(unreal, name)))
import json
print("###MCP###" + json.dumps({"ok": True}, default=str))
`;

  const resultado = await new Promise<Record<string, unknown>>((resolve, reject) => {
    pendingResult = (data) => {
      tcpServer.close();
      udp.close();
      resolve(data);
    };
    const timer = setTimeout(() => {
      if (pendingResult) { pendingResult = null; tcpServer.close(); udp.close(); reject(new Error("Timeout")); }
    }, 30000);
    const msg: Record<string, unknown> = {
      version: PROTOCOL_VERSION,
      magic: PROTOCOL_MAGIC,
      type: TYPE_COMMAND,
      source: nodeId,
      dest: editorId,
      data: { command: code, unattended: true, exec_mode: "ExecuteFile" },
    };
    tcpChannel!.write(encoder.encode(JSON.stringify(msg)));
  });

  console.log("\n=== OUTPUT DEL EDITOR ===");
  for (const out of (resultado.output ?? [])) {
    console.log(out.output);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
