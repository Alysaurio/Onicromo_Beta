"""Banco de pruebas automatizado de percepcion (UPawnSensingComponent).

Se ejecuta dentro del editor (Python remoto) y avanza solo: registra un callback
de Slate post-tick, mueve NPC/jugador a geometrias deterministas, muestrea el
Blackboard frame a frame y guarda telemetria. No usa sleep (bloquearia el game
thread y el mundo no avanzaria).

REQUISITO DE PRECISION: el editor debe tener el FOCO de Windows durante el
barrido. Sin foco, UEditorEngine::GetMaxTickRate() devuelve 3.0f y el mundo de
PIE avanza en cuantos de 333.3 ms (todas las medidas salen multiplos de 333.3).
Comprobar con bench_fps(): debe dar >50 Hz.

Uso (desde unreal_exec_python):
    exec(open(r'A:\\Proyectos\\Unreal\\Onicromo_Beta\\Tools\\perception_bench.py').read())
    bench_fps()            # verificar que el mundo corre rapido
    bench_setup()          # congela actores, elige oclusor, prepara estado
    bench_start()          # arranca el barrido
    bench_status()         # progreso / tablas
    bench_report()         # todo el crudo
    bench_stop()           # detiene y desregistra

Unidades: centimetros, grados. Z-up. NPC mira hacia +X (yaw 0).
"""

import math
import random
import unreal

B = globals().setdefault("BENCH", {})

NPC_YAW = 0.0
DEFAULT_D = 800.0
Z = 1000.0
FAR = 20000.0

TIMEOUT_SEEN = 1.6      # ventana para que el NPC llegue a vernos
TIMEOUT_BB = 2.0        # ventana extra para que el Blackboard se actualice
TIMEOUT_LOS = 4.0       # ventana para perder vision tras ocluir
RESET_WAIT_MIN = 1.2
PRE_WAIT_DEFAULT = 2.0


# --------------------------------------------------------------------------- #
# utilidades
# --------------------------------------------------------------------------- #
def _rot(pitch, yaw, roll):
    """Rotator por campos (el constructor Python usa orden roll,pitch,yaw)."""
    r = unreal.Rotator()
    r.pitch = float(pitch)
    r.yaw = float(yaw)
    r.roll = float(roll)
    return r


def _vec(x, y, z):
    v = unreal.Vector()
    v.x = float(x)
    v.y = float(y)
    v.z = float(z)
    return v


def _now():
    return unreal.GameplayStatics.get_time_seconds(B["world"])


def _bb():
    return B["bb"]


def _reset_flags(clear_posicion=True):
    npc = B["npc"]
    try:
        npc.set_editor_property("ISeeEnemy", False)
    except Exception:
        pass
    try:
        npc.set_editor_property("SeeEnemy", None)
    except Exception:
        pass
    bb = _bb()
    try:
        bb.set_value_as_bool("HasSeePlayer?", False)
        bb.set_value_as_object("ObjectReferenceEnemy", None)
        if clear_posicion:
            bb.set_value_as_vector("PosicionEnemy", _vec(0, 0, 0))
    except Exception:
        pass


def _sample():
    npc, bb = B["npc"], _bb()
    obj = None
    try:
        obj = bb.get_value_as_object("ObjectReferenceEnemy")
    except Exception:
        pass
    return {
        "is_see": bool(npc.get_editor_property("ISeeEnemy")),
        "has_see": bool(bb.get_value_as_bool("HasSeePlayer?")),
        "obj": obj.get_name() if obj else None,
    }


def _look_yaw(from_p, to_p):
    """Yaw (grados) para mirar de from_p a to_p."""
    d = _vec(to_p.x - from_p.x, to_p.y - from_p.y, 0.0)
    return math.degrees(math.atan2(d.y, d.x))


def _place(bearing_deg, dist, base=None):
    """NPC en `base` mirando +X; jugador a `dist` cm con ese rumbo (0 = al frente)."""
    base = base if base is not None else _vec(0, 0, Z)
    npc, player = B["npc"], B["player"]
    npc.set_actor_location(base, False, False)
    npc.set_actor_rotation(_rot(0, NPC_YAW, 0), False)
    b = math.radians(bearing_deg)
    player.set_actor_location(
        _vec(base.x + dist * math.cos(b), base.y + dist * math.sin(b), base.z),
        False, False,
    )


def _park_player():
    _place(0, FAR)


def _trace(start, end):
    """Devuelve (bloquea, nombre_actor, punto_impacto, distancia)."""
    w = B["world"]
    hit = None
    try:
        hit = unreal.SystemLibrary.line_trace_single(
            w, start, end, unreal.TraceTypeQuery.TRACE_TYPE_QUERY1,
            True, [], unreal.DrawDebugTrace.NONE, True)
    except Exception:
        return (None, None, None, None)
    if hit is None:
        return (False, None, None, None)
    t = hit.to_tuple()
    blocking = bool(t[0])
    actor = t[9] if len(t) > 9 else None
    name = None
    try:
        name = actor.get_actor_label() if actor else None
    except Exception:
        name = str(actor)
    return (blocking, name, t[4], t[3])


def _los():
    """Oraculo: el mismo LineOfSightTo que usa PawnSensingComponent."""
    try:
        return bool(B["ctrl"].line_of_sight_to(B["player"], _vec(0, 0, 0), True))
    except Exception:
        return None


def _pick_occluder():
    """Elige un oclusor real validado con el propio LineOfSightTo del motor.

    Prueba cada mueble del nivel por sus dos ejes: el jugador debe ser VISIBLE a
    150 cm de una cara y estar OCLUIDO al otro lado. Devuelve
    (label, npc_p, near_p, far_p, eje).
    """
    w, npc, pl = B["world"], B["npc"], B["player"]
    cands = []
    for a in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.StaticMeshActor):
        try:
            o, e = a.get_actor_bounds(False)
        except Exception:
            continue
        if e.z < 100.0:
            continue
        cands.append((a, o, e))
    cands.sort(key=lambda m: -(m[2].z * max(m[2].x, m[2].y)))

    for a, o, e in cands[:20]:
        for axis in ("x", "y"):
            ext = e.x if axis == "x" else e.y
            if ext < 120.0:
                continue
            if axis == "x":
                npc_p = _vec(o.x + ext + 400.0, o.y, o.z)
                near_p = _vec(o.x + ext + 150.0, o.y, o.z)
                far_p = _vec(o.x - ext - 400.0, o.y, o.z)
            else:
                npc_p = _vec(o.x, o.y + ext + 400.0, o.z)
                near_p = _vec(o.x, o.y + ext + 150.0, o.z)
                far_p = _vec(o.x, o.y - ext - 400.0, o.z)
            d_far = max(abs(far_p.x - npc_p.x), abs(far_p.y - npc_p.y))
            if d_far > 1900.0:
                continue
            npc.set_actor_location(npc_p, False, False)
            pl.set_actor_location(near_p, False, False)
            if _los() is not True:
                continue
            pl.set_actor_location(far_p, False, False)
            if _los() is not False:
                continue
            return (a.get_actor_label(), npc_p, near_p, far_p, axis)
    return None


# --------------------------------------------------------------------------- #
# diagnostico de framerate
# --------------------------------------------------------------------------- #
def bench_fps(n=40):
    """Mide el ritmo real del MUNDO (no de Slate). <50 Hz => el editor no tiene foco."""
    F = B.setdefault("fps", {"dts": [], "h": None})
    F["dts"] = []
    w = B.get("world")
    if w is None:
        ws = unreal.EditorLevelLibrary.get_pie_worlds(True)
        w = ws[0] if ws else None
        B["world"] = w
    F["last"] = None

    def _cb(dt):
        t = float(unreal.GameplayStatics.get_time_seconds(w))
        if F.get("last") is not None:
            F["dts"].append(t - F["last"])
        F["last"] = t
        if len(F["dts"]) >= n and F.get("h"):
            unreal.unregister_slate_post_tick_callback(F["h"])
            F["h"] = None

    if F.get("h"):
        try:
            unreal.unregister_slate_post_tick_callback(F["h"])
        except Exception:
            pass
    F["h"] = unreal.register_slate_post_tick_callback(_cb)
    return "midiendo... (llama bench_fps_report())"


def bench_fps_report():
    L = (B.get("fps") or {}).get("dts") or []
    if not L:
        return "sin muestras aun"
    m = sum(L) / len(L)
    print("mundo dt: n=%d min=%.4f max=%.4f media=%.4f -> %.1f Hz (cuanto %.0f ms)"
          % (len(L), min(L), max(L), m, 1.0 / m, m * 1000.0))
    if m > 0.02:
        print("AVISO: mundo lento (%.1f Hz). El editor no tiene el foco de "
              "Windows: las medidas saldrian cuantizadas." % (1.0 / m))
    return None


# --------------------------------------------------------------------------- #
# setup
# --------------------------------------------------------------------------- #
def bench_find():
    ws = unreal.EditorLevelLibrary.get_pie_worlds(True)
    if not ws:
        return None, None, None
    w = ws[0]
    npc = player = None
    for p in unreal.GameplayStatics.get_all_actors_of_class(w, unreal.Pawn):
        cn = p.get_class().get_name()
        if cn.startswith("BP_NPCTPCH"):
            npc = p
        elif "TopDownCharacter" in cn:
            player = p
    return w, npc, player


def bench_setup(dist=DEFAULT_D):
    w, npc, player = bench_find()
    if not w or not npc or not player:
        print("SETUP FALLIDO: falta PIE, NPC o jugador ->", w, npc, player)
        return None

    for p in (npc, player):
        cm = p.get_component_by_class(unreal.CharacterMovementComponent)
        cm.set_component_tick_enabled(False)
        cm.set_editor_property("gravity_scale", 0.0)

    ctrl = npc.get_controller()
    brain = ctrl.get_editor_property("brain_component")
    if brain:
        try:
            brain.stop_logic("bench")
        except Exception:
            pass

    B.clear()
    B.update({
        "world": w, "npc": npc, "player": player, "ctrl": ctrl, "brain": brain,
        "bb": ctrl.get_editor_property("blackboard"),
        "ps": npc.get_component_by_class(unreal.PawnSensingComponent),
        "dist": float(dist), "reset_wait": PRE_WAIT_DEFAULT,
        "trials": [], "idx": 0, "results": [], "running": False,
        "handle": None, "err": None, "phase": None, "t0": 0.0,
        "probe_delay": None, "fps": {"dts": [], "h": None},
    })
    _place(0, dist)
    _reset_flags()
    B["occluder"] = _pick_occluder()

    ps = B["ps"]
    B["ps_orig"] = {
        "angle": ps.get_editor_property("peripheral_vision_angle"),
        "interval": ps.get_editor_property("sensing_interval"),
        "radius": ps.get_editor_property("sight_radius"),
    }
    print("SETUP OK")
    print("  mundo      :", w.get_name())
    print("  NPC        :", npc.get_actor_label(),
          "| controlador:", ctrl.get_class().get_name() if ctrl else None)
    print("  radio      :", ps.get_editor_property("sight_radius"))
    print("  angulo     :", ps.get_editor_property("peripheral_vision_angle"),
          "(semiangulo -> FOV total", ps.get_editor_property("peripheral_vision_angle") * 2, "grados)")
    print("  intervalo  :", ps.get_editor_property("sensing_interval"))
    print("  distancia  :", dist, "cm")
    print("  original   :", B["ps_orig"])
    occ = B.get("occluder")
    if occ:
        print("  oclusor    :", occ[0], "| NPC", occ[1], "| cerca", occ[2],
              "| detras", occ[3], "| eje", occ[4], "(LOS validado por el motor)")
    else:
        print("  oclusor    : NO ENCONTRADO (los trials LOS se omitiran)")
    return True


# --------------------------------------------------------------------------- #
# definicion de trials
# --------------------------------------------------------------------------- #
def bench_build(angles=(90, 120, 140, 160),
                bearings=(0, 45, 90, 120, 135, 150, 170, 180),
                intervals=(0.5, 0.2, 0.1), lat_n=8, los_n=3):
    trials = [{"kind": "probe"}]
    for a in angles:
        for b in bearings:
            trials.append({"kind": "angle", "angle": a, "bearing": b})
    for i in intervals:
        for _n in range(lat_n):
            trials.append({"kind": "latency", "interval": i, "bearing": 0})
    for _n in range(los_n):
        trials.append({"kind": "los", "angle": 90, "interval": 0.5})
    B["trials"] = trials
    B["idx"] = 0
    B["results"] = []
    print("trials:", len(trials),
          "| angle:", sum(1 for t in trials if t["kind"] == "angle"),
          "| latency:", sum(1 for t in trials if t["kind"] == "latency"),
          "| los:", sum(1 for t in trials if t["kind"] == "los"))
    return len(trials)


# --------------------------------------------------------------------------- #
# maquina de estados (1 paso por frame)
# --------------------------------------------------------------------------- #
def _trial():
    i = B["idx"]
    return B["trials"][i] if i < len(B["trials"]) else None


def _advance(result=None):
    if result is not None:
        B["results"].append(result)
    B["idx"] += 1
    B["phase"] = None
    B["stamps"] = {}
    if B["idx"] >= len(B["trials"]):
        bench_finish()


def _apply_sensing(trial):
    ps = B["ps"]
    if "angle" in trial:
        ps.set_peripheral_vision_angle(float(trial["angle"]))
    if "interval" in trial:
        ps.set_sensing_interval(float(trial["interval"]))


def bench_tick(dt):
    try:
        if not B.get("running"):
            return
        trial = _trial()
        if trial is None:
            bench_finish()
            return
        now = _now()
        phase = B.get("phase")
        st = B.setdefault("stamps", {})

        # --- fase None: reset duro (jugador muy lejos) ---------------------- #
        if phase is None:
            _apply_sensing(trial)
            _reset_flags()
            # jitter: sin el, la fase del temporizador de sensing queda clavada y
            # la latencia medida se concentra siempre en el mismo punto.
            B["jitter_amt"] = random.random() * float(trial.get("interval") or 0.5)
            if trial["kind"] == "probe":
                # el probe necesita vernos primero para medir cuanto tarda en soltar
                _place(0, B["dist"])
                _reset_flags()
                B["phase"] = "probe_seen"
                B["t0"] = now
                return
            _park_player()
            B["phase"] = "pre"
            B["t0"] = now
            return

        # --- probe: medir el retardo de ResetEnemy -------------------------- #
        if phase == "probe_seen":
            if _sample()["is_see"]:
                _park_player()
                B["phase"] = "probe_lost"
                B["t0"] = now
            elif now - B["t0"] > TIMEOUT_SEEN:
                _advance({"kind": "probe", "delay_ms": None,
                          "error": "no llego a vernos al inicio"})
            return

        if phase == "probe_lost":
            if not _sample()["is_see"]:
                ms = round((now - B["t0"]) * 1000.0, 1)
                B["probe_delay"] = ms
                B["reset_wait"] = max(RESET_WAIT_MIN, ms / 1000.0 + 0.6)
                _advance({"kind": "probe", "delay_ms": ms,
                          "reset_wait": round(B["reset_wait"], 2)})
            elif now - B["t0"] > 5.0:
                _advance({"kind": "probe", "delay_ms": None,
                          "error": "sigue viendo tras 5 s lejos"})
            return

        if phase == "pre":
            if now - B["t0"] >= (B.get("reset_wait") or PRE_WAIT_DEFAULT) + B.get("jitter_amt", 0.0):
                if trial["kind"] == "los":
                    occ = B.get("occluder")
                    if not occ:
                        _advance({"kind": "los", "error": "sin oclusor"})
                        return
                    _lbl, npc_p, near_p, _far_p, _axis = occ
                    B["npc"].set_actor_location(npc_p, False, False)
                    B["npc"].set_actor_rotation(_rot(0, _look_yaw(npc_p, near_p), 0), False)
                    B["player"].set_actor_location(near_p, False, False)
                    B["los_ok"] = _los()
                else:
                    _place(trial.get("bearing", 0), B["dist"])
                _reset_flags()
                B["phase"] = "run"
                B["t0"] = now
                B["stamps"] = {}
            return

        # --- fase run: ventana de deteccion -------------------------------- #
        if phase == "run":
            s = _sample()
            if s["is_see"]:
                st.setdefault("is_see", round((now - B["t0"]) * 1000.0, 1))
            if s["has_see"]:
                st.setdefault("bb", round((now - B["t0"]) * 1000.0, 1))

            if trial["kind"] == "angle":
                if s["is_see"]:
                    _advance({"kind": "angle", "angle": trial["angle"],
                              "bearing": trial["bearing"], "dist": B["dist"],
                              "detect": True, "bb": s["has_see"],
                              "obj": s["obj"],
                              "detect_ms": st.get("is_see")})
                elif now - B["t0"] > TIMEOUT_SEEN:
                    _advance({"kind": "angle", "angle": trial["angle"],
                              "bearing": trial["bearing"], "dist": B["dist"],
                              "detect": False, "bb": s["has_see"],
                              "obj": s["obj"], "detect_ms": None})
                return

            if trial["kind"] == "latency":
                if s["has_see"]:
                    _advance({"kind": "latency", "interval": trial["interval"],
                              "is_see_ms": st.get("is_see"),
                              "bb_ms": st.get("bb"),
                              "latency_ms": ((st.get("bb") or 0.0) - (st.get("is_see") or 0.0)),
                              "total_ms": st.get("bb")})
                elif now - B["t0"] > TIMEOUT_SEEN + TIMEOUT_BB:
                    _advance({"kind": "latency", "interval": trial["interval"],
                              "is_see_ms": st.get("is_see"), "bb_ms": None,
                              "latency_ms": None, "total_ms": None,
                              "error": "bb nunca se escribio" if s["is_see"] else "no vio"})
                return

            # los: esperar a que vea, luego mover al jugador tras el oclusor
            if trial["kind"] != "los":
                _advance({"kind": trial["kind"], "error": "tipo desconocido"})
                return
            if s["is_see"]:
                occ = B.get("occluder")
                _lbl, npc_p, _near_p, far_p, _axis = occ
                B["player"].set_actor_location(far_p, False, False)
                B["phase"] = "los_wall"
                B["t0"] = now
                B["stamps"] = {}
                B["los_dist"] = round(math.hypot(far_p.x - npc_p.x, far_p.y - npc_p.y))
                B["los_broken"] = _los() is False
                B["wall_ok"] = B["los_broken"]
            elif now - B["t0"] > TIMEOUT_SEEN:
                _advance({"kind": "los", "error": "no llego a vernos antes"})
            return

        # --- fase los_wall: perdida de vision ------------------------------ #
        if phase == "los_wall":
            s = _sample()
            if not s["is_see"]:
                st.setdefault("lost", round((now - B["t0"]) * 1000.0, 1))
            if s["has_see"] is False and st.get("lost") is not None:
                st.setdefault("bb_off", round((now - B["t0"]) * 1000.0, 1))
            if st.get("lost") is not None and st.get("bb_off") is not None:
                _advance({"kind": "los", "lose_ms": st["lost"],
                          "bb_off_ms": st["bb_off"], "dist": B.get("los_dist"),
                          "los_broken": B.get("los_broken")})
            elif st.get("lost") is not None and now - B["t0"] > TIMEOUT_LOS:
                _advance({"kind": "los", "lose_ms": st["lost"], "bb_off_ms": None,
                          "dist": B.get("los_dist"),
                          "los_broken": B.get("los_broken"),
                          "note": "BB nunca se limpio (HasSeePlayer? sigue true)"})
            elif st.get("lost") is None and now - B["t0"] > TIMEOUT_LOS:
                _advance({"kind": "los", "lose_ms": None, "bb_off_ms": None,
                          "dist": B.get("los_dist"),
                          "los_broken": B.get("los_broken"),
                          "error": "ISeeEnemy no cayo (LOS del motor=%s)" % B.get("los_broken")})
            return
    except Exception as e:
        B["err"] = str(e)
        bench_finish()


# --------------------------------------------------------------------------- #
# control
# --------------------------------------------------------------------------- #
def bench_start():
    if not B:
        print("llama antes a bench_setup()")
        return None
    if not B.get("trials"):
        bench_build()
    if B.get("handle"):
        try:
            unreal.unregister_slate_post_tick_callback(B["handle"])
        except Exception:
            pass
    B.update({"running": True, "idx": 0, "results": [], "phase": None,
              "err": None, "stamps": {}, "probe_delay": None})
    B["handle"] = unreal.register_slate_post_tick_callback(bench_tick)
    print("bench arrancado | trials:", len(B["trials"]),
          "| reset_wait:", B.get("reset_wait"))
    return True


def bench_finish():
    B["running"] = False
    h = B.get("handle")
    if h:
        try:
            unreal.unregister_slate_post_tick_callback(h)
        except Exception:
            pass
    B["handle"] = None
    print("bench FIN | resultados:", len(B["results"]), "| error:", B.get("err"))


def bench_stop():
    bench_finish()
    return "stopped"


def bench_status(verbose=False):
    if not B:
        return "sin setup"
    trials = B.get("trials") or []
    res = B.get("results") or []
    print("running:", B.get("running"), "| idx:", B.get("idx"), "/", len(trials),
          "| phase:", B.get("phase"), "| resultados:", len(res),
          "| err:", B.get("err"), "| reset_wait:", B.get("reset_wait"))

    probe = [r for r in res if r.get("kind") == "probe"]
    if probe:
        print("\n--- PROBE: retardo de ResetEnemy al salir del radio ---")
        for r in probe:
            print("  ", r)

    ang = [r for r in res if r.get("kind") == "angle"]
    if ang:
        bs = [0, 45, 90, 120, 135, 150, 170, 180]
        print("\n--- ANGULO: detecta? (rumbo del jugador respecto al NPC) ---")
        print("   ang | " + " ".join(f"{b:>4}" for b in bs))
        for a in (90, 120, 140, 160):
            row = {r["bearing"]: (" SI " if r["detect"] else " -- ") for r in ang if r["angle"] == a}
            if row:
                print(f"  {a:>3} | " + " ".join(f"{row.get(b,'   ?'):>4}" for b in bs))

    lat = [r for r in res if r.get("kind") == "latency"]
    if lat:
        print("\n--- LATENCIA (ms) ---")
        print("  intervalo |  n |  sensor->ISeeEnemy | ISeeEnemy->BB | total entrada->BB")
        for iv in (0.5, 0.2, 0.1):
            rows = [r for r in lat if r["interval"] == iv and r.get("bb_ms") is not None]
            if not rows:
                continue
            sen = [r["is_see_ms"] for r in rows]
            dif = [r["latency_ms"] for r in rows]
            tot = [r["total_ms"] for r in rows]

            def _f(v):
                return "%.0f/%.0f/%.0f" % (min(v), sum(v) / len(v), max(v))
            print(f"  {iv:>9}s | {len(rows):>2} | {_f(sen):>17} | {_f(dif):>13} | {_f(tot):>20}")
        fails = [r for r in lat if r.get("bb_ms") is None]
        if fails:
            print("  fallos:", len(fails), [r.get("error") for r in fails])

    los = [r for r in res if r.get("kind") == "los"]
    if los:
        print("\n--- OCLUSION ---")
        for r in los:
            print("  ", r)

    if verbose:
        print("\ncrudo:")
        for r in res:
            print("  ", r)
    return None


def bench_report():
    bench_status(verbose=True)
