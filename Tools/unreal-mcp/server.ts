/**
 * unreal-mcp — Servidor MCP (Model Context Protocol) local para Unreal Engine 5.7
 * ---------------------------------------------------------------------------
 * Servidor stdio sin dependencias externas (Deno). Expone herramientas de alto
 * nivel sobre el editor de Unreal usando el protocolo oficial
 * "Python Remote Execution" del plugin PythonScriptPlugin de Epic:
 *
 *   - Descubrimiento de nodos: UDP multicast 239.0.0.1:6766 (ping/pong, protocolo v1)
 *   - Canal de comandos: el editor se conecta por TCP a este servidor (puerto 6776)
 *   - Mensajes: JSON UTF-8 { version:1, magic:"ue_py", type, source, dest, data }
 *
 * Portado de:
 *   Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python/remote_execution.py
 *   Engine/Plugins/Experimental/PythonScriptPlugin/Source/.../PythonScriptRemoteExecution.cpp
 *
 * Requisitos en el editor (ya configurados en este proyecto):
 *   - Plugin PythonScriptPlugin habilitado (Onicromo_Beta.uproject)
 *   - /Script/PythonScriptPlugin.PythonScriptPluginSettings: bRemoteExecution=True
 *     (Config/DefaultEngine.ini)
 */

// @ts-nocheck Deno + node compat builtins (dgram/net) — tipos resueltos en runtime.
import dgram from "node:dgram";
import net from "node:net";

// ---------------------------------------------------------------------------
// Constantes del protocolo (¡deben coincidir con remote_execution.py del engine!)
// ---------------------------------------------------------------------------
const PROTOCOL_VERSION = 1;
const PROTOCOL_MAGIC = "ue_py";
const TYPE_PING = "ping";
const TYPE_PONG = "pong";
const TYPE_OPEN_CONNECTION = "open_connection";
const TYPE_CLOSE_CONNECTION = "close_connection";
const TYPE_COMMAND = "command";
const TYPE_COMMAND_RESULT = "command_result";

const NODE_PING_SECONDS = 1;
const NODE_TIMEOUT_SECONDS = 5;

const MULTICAST_GROUP = "239.0.0.1";
const MULTICAST_PORT = 6766;
const MULTICAST_BIND = "127.0.0.1";
const COMMAND_PORT = 6776; // el editor se conecta hacia nosotros (callback)
const RECV_BUFFER = 8192;

const MODE_EXEC_FILE = "ExecuteFile";
const MODE_EVAL_STATEMENT = "EvaluateStatement";
const MODE_EXEC_STATEMENT = "ExecuteStatement";

const PROJECT_ROOT = Deno.env.get("UNREAL_PROJECT_ROOT") ?? "A:/Proyectos/Unreal/Onicromo_Beta";
const PROJECT_FILTER = Deno.env.get("UNREAL_PROJECT_FILTER") ?? "Onicromo_Beta";
const DISCOVERY_TIMEOUT_MS = 12_000;
const RESULT_MARKER = "###MCP###";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function log(...args: unknown[]): void {
  // stderr nunca se usa por MCP stdio (stdout es el canal JSON-RPC).
  console.error("[unreal-mcp]", ...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pyStr(s: string): string {
  return JSON.stringify(s); // escape seguro para literales Python/JSON
}

function pyVec(v: number[]): string {
  return `(${Number(v[0])}, ${Number(v[1])}, ${Number(v[2])})`;
}

/** Extrae objetos JSON completos de un buffer TCP (mensajes concatenable sin delimitador). */
function extractJsonObjects(buffer: Uint8Array): { objects: string[]; rest: Uint8Array } {
  const text = decoder.decode(buffer);
  const objects: string[] = [];
  let i = 0;
  while (i < text.length) {
    // Busca inicio de objeto
    while (i < text.length && text[i] !== "{") i++;
    if (i >= text.length) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (esc) { esc = false; continue; }
      if (inStr) {
        if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }
    if (end === -1) break; // objeto incompleto: esperar más datos
    objects.push(text.slice(i, end + 1));
    i = end + 1;
  }
  // Resto: bytes pendientes (objeto incompleto al final). Recalcula cuántos
  // bytes del buffer consumieron los objetos extraídos.
  let consumedBytes = 0;
  if (objects.length > 0) {
    // Reconstruye cuántos bytes consumimos midiendo el texto de los objetos + basura inicial
    let lastEnd = -1;
    // Re-escaneo simple para calcular offset final
    let idx = 0;
    const t = text;
    for (const _obj of objects) {
      while (idx < t.length && t[idx] !== "{") idx++;
      let depth = 0, inStr = false, esc = false;
      for (let j = idx; j < t.length; j++) {
        const c = t[j];
        if (esc) { esc = false; continue; }
        if (inStr) { if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { lastEnd = j; break; } }
      }
      idx = lastEnd + 1;
    }
    consumedBytes = encoder.encode(t.slice(0, idx)).length;
  }
  return { objects, rest: buffer.slice(consumedBytes) };
}

// ---------------------------------------------------------------------------
// Cliente Remote Execution (protocolo v1)
// ---------------------------------------------------------------------------
interface RemoteNode {
  id: string;
  data: Record<string, unknown>;
  lastSeen: number;
}

class UnrealRemoteClient {
  #udp: dgram.Socket | null = null;
  #tcpServer: net.Server | null = null;
  #tcpChannel: net.Socket | null = null;
  #nodeId = crypto.randomUUID();
  #nodes = new Map<string, RemoteNode>();
  #commandPort = COMMAND_PORT;
  #tcpBuffer = new Uint8Array(0);
  #pendingResult: ((data: Record<string, unknown>) => void) | null = null;
  #connectedNode: string | null = null;
  #lastPing = 0;
  #started = false;
  #closed = false;

  get connected(): boolean {
    // NOTA: no depender de #connectedNode aquí (se asigna tras confirmar la conexión).
    return this.#tcpChannel !== null;
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;

    // --- UDP: descubrimiento ---
    const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
    udp.on("message", (msg) => this.#onUdpMessage(msg));
    udp.on("error", (err) => log("UDP error:", err.message));
    await new Promise<void>((resolve, reject) => {
      udp.once("error", reject);
      udp.bind(MULTICAST_PORT, MULTICAST_BIND, () => {
        // Nota: el cliente oficial de Epic usa TTL 0 (solo host local), pero libuv
        // rechaza TTL 0 con EINVAL en Windows; TTL 1 + interfaz loopback equivale
        // al mismo comportamiento en una sola máquina.
        try { udp.setMulticastInterface(MULTICAST_BIND); } catch (e) { log("WARN: setMulticastInterface:", (e as Error).message); }
        try { udp.setMulticastLoopback(true); } catch (e) { log("WARN: setMulticastLoopback:", (e as Error).message); }
        try { udp.setMulticastTTL(1); } catch (e) { log("WARN: setMulticastTTL:", (e as Error).message); }
        // CRÍTICO: sin addMembership el socket no recibe los "pong" multicast del editor.
        try {
          udp.addMembership(MULTICAST_GROUP, MULTICAST_BIND);
        } catch (e) {
          log("ERROR: addMembership falló (no se recibirán pongs del editor):", (e as Error).message);
        }
        resolve();
      });
    });
    this.#udp = udp;

    // --- TCP: servidor de comandos (el editor conecta hacia nosotros) ---
    await this.#startTcpServer(COMMAND_PORT);
    log(`Servidor listo. UDP ${MULTICAST_GROUP}:${MULTICAST_PORT}, TCP ${this.#commandPort}`);
  }

  async #startTcpServer(port: number): Promise<void> {
    const server = net.createServer((socket) => this.#onTcpConnection(socket));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, MULTICAST_BIND, () => resolve());
    });
    this.#tcpServer = server;
    this.#commandPort = port;
  }

  #onTcpConnection(socket: net.Socket): void {
    if (this.#tcpChannel) {
      // Solo aceptamos una conexión de comando a la vez.
      socket.destroy();
      return;
    }
    log("Editor conectado por TCP desde", socket.remoteAddress + ":" + socket.remotePort);
    this.#tcpChannel = socket;
    this.#tcpBuffer = new Uint8Array(0);
    socket.on("data", (chunk: Buffer) => {
      const merged = new Uint8Array(this.#tcpBuffer.length + chunk.length);
      merged.set(this.#tcpBuffer, 0);
      merged.set(new Uint8Array(chunk), this.#tcpBuffer.length);
      const { objects, rest } = extractJsonObjects(merged);
      this.#tcpBuffer = rest;
      for (const obj of objects) {
        try {
          const msg = JSON.parse(obj);
          this.#onTcpMessage(msg);
        } catch (e) {
          log("Mensaje TCP ilegible:", (e as Error).message);
        }
      }
    });
    socket.on("close", () => {
      log("Conexión TCP cerrada por el editor");
      this.#tcpChannel = null;
      this.#connectedNode = null;
      if (this.#pendingResult) {
        this.#pendingResult({ success: false, result: "", output: "La conexión con el editor se cerró (¿editor cerrado o reiniciado?).", command: "" });
        this.#pendingResult = null;
      }
    });
    socket.on("error", (err) => log("TCP error:", err.message));
    socket.setTimeout(0); // sin timeout de inactividad: el editor mantiene el canal abierto
  }

  #onTcpMessage(msg: Record<string, unknown>): void {
    if (msg.magic !== PROTOCOL_MAGIC || msg.version !== PROTOCOL_VERSION) return;
    if (msg.type === TYPE_COMMAND_RESULT && this.#pendingResult) {
      const cb = this.#pendingResult;
      this.#pendingResult = null;
      cb((msg.data ?? {}) as Record<string, unknown>);
    }
  }

  #onUdpMessage(msg: Buffer): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(msg.toString("utf-8"));
    } catch {
      return;
    }
    if (parsed.magic !== PROTOCOL_MAGIC || parsed.version !== PROTOCOL_VERSION) return;
    if (parsed.source === this.#nodeId) return; // ignorar nuestros propios mensajes
    if (parsed.type === TYPE_PONG) {
      this.#nodes.set(parsed.source as string, {
        id: parsed.source as string,
        data: (parsed.data ?? {}) as Record<string, unknown>,
        lastSeen: Date.now(),
      });
    }
  }

  #broadcastPing(): void {
    if (!this.#udp) return;
    const now = Date.now();
    if (now - this.#lastPing < NODE_PING_SECONDS * 1000) return;
    this.#lastPing = now;
    this.#sendUdp({ type: TYPE_PING, source: this.#nodeId });
  }

  #sendUdp(msg: Record<string, unknown>, dest?: string): void {
    if (!this.#udp) return;
    const payload: Record<string, unknown> = {
      version: PROTOCOL_VERSION,
      magic: PROTOCOL_MAGIC,
      type: msg.type,
      source: this.#nodeId,
    };
    if (dest) payload.dest = dest;
    if (msg.data) payload.data = msg.data;
    this.#udp.send(encoder.encode(JSON.stringify(payload)), MULTICAST_PORT, MULTICAST_GROUP);
  }

  #pickBestNode(): RemoteNode | null {
    this.#broadcastPing();
    const nodes = [...this.#nodes.values()].filter((n) => Date.now() - n.lastSeen < NODE_TIMEOUT_SECONDS * 1000);
    if (nodes.length === 0) return null;
    // Preferir el nodo que coincida con nuestro proyecto
    const match = nodes.find((n) => JSON.stringify(n.data).includes(PROJECT_FILTER));
    return match ?? nodes[0];
  }

  async #ensureConnection(): Promise<string> {
    if (this.connected) return this.#connectedNode!;
    const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
    let node: RemoteNode | null = null;
    while (Date.now() < deadline && !this.#closed) {
      this.#broadcastPing();
      node = this.#pickBestNode();
      if (node) break;
      await sleep(200);
    }
    if (!node) {
      throw new Error(
        `No se detectó ningún editor Unreal con Remote Execution activo (esperado ${DISCOVERY_TIMEOUT_MS / 1000}s en multicast ${MULTICAST_GROUP}:${MULTICAST_PORT}).\n` +
          `Checklist:\n` +
          `  1) UnrealEditor abierto con el proyecto ${PROJECT_FILTER}.\n` +
          `  2) Plugin "Python Script Plugin" habilitado (.uproject).\n` +
          `  3) Project Settings > Plugins > Python > "Enable Remote Execution" = True (Config/DefaultEngine.ini).\n` +
          `  4) REINICIAR el editor tras cambiar cualquiera de los puntos anteriores.\n` +
          `  5) Firewall de Windows: permitir tráfico UDP local (loopback) en 239.0.0.1:6766.`,
      );
    }

    // Abrir canal TCP: enviamos open_connection y esperamos la conexión entrante
    for (let attempt = 0; attempt < 6 && !this.#closed; attempt++) {
      this.#sendUdp(
        { type: TYPE_OPEN_CONNECTION, data: { command_ip: MULTICAST_BIND, command_port: this.#commandPort } },
        node.id,
      );
      const startWait = Date.now();
      while (Date.now() - startWait < 5000 && !this.connected && !this.#closed) {
        await sleep(100);
      }
      if (this.connected) {
        this.#connectedNode = node.id;
        log(`Canal de comandos abierto con nodo ${node.id}`, JSON.stringify(node.data));
        return node.id;
      }
    }
    throw new Error(
      `El editor (${node.id}) no abrió el canal de comandos TCP hacia ${MULTICAST_BIND}:${this.#commandPort}. ` +
        `Puede que el puerto esté en uso o que haya otro cliente de remote execution conectado.`,
    );
  }

  #closeChannel(): void {
    if (this.#connectedNode) {
      this.#sendUdp({ type: TYPE_CLOSE_CONNECTION }, this.#connectedNode);
    }
    if (this.#tcpChannel) {
      this.#tcpChannel.removeAllListeners();
      this.#tcpChannel.destroy();
      this.#tcpChannel = null;
    }
    this.#connectedNode = null;
  }

  async runCommand(
    code: string,
    mode = MODE_EXEC_FILE,
    timeoutMs = 120_000,
  ): Promise<{ success: boolean; result: string; output: string }> {
    await this.#ensureConnection();
    const socket = this.#tcpChannel!;
    const message = {
      version: PROTOCOL_VERSION,
      magic: PROTOCOL_MAGIC,
      type: TYPE_COMMAND,
      source: this.#nodeId,
      dest: this.#connectedNode,
      data: { command: code, unattended: true, exec_mode: mode },
    };
    const payload = encoder.encode(JSON.stringify(message));
    return await new Promise<{ success: boolean; result: string; output: string }>((resolve) => {
      const timer = setTimeout(() => {
        if (this.#pendingResult) {
          this.#pendingResult = null;
        }
        this.#closeChannel(); // forzar reconexión en el siguiente comando
        resolve({
          success: false,
          result: "",
          output:
            `Timeout (${timeoutMs / 1000}s) esperando resultado del editor. ` +
            `Si el editor está en PIE/compilando, reintenta; el comando se ejecuta en el Game Thread.`,
        });
      }, timeoutMs);
      this.#pendingResult = (data) => {
        clearTimeout(timer);
        // data: { success, command, result, output:[{type,output}] } — ver PythonScriptRemoteExecution.cpp
        const outArr = Array.isArray(data.output) ? (data.output as Array<Record<string, unknown>>) : [];
        const outputText = outArr
          .map((e) => {
            const t = String(e.type ?? "Info");
            const o = String(e.output ?? "");
            return t === "Info" ? o : `[${t}] ${o}`;
          })
          .join("");
        resolve({
          success: data.success === true,
          result: typeof data.result === "string" ? data.result : JSON.stringify(data),
          output: outputText,
        });
      };
      socket.write(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          this.#pendingResult = null;
          this.#closeChannel();
          resolve({ success: false, result: "", output: `Error de escritura TCP: ${err.message}` });
        }
      });
    });
  }

  async shutdown(): Promise<void> {
    this.#closed = true;
    this.#closeChannel();
    if (this.#tcpServer) await new Promise<void>((r) => this.#tcpServer!.close(() => r()));
    if (this.#udp) {
      try { this.#udp.dropMembership(MULTICAST_GROUP, MULTICAST_BIND); } catch { /* opcional */ }
      this.#udp.close();
    }
  }
}

const client = new UnrealRemoteClient();

// ---------------------------------------------------------------------------
// Snippets de Python para las herramientas de alto nivel
// ---------------------------------------------------------------------------
function wrapPy(body: string): string {
  // Los snippets imprimen ###MCP###<json> como última línea estructurada.
  return body;
}

const TOOLS: Record<string, {
  description: string;
  inputSchema: Record<string, unknown>;
  timeoutMs: number;
  build: (args: Record<string, unknown>) => string;
}> = {
  unreal_status: {
    description:
      "Estado del editor Unreal: motor, proyecto, nivel activo, número de actores, actores seleccionados y modo PIE.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    timeoutMs: 30_000,
    build: () => wrapPy(`
import unreal, json
payload = {}
try:
    payload["engine_version"] = unreal.SystemLibrary.get_engine_version()
    payload["project"] = unreal.SystemLibrary.get_game_name()
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actors = eas.get_all_level_actors()
    payload["actor_count"] = len(actors)
    world = None
    try:
        world = unreal.EditorLevelLibrary.get_editor_world()
    except Exception:
        pass
    payload["world"] = world.get_path_name() if world else None
    try:
        payload["selected"] = [a.get_actor_label() for a in eas.get_selected_level_actors()]
    except Exception:
        payload["selected"] = []
    try:
        payload["in_pie"] = unreal.EditorLevelLibrary.is_in_play_in_editor()
    except Exception:
        payload["in_pie"] = None
    payload["ok"] = True
except Exception as e:
    payload["ok"] = False
    payload["error"] = str(e)
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_get_actors: {
    description:
      "Lista los actores del nivel activo (Outliner): label, clase, ubicación (cm) y rotación (grados). Opcionalmente filtra por subcadena de label o clase.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "Subcadena a buscar en label o clase (insensible a mayúsculas)." },
        limit: { type: "integer", description: "Máximo de actores devueltos (defecto 200).", default: 200 },
        include_components: { type: "boolean", description: "Incluir componentes por actor.", default: false },
      },
      additionalProperties: false,
    },
    timeoutMs: 45_000,
    build: (args) => wrapPy(`
import unreal, json
flt = ${pyStr(String(args.filter ?? ""))}.lower()
limit = ${Number(args.limit ?? 200)}
include_components = ${args.include_components === true ? "True" : "False"}
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
out = []
total = 0
for a in eas.get_all_level_actors():
    cls = a.get_class().get_path_name()
    label = a.get_actor_label()
    total += 1
    if flt and flt not in label.lower() and flt not in cls.lower():
        continue
    loc = a.get_actor_location(); rot = a.get_actor_rotation()
    entry = {
        "label": label,
        "name": a.get_name(),
        "class": cls,
        "location": [round(loc.x, 2), round(loc.y, 2), round(loc.z, 2)],
        "rotation": [round(rot.pitch, 2), round(rot.yaw, 2), round(rot.roll, 2)],
    }
    if include_components:
        entry["components"] = [c.get_name() + " (" + c.get_class().get_path_name() + ")" for c in a.get_components_by_class(unreal.ActorComponent)]
    out.append(entry)
    if len(out) >= limit:
        break
print("${RESULT_MARKER}" + json.dumps({"total_in_level": total, "returned": len(out), "actors": out}, default=str))
`),
  },

  unreal_spawn_actor: {
    description:
      "Spawnea un actor en el nivel activo por clase (Script class o Blueprint _C). Soporta ubicación/rotación/rotación y asignación de StaticMesh si el actor tiene componente StaticMeshComponent.",
    inputSchema: {
      type: "object",
      properties: {
        class_path: {
          type: "string",
          description: 'Clase del actor. Ejemplos: "/Script/Engine.StaticMeshActor", "/Game/TopDown/Blueprints/BP_MiActor.BP_MiActor_C".',
        },
        location: { type: "array", items: { type: "number" }, description: "[X,Y,Z] en centímetros (Z arriba)." },
        rotation: { type: "array", items: { type: "number" }, description: "[Pitch,Yaw,Roll] en grados. Opcional." },
        scale: { type: "array", items: { type: "number" }, description: "[X,Y,Z] escala. Opcional (defecto 1,1,1)." },
        label: { type: "string", description: "Label del actor en el Outliner. Opcional." },
        mesh: { type: "string", description: "Asset de StaticMesh a asignar (ej. '/Engine/BasicShapes/Cube.Cube'). Opcional." },
      },
      required: ["class_path", "location"],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    build: (args) => wrapPy(`
import unreal, json
payload = {"ok": False}
try:
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    cls = unreal.load_class(None, ${pyStr(String(args.class_path))})
    if cls is None:
        raise RuntimeError("No se pudo cargar la clase: " + ${pyStr(String(args.class_path))})
    loc = unreal.Vector(*${JSON.stringify((args.location as number[]).map(Number))})
    rot_vals = ${JSON.stringify((args.rotation as number[] | undefined ?? [0, 0, 0]).map(Number))}
    rot = unreal.Rotator(rot_vals[0], rot_vals[1], rot_vals[2])
    actor = eas.spawn_actor_from_class(cls, loc, rot)
    if actor is None:
        raise RuntimeError("spawn_actor_from_class devolvió None")
    scale_vals = ${JSON.stringify((args.scale as number[] | undefined ?? [1, 1, 1]).map(Number))}
    if scale_vals != [1, 1, 1]:
        actor.set_actor_scale3d(unreal.Vector(*scale_vals))
    label = ${pyStr(String(args.label ?? ""))}
    if label:
        actor.set_actor_label(label)
    mesh_path = ${pyStr(String(args.mesh ?? ""))}
    if mesh_path:
        mesh = unreal.load_asset(mesh_path)
        comps = actor.get_components_by_class(unreal.StaticMeshComponent)
        if comps and mesh:
            comps[0].set_static_mesh(mesh)
            payload["mesh"] = mesh_path
        else:
            payload["mesh_warning"] = "El actor no tiene StaticMeshComponent o el mesh no existe: " + mesh_path
    payload["ok"] = True
    payload["label"] = actor.get_actor_label()
    payload["name"] = actor.get_name()
    payload["path"] = actor.get_path_name()
    payload["class"] = actor.get_class().get_path_name()
    loc2 = actor.get_actor_location()
    payload["location"] = [round(loc2.x, 2), round(loc2.y, 2), round(loc2.z, 2)]
except Exception as e:
    import traceback
    payload["error"] = str(e)
    payload["traceback"] = traceback.format_exc()
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_set_transform: {
    description:
      "Modifica la transformación (ubicación/rotación/escala) de un actor del nivel activo, identificado por su label del Outliner o su nombre.",
    inputSchema: {
      type: "object",
      properties: {
        actor: { type: "string", description: "Label del actor en el Outliner (o nombre)." },
        location: { type: "array", items: { type: "number" }, description: "[X,Y,Z] en centímetros." },
        rotation: { type: "array", items: { type: "number" }, description: "[Pitch,Yaw,Roll] en grados." },
        scale: { type: "array", items: { type: "number" }, description: "[X,Y,Z] escala." },
      },
      required: ["actor"],
      additionalProperties: false,
    },
    timeoutMs: 45_000,
    build: (args) => wrapPy(`
import unreal, json
payload = {"ok": False}
try:
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    target = ${pyStr(String(args.actor))}
    actor = None
    for a in eas.get_all_level_actors():
        if a.get_actor_label() == target or a.get_name() == target:
            actor = a
            break
    if actor is None:
        matches = [a.get_actor_label() for a in eas.get_all_level_actors() if target.lower() in a.get_actor_label().lower()]
        raise RuntimeError("Actor '" + target + "' no encontrado. Coincidencias: " + ", ".join(matches[:10]))
    loc = ${args.location ? `unreal.Vector(*${JSON.stringify((args.location as number[]).map(Number))})` : "None"}
    if loc is not None:
        actor.set_actor_location(loc, False, False)
    rot_vals = ${args.rotation ? JSON.stringify((args.rotation as number[]).map(Number)) : "None"}
    if rot_vals is not None:
        actor.set_actor_rotation(unreal.Rotator(rot_vals[0], rot_vals[1], rot_vals[2]), False)
    sc = ${args.scale ? JSON.stringify((args.scale as number[]).map(Number)) : "None"}
    if sc is not None:
        actor.set_actor_scale3d(unreal.Vector(*sc))
    newloc = actor.get_actor_location(); newrot = actor.get_actor_rotation(); s = actor.get_actor_scale3d()
    payload["label"] = actor.get_actor_label()
    payload["location"] = [round(newloc.x, 2), round(newloc.y, 2), round(newloc.z, 2)]
    payload["rotation"] = [round(newrot.pitch, 2), round(newrot.yaw, 2), round(newrot.roll, 2)]
    payload["scale"] = [round(s.x, 2), round(s.y, 2), round(s.z, 2)]
    payload["ok"] = True
except Exception as e:
    import traceback
    payload["error"] = str(e)
    payload["traceback"] = traceback.format_exc()
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_add_component: {
    description:
      "Añade un componente a un actor del nivel activo (por clase) y opcionalmente le asigna propiedades (ej. static_mesh) o lo adjunta a otro componente.",
    inputSchema: {
      type: "object",
      properties: {
        actor: { type: "string", description: "Label del actor en el Outliner." },
        component_class: {
          type: "string",
          description: 'Clase del componente, ej. "/Script/Engine.StaticMeshComponent", "/Script/Engine.PointLightComponent".',
        },
        component_name: { type: "string", description: "Nombre/label del componente. Opcional." },
        properties: { type: "object", description: 'Propiedades iniciales, ej. {"static_mesh": "/Engine/BasicShapes/Cube.Cube", "intensity": 5000}.' },
      },
      required: ["actor", "component_class"],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    build: (args) => wrapPy(`
import unreal, json
payload = {"ok": False}
try:
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    target = ${pyStr(String(args.actor))}
    actor = None
    for a in eas.get_all_level_actors():
        if a.get_actor_label() == target or a.get_name() == target:
            actor = a
            break
    if actor is None:
        raise RuntimeError("Actor '" + target + "' no encontrado en el nivel activo.")
    ccls = unreal.load_class(None, ${pyStr(String(args.component_class))})
    if ccls is None:
        raise RuntimeError("No se pudo cargar la clase de componente: " + ${pyStr(String(args.component_class))})
    comp = actor.add_component_by_class(ccls, False, unreal.Transform(), False)
    if comp is None:
        raise RuntimeError("add_component_by_class devolvió None")
    cname = ${pyStr(String(args.component_name ?? ""))}
    if cname:
        try:
            comp.set_actor_label(cname)
        except Exception:
            try:
                comp.rename(cname)
            except Exception:
                pass
    props = ${JSON.stringify(args.properties ?? {})}
    applied, failed = [], {}
    for k, v in props.items():
        try:
            if isinstance(v, str) and (v.startswith("/Engine/") or v.startswith("/Game/")):
                asset = unreal.load_asset(v)
                if asset is not None:
                    comp.set_editor_property(k, asset)
                    applied.append(k)
                    continue
            comp.set_editor_property(k, v)
            applied.append(k)
        except Exception as pe:
            failed[k] = str(pe)
    payload["ok"] = True
    payload["actor"] = actor.get_actor_label()
    payload["component"] = comp.get_name()
    payload["component_class"] = comp.get_class().get_path_name()
    payload["applied_properties"] = applied
    if failed:
        payload["failed_properties"] = failed
except Exception as e:
    import traceback
    payload["error"] = str(e)
    payload["traceback"] = traceback.format_exc()
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_set_property: {
    description:
      "Establece una propiedad (set_editor_property) de un actor o de uno de sus componentes en el nivel activo. Valores JSON: números, strings, booleanos, listas [x,y,z] (se convierten a Vector/Rotator según el nombre de la propiedad).",
    inputSchema: {
      type: "object",
      properties: {
        actor: { type: "string", description: 'Label del actor. Para componentes: "LabelActor.NombreComponente".' },
        property: { type: "string", description: "Nombre de la propiedad (case-insensitive), ej. 'mobility', 'visible', 'static_mesh'." },
        value: { description: "Valor JSON a asignar." },
      },
      required: ["actor", "property", "value"],
      additionalProperties: false,
    },
    timeoutMs: 45_000,
    build: (args) => wrapPy(`
import unreal, json
payload = {"ok": False}
try:
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    ref = ${pyStr(String(args.actor))}
    actor_label, comp_name = (ref.split(".", 1) + [None])[:2] if "." in ref else (ref, None)
    actor = None
    for a in eas.get_all_level_actors():
        if a.get_actor_label() == actor_label or a.get_name() == actor_label:
            actor = a
            break
    if actor is None:
        raise RuntimeError("Actor '" + actor_label + "' no encontrado.")
    obj = actor
    if comp_name:
        comp = None
        comps = actor.get_components_by_class(unreal.ActorComponent)
        for c in comps:
            if c.get_name() == comp_name or c.get_name().lower() == comp_name.lower():
                comp = c
                break
        if comp is None:
            raise RuntimeError("Componente '" + comp_name + "' no encontrado en '" + actor_label + "'. Componentes: " + ", ".join(c.get_name() for c in comps))
        obj = comp
    prop = ${pyStr(String(args.property))}
    value = ${JSON.stringify(args.value ?? null)}
    # Resolver propiedades por nombre insensible a mayúsculas
    resolved = None
    for p in obj.get_editor_properties():
        if str(p).lower() == prop.lower():
            resolved = str(p)
            break
    if resolved is None:
        raise RuntimeError("Propiedad '" + prop + "' no existe en " + obj.get_class().get_path_name())
    if isinstance(value, list) and len(value) == 3 and all(isinstance(x, (int, float)) for x in value):
        low = resolved.lower()
        if "rotation" in low or "orientation" in low:
            value = unreal.Rotator(value[0], value[1], value[2])
        elif "color" in low:
            value = unreal.LinearColor(value[0], value[1], value[2], 1.0)
        else:
            value = unreal.Vector(value[0], value[1], value[2])
    obj.set_editor_property(resolved, value)
    payload["ok"] = True
    payload["target"] = obj.get_path_name()
    payload["property"] = resolved
    payload["value"] = value if isinstance(value, (str, int, float, bool)) or value is None else str(value)
    try:
        payload["new_value"] = str(obj.get_editor_property(resolved))
    except Exception:
        pass
except Exception as e:
    import traceback
    payload["error"] = str(e)
    payload["traceback"] = traceback.format_exc()
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_create_blueprint: {
    description:
      "Crea un Blueprint (asset) en /Game a partir de una clase padre, con componentes opcionales. Guarda y compila el Blueprint.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del asset sin extensión (se le añade prefijo BP_ si no lo tiene)." },
        folder: { type: "string", description: 'Carpeta de contenido, ej. "/Game/TopDown/Blueprints".' },
        parent_class: { type: "string", description: 'Clase padre, ej. "/Script/Engine.Actor" o "/Script/Onicromo_Beta.TwinStickNPC". Defecto Actor.', default: "/Script/Engine.Actor" },
        components: {
          type: "array",
          description: "Componentes a añadir a la plantilla del BP (vía SubobjectDataSubsystem; el nombre de variable lo asigna el editor).",
          items: {
            type: "object",
            properties: {
              class_path: { type: "string", description: 'ej. "/Script/Engine.StaticMeshComponent".' },
              name: { type: "string", description: "Identificador del componente para el informe." },
              properties: { type: "object", description: "Propiedades por defecto, ej. static_mesh." },
            },
            required: ["class_path"],
          },
        },
        save: { type: "boolean", description: "Guardar el asset (defecto true).", default: true },
        compile: { type: "boolean", description: "Compilar el Blueprint (defecto true).", default: true },
      },
      required: ["name", "folder"],
      additionalProperties: false,
    },
    timeoutMs: 90_000,
    build: (args) => wrapPy(`
import unreal, json
payload = {"ok": False}
try:
    name = ${pyStr(String(args.name))}
    if not name.startswith("BP_"):
        name = "BP_" + name
    folder = ${pyStr(String(args.folder))}
    parent_path = ${pyStr(String(args.parent_class ?? "/Script/Engine.Actor"))}
    parent = unreal.load_class(None, parent_path)
    if parent is None:
        raise RuntimeError("No se pudo cargar la clase padre: " + parent_path)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    existing = unreal.EditorAssetLibrary.does_asset_exist(folder + "/" + name)
    if existing:
        raise RuntimeError("El asset ya existe: " + folder + "/" + name + ". Usa otro nombre o elimínalo antes.")
    factory = unreal.BlueprintFactory()
    factory.set_editor_property("parent_class", parent)
    bp = asset_tools.create_asset(name, folder, None, factory)
    if bp is None:
        raise RuntimeError("create_asset devolvió None (¿carpeta inexistente o nombre inválido?)")
    payload["asset"] = bp.get_path_name()
    comps_ok, comps_failed = [], {}
    specs = ${JSON.stringify(args.components ?? [])}
    if specs:
        # UE 5.7: añadir componentes a la plantilla del BP vía SubobjectDataSubsystem
        sds = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
        handles = sds.k2_gather_subobject_data_for_blueprint(bp)
        for spec in specs:
            cname = spec.get("name") or spec.get("class_path", "Component").split(".")[-1]
            try:
                ccls = unreal.load_class(None, spec.get("class_path", ""))
                if ccls is None:
                    raise RuntimeError("Clase no encontrada: " + spec.get("class_path", ""))
                added = None
                for h in handles:
                    p = unreal.AddNewSubobjectParams()
                    p.blueprint_context = bp
                    p.new_class = ccls
                    p.parent_handle = h
                    p.conform_transform_to_parent = False
                    r = sds.add_new_subobject(p)
                    cand = r[0] if isinstance(r, (list, tuple)) else r
                    if cand is not None:
                        added = cand
                        break
                if added is None:
                    raise RuntimeError("add_new_subobject devolvió handle inválido para " + spec.get("class_path", ""))
                data = sds.k2_find_subobject_data_from_handle(added)
                exp = data.export_text()
                path = ""
                if 'WeakObjectPtr="' in exp:
                    inner = exp.split('WeakObjectPtr="', 1)[1].split('"', 1)[0]
                    parts = inner.split("'")
                    if len(parts) >= 3:
                        path = parts[-2]
                template = unreal.load_object(None, path) if path else None
                if template is None:
                    comps_failed[cname] = "componente añadido pero no se pudo cargar la plantilla: " + exp[:200]
                    continue
                cprops = spec.get("properties") or {}
                applied = []
                for k, v in cprops.items():
                    try:
                        if isinstance(v, str) and (v.startswith("/Engine/") or v.startswith("/Game/")):
                            v = unreal.load_asset(v)
                        template.set_editor_property(k, v)
                        applied.append(k)
                    except Exception as pe:
                        comps_failed[cname + "." + k] = str(pe)
                comps_ok.append({"name": cname, "template": template.get_name(), "properties": applied})
            except Exception as ce:
                comps_failed[cname] = str(ce)
    payload["components_added"] = comps_ok
    if comps_failed:
        payload["components_failed"] = comps_failed
    if ${args.compile !== false ? "True" : "False"}:
        unreal.BlueprintEditorLibrary.compile_blueprint(bp)
        payload["compiled"] = True
    if ${args.save !== false ? "True" : "False"}:
        saved = unreal.EditorAssetLibrary.save_asset(bp.get_path_name())
        payload["saved"] = bool(saved)
    payload["ok"] = True
except Exception as e:
    import traceback
    payload["error"] = str(e)
    payload["traceback"] = traceback.format_exc()
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_list_assets: {
    description: "Lista assets de contenido (/Game, /Engine) con filtro opcional por subcadena del nombre.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: 'Carpeta raíz, ej. "/Game". Defecto "/Game".', default: "/Game" },
        filter: { type: "string", description: "Subcadena del nombre del asset (insensible a mayúsculas)." },
        recursive: { type: "boolean", description: "Incluir subcarpetas (defecto true).", default: true },
        limit: { type: "integer", description: "Máximo de assets devueltos (defecto 200).", default: 200 },
      },
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    build: (args) => wrapPy(`
import unreal, json
path = ${pyStr(String(args.path ?? "/Game"))}
flt = ${pyStr(String(args.filter ?? ""))}.lower()
recursive = ${args.recursive !== false ? "True" : "False"}
limit = ${Number(args.limit ?? 200)}
payload = {"ok": False}
try:
    assets = unreal.EditorAssetLibrary.list_assets(path, recursive=recursive, include_folder=False)
    matched = [a for a in assets if flt in a.lower()]
    payload.update({"ok": True, "path": path, "total": len(assets), "matched": len(matched), "returned": min(len(matched), limit), "assets": matched[:limit]})
except Exception as e:
    payload["error"] = str(e)
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_screenshot: {
    description:
      "Captura una imagen del viewport del editor (high-res screenshot) y devuelve la ruta absoluta del PNG en Saved/Screenshots para revisarla.",
    inputSchema: {
      type: "object",
      properties: {
        width: { type: "integer", description: "Ancho en píxeles (defecto 1920).", default: 1920 },
        height: { type: "integer", description: "Alto en píxeles (defecto 1080).", default: 1080 },
        name: { type: "string", description: "Nombre base del archivo. Defecto 'MCPShot'." },
      },
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    build: (args) => wrapPy(`
import unreal, json, time
w = ${Number(args.width ?? 1920)}
h = ${Number(args.height ?? 1080)}
name = ${pyStr(String(args.name ?? "MCPShot"))} + "_" + time.strftime("%Y%m%d_%H%M%S")
payload = {"ok": False, "shot_name": name}
try:
    ok = unreal.AutomationLibrary.take_high_res_screenshot(w, h, name)
    payload["requested"] = bool(ok)
    payload["ok"] = True
except Exception as e:
    payload["error"] = str(e)
print("${RESULT_MARKER}" + json.dumps(payload, default=str))
`),
  },

  unreal_exec_python: {
    description:
      "Ejecuta código Python arbitrario en el editor de Unreal (herramienta comodín). Usa unreal.* APIs del editor. El resultado incluye stdout/prints y errores/tracebacks.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Código Python a ejecutar en el editor (modo ExecuteFile por defecto)." },
        mode: {
          type: "string",
          enum: [MODE_EXEC_FILE, MODE_EVAL_STATEMENT],
          description: "ExecuteFile (scripts completos) o EvaluateStatement (expresión única, devuelve su valor).",
          default: MODE_EXEC_FILE,
        },
        timeout_seconds: { type: "integer", description: "Timeout en segundos (defecto 120).", default: 120 },
      },
      required: ["code"],
      additionalProperties: false,
    },
    timeoutMs: 0, // dinámico
    build: (args) => String(args.code),
  },
};

// ---------------------------------------------------------------------------
// Motor MCP (JSON-RPC 2.0 sobre stdio, framing por líneas)
// ---------------------------------------------------------------------------
const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26", "2025-06-18"];
const SERVER_INFO = { name: "unreal-mcp", title: "Unreal Engine MCP (Onicromo_Beta)", version: "1.0.0" };
const SERVER_INSTRUCTIONS =
  "Servidor MCP conectado al editor Unreal 5.7 de este proyecto vía Python Remote Execution. " +
  "Usa las herramientas unreal_* para leer y modificar el nivel, spawnear actores, crear Blueprints y ejecutar Python de editor. " +
  "Unidades: centímetros y grados; Z hacia arriba; rotación [Pitch, Yaw, Roll]. " +
  "El editor debe estar abierto y no debe estar en modo PIE prolongado para comandos largos.";

let toolCallQueue: Promise<unknown> = Promise.resolve();

function send(obj: Record<string, unknown>): void {
  Deno.stdout.writeSync(encoder.encode(JSON.stringify(obj) + "\n"));
}

function reply(id: unknown, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function callTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Herramienta desconocida: ${name}`);

  // Herramienta comodín: ensure remoto + ejecución directa
  if (name === "unreal_exec_python") {
    const code = String(args.code ?? "");
    const mode = String(args.mode ?? MODE_EXEC_FILE);
    const timeoutSec = Number(args.timeout_seconds ?? 120);
    const r = await client.runCommand(code, mode, timeoutSec * 1000);
    const parts = [r.output.trim(), r.result.trim()].filter(Boolean);
    return { text: parts.join("\n") || "(sin salida)", isError: !r.success };
  }

  const code = tool.build(args);
  const r = await client.runCommand(code, MODE_EXEC_FILE, tool.timeoutMs);
  const fullText = [r.output, r.result].filter(Boolean).join("\n");

  // Buscar marcador estructurado ###MCP###<json>
  const lines = fullText.split(/\r?\n/);
  let structured: Record<string, unknown> | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const idx = lines[i].indexOf(RESULT_MARKER);
    if (idx !== -1) {
      try {
        structured = JSON.parse(lines[i].slice(idx + RESULT_MARKER.length));
      } catch {
        structured = null;
      }
      break;
    }
  }

  if (structured) {
    const ok = structured.ok !== false && r.success;
    const rest = lines.filter((l) => !l.includes(RESULT_MARKER)).join("\n").trim();
    const text = JSON.stringify(structured, null, 2) + (rest ? `\n--- salida del editor ---\n${rest}` : "");
    return { text, isError: !ok };
  }
  return { text: fullText.trim() || "(sin salida)", isError: !r.success };
}

async function handleMessage(msg: Record<string, unknown>): Promise<void> {
  const method = String(msg.method ?? "");
  const id = msg.id;

  // Notificaciones (sin respuesta)
  if (id === undefined || id === null) {
    return;
  }

  switch (method) {
    case "initialize": {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      const requested = String(params.protocolVersion ?? "");
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[2];
      reply(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
      return;
    }
    case "ping":
      reply(id, {});
      return;
    case "tools/list":
      reply(id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      return;
    case "tools/call": {
      const params = (msg.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      // Serializar llamadas: el canal TCP soporta un comando a la vez
      const pending = toolCallQueue.then(async () => {
        try {
          const { text, isError } = await callTool(name, args);
          reply(id, { content: [{ type: "text", text }], isError });
        } catch (e) {
          reply(id, { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
        }
      });
      toolCallQueue = pending.catch(() => {});
      await pending;
      return;
    }
    default:
      replyError(id, -32601, `Método no soportado: ${method}`);
  }
}

// ---------------------------------------------------------------------------
// Bucle principal: leer JSON-RPC por líneas desde stdin
// ---------------------------------------------------------------------------
log(`Iniciando unreal-mcp (proyecto: ${PROJECT_ROOT})...`);
await client.start();

const decoderStdin = new TextDecoder();
let stdinBuffer = "";
const stdin = Deno.stdin.readable;
const reader = stdin.getReader();
try {
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    stdinBuffer += decoderStdin.decode(value, { stream: true });
    let nl: number;
    while ((nl = stdinBuffer.indexOf("\n")) !== -1) {
      const line = stdinBuffer.slice(0, nl).trim();
      stdinBuffer = stdinBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        await handleMessage(msg);
      } catch (e) {
        log("Error procesando mensaje JSON-RPC:", (e as Error).message);
      }
    }
  }
} finally {
  log("stdin cerrado, apagando...");
  await client.shutdown();
  Deno.exit(0);
}
