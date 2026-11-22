import unreal

les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

# Cargar clases y assets
gm_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode.BP_PI_GameMode_C")
door_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Door.BP_PI_Door_C")
teleport_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Teleport.BP_PI_Teleport_C")
spawner_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_WaveSpawner.BP_PI_WaveSpawner_C")
enemy_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Enemy.BP_PI_Enemy_C")
key_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Key.BP_PI_Key_C")

m_wall = unreal.load_asset("/Game/ProyectoIntegrador/Materials/M_PI_Wall")
m_floor = unreal.load_asset("/Game/ProyectoIntegrador/Materials/M_PI_Floor")
m_door = unreal.load_asset("/Game/ProyectoIntegrador/Materials/M_PI_Door")
m_teleport = unreal.load_asset("/Game/ProyectoIntegrador/Materials/M_PI_Teleport")
m_enemy = unreal.load_asset("/Game/ProyectoIntegrador/Materials/M_PI_Enemy")
m_boss = unreal.load_asset("/Game/ProyectoIntegrador/Materials/M_PI_Boss")

cube_mesh = unreal.load_asset("/Engine/BasicShapes/Cube.Cube")
cylinder_mesh = unreal.load_asset("/Engine/BasicShapes/Cylinder.Cylinder")

def ensure_environment(world_origin=unreal.Vector(0, 0, 0), bounds_extent=unreal.Vector(3000, 3000, 1000)):
    # Directional Light
    dir_lights = unreal.EditorLevelLibrary.get_all_level_actors()
    has_dir_light = any(a.get_class().get_name() == "DirectionalLight" for a in dir_lights)
    if not has_dir_light:
        dl = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 800), unreal.Rotator(-45, -45, 0))
        if dl:
            dl.set_actor_label("DirectionalLight_PI")

    # Sky Light
    has_sky = any(a.get_class().get_name() == "SkyLight" for a in dir_lights)
    if not has_sky:
        sl = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 900), unreal.Rotator(0, 0, 0))
        if sl:
            sl.set_actor_label("SkyLight_PI")

    # NavMeshBoundsVolume
    has_nav = any(a.get_class().get_name() == "NavMeshBoundsVolume" for a in dir_lights)
    if not has_nav:
        nav = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.NavMeshBoundsVolume, world_origin, unreal.Rotator(0, 0, 0))
        if nav:
            nav.set_actor_label("NavMeshBounds_PI")
            nav.set_actor_scale3d(unreal.Vector(bounds_extent.x / 100.0, bounds_extent.y / 100.0, bounds_extent.z / 100.0))

def apply_material_to_actor(actor, material):
    if not actor or not material:
        return
    smc = actor.get_component_by_class(unreal.StaticMeshComponent)
    if smc:
        smc.set_material(0, material)

def spawn_mesh_actor(mesh, material, location, scale=unreal.Vector(1, 1, 1), label="MeshActor"):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, location, unreal.Rotator(0, 0, 0))
    if actor:
        actor.set_actor_label(label)
        actor.set_actor_scale3d(scale)
        smc = actor.get_component_by_class(unreal.StaticMeshComponent)
        if smc:
            if mesh:
                smc.set_static_mesh(mesh)
            if material:
                smc.set_material(0, material)
    return actor

def setup_world_settings(map_path):
    world = unreal.EditorLevelLibrary.get_editor_world()
    if world and gm_class:
        ws = world.get_world_settings()
        if ws:
            try:
                ws.set_editor_property("default_game_mode", gm_class)
                print(f"WorldSettings GameMode asignado a {map_path}")
            except Exception as e:
                print(f"Error asignando GameMode a {map_path}: {e}")

# =========================================================================
# 1. NIVEL 1 — TUTORIAL (PI_Lvl01_Tutorial)
# =========================================================================
print("\n>>> CONFIGURANDO NIVEL 1: PI_Lvl01_Tutorial")
les.load_level("/Game/ProyectoIntegrador/Maps/PI_Lvl01_Tutorial")

# Limpiar actores obsoletos de versiones previas
for a in unreal.EditorLevelLibrary.get_all_level_actors():
    lbl = a.get_actor_label()
    if any(k in lbl for k in ["Teleport", "Target", "Floor", "Wall", "DirectionalLight_PI", "SkyLight_PI", "NavMeshBounds_PI"]):
        unreal.EditorLevelLibrary.destroy_actor(a)

# Suelo (30x30m)
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 0, -25), unreal.Vector(30, 30, 0.5), "Floor_Tutorial")

# Muros perimetrales
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-1500, 0, 150), unreal.Vector(0.5, 30, 3), "Wall_West")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(1500, 0, 150), unreal.Vector(0.5, 30, 3), "Wall_East")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, -1500, 150), unreal.Vector(30, 0.5, 3), "Wall_South")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, 1500, 150), unreal.Vector(30, 0.5, 3), "Wall_North")

# PlayerStart
starts = [a for a in unreal.EditorLevelLibrary.get_all_level_actors() if a.get_class().get_name() == "PlayerStart"]
if not starts:
    ps = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(-800, 0, 100), unreal.Rotator(0, 0, 0))
    if ps: ps.set_actor_label("PlayerStart_Tutorial")
else:
    starts[0].set_actor_location(unreal.Vector(-800, 0, 100), False, False)

# Dianas de entrenamiento (3 cilindros) para probar disparos
for i, y_offset in enumerate([-400, 0, 400]):
    target = spawn_mesh_actor(cylinder_mesh, m_enemy, unreal.Vector(0, y_offset, 100), unreal.Vector(1.2, 1.2, 2.0), f"Target_Dummy_0{i+1}")
    if target:
        target.tags.append(unreal.Name("Target"))
        target.tags.append(unreal.Name("Destructible"))

# Teletransporte al Nivel 2
if teleport_class:
    tp = unreal.EditorLevelLibrary.spawn_actor_from_class(teleport_class, unreal.Vector(1100, 0, 50), unreal.Rotator(0, 0, 0))
    if tp:
        tp.set_actor_label("Teleport_To_Lvl02")
        tp.set_editor_property("destination_level_name", "/Game/ProyectoIntegrador/Maps/PI_Lvl02_TwoRooms")
        tp.set_editor_property("fade_duration", 1.0)
        apply_material_to_actor(tp, m_teleport)

ensure_environment(unreal.Vector(0, 0, 0), unreal.Vector(3500, 3500, 1000))
setup_world_settings("/Game/ProyectoIntegrador/Maps/PI_Lvl01_Tutorial")
les.save_current_level()
print("PI_Lvl01_Tutorial guardado.")

# =========================================================================
# 2. NIVEL 2 — 2 SALAS CON OLEADAS (PI_Lvl02_TwoRooms)
# =========================================================================
print("\n>>> CONFIGURANDO NIVEL 2: PI_Lvl02_TwoRooms")
les.load_level("/Game/ProyectoIntegrador/Maps/PI_Lvl02_TwoRooms")

for a in unreal.EditorLevelLibrary.get_all_level_actors():
    lbl = a.get_actor_label()
    if any(k in lbl for k in ["Teleport", "Door", "Wave", "Floor", "Wall", "Spawner", "DirectionalLight_PI", "SkyLight_PI", "NavMeshBounds_PI"]):
        unreal.EditorLevelLibrary.destroy_actor(a)

# Sala 1 (Y de -2000 a -400) Centro (0, -1200)
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, -1200, -25), unreal.Vector(20, 16, 0.5), "Floor_Room1")
# Sala 2 (Y de 400 a 2000) Centro (0, 1200)
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 1200, -25), unreal.Vector(20, 16, 0.5), "Floor_Room2")
# Pasillo conector (Y de -400 a 400)
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 0, -25), unreal.Vector(6, 8, 0.5), "Floor_Corridor")

# Muros Sala 1
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-1000, -1200, 150), unreal.Vector(0.5, 16, 3), "Wall_R1_West")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(1000, -1200, 150), unreal.Vector(0.5, 16, 3), "Wall_R1_East")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, -2000, 150), unreal.Vector(20, 0.5, 3), "Wall_R1_South")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-650, -400, 150), unreal.Vector(7, 0.5, 3), "Wall_R1_North_Left")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(650, -400, 150), unreal.Vector(7, 0.5, 3), "Wall_R1_North_Right")

# Muros Pasillo
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-300, 0, 150), unreal.Vector(0.5, 8, 3), "Wall_Corridor_West")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(300, 0, 150), unreal.Vector(0.5, 8, 3), "Wall_Corridor_East")

# Muros Sala 2
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-1000, 1200, 150), unreal.Vector(0.5, 16, 3), "Wall_R2_West")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(1000, 1200, 150), unreal.Vector(0.5, 16, 3), "Wall_R2_East")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-650, 400, 150), unreal.Vector(7, 0.5, 3), "Wall_R2_South_Left")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(650, 400, 150), unreal.Vector(7, 0.5, 3), "Wall_R2_South_Right")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-650, 2000, 150), unreal.Vector(7, 0.5, 3), "Wall_R2_North_Left")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(650, 2000, 150), unreal.Vector(7, 0.5, 3), "Wall_R2_North_Right")

# PlayerStart en Sala 1
starts = [a for a in unreal.EditorLevelLibrary.get_all_level_actors() if a.get_class().get_name() == "PlayerStart"]
if not starts:
    ps = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, -1700, 100), unreal.Rotator(0, 90, 0))
    if ps: ps.set_actor_label("PlayerStart_Lvl02")
else:
    starts[0].set_actor_location(unreal.Vector(0, -1700, 100), False, False)

# Puerta Sala 1 (conector pasillo)
if door_class:
    door1 = unreal.EditorLevelLibrary.spawn_actor_from_class(door_class, unreal.Vector(0, -400, 100), unreal.Rotator(0, 0, 0))
    if door1:
        door1.set_actor_label("Door_Room1_To_Corridor")
        apply_material_to_actor(door1, m_door)

    # Puerta Salida Sala 2
    door2 = unreal.EditorLevelLibrary.spawn_actor_from_class(door_class, unreal.Vector(0, 2000, 100), unreal.Rotator(0, 0, 0))
    if door2:
        door2.set_actor_label("Door_Room2_Exit")
        apply_material_to_actor(door2, m_door)

# WaveSpawner Sala 1 (3 oleadas, spawnea llave en el centro de Sala 1 al terminar)
if spawner_class:
    sp1 = unreal.EditorLevelLibrary.spawn_actor_from_class(spawner_class, unreal.Vector(0, -1200, 50), unreal.Rotator(0, 0, 0))
    if sp1:
        sp1.set_actor_label("WaveSpawner_Room1")
        sp1.set_editor_property("total_waves", 3)
        sp1.set_editor_property("enemies_per_wave", 3)
        sp1.set_editor_property("wave_delay", 2.5)
        sp1.set_editor_property("key_spawn_location", unreal.Vector(0, -1200, 50))
        if enemy_class: sp1.set_editor_property("enemy_class", enemy_class)
        if key_class: sp1.set_editor_property("key_class", key_class)

    # WaveSpawner Sala 2 (3 oleadas, spawnea llave en el centro de Sala 2 al terminar)
    sp2 = unreal.EditorLevelLibrary.spawn_actor_from_class(spawner_class, unreal.Vector(0, 1200, 50), unreal.Rotator(0, 0, 0))
    if sp2:
        sp2.set_actor_label("WaveSpawner_Room2")
        sp2.set_editor_property("total_waves", 3)
        sp2.set_editor_property("enemies_per_wave", 4)
        sp2.set_editor_property("wave_delay", 2.5)
        sp2.set_editor_property("key_spawn_location", unreal.Vector(0, 1200, 50))
        if enemy_class: sp2.set_editor_property("enemy_class", enemy_class)
        if key_class: sp2.set_editor_property("key_class", key_class)

# Teletransporte final al Nivel 3
if teleport_class:
    tp2 = unreal.EditorLevelLibrary.spawn_actor_from_class(teleport_class, unreal.Vector(0, 2300, 50), unreal.Rotator(0, 0, 0))
    if tp2:
        tp2.set_actor_label("Teleport_To_Lvl03")
        tp2.set_editor_property("destination_level_name", "/Game/ProyectoIntegrador/Maps/PI_Lvl03_ThreeRooms")
        tp2.set_editor_property("fade_duration", 1.0)
        apply_material_to_actor(tp2, m_teleport)

ensure_environment(unreal.Vector(0, 0, 0), unreal.Vector(3000, 6000, 1000))
setup_world_settings("/Game/ProyectoIntegrador/Maps/PI_Lvl02_TwoRooms")
les.save_current_level()
print("PI_Lvl02_TwoRooms guardado.")

# =========================================================================
# 3. NIVEL 3 — 3 SALAS CON OLEADAS (PI_Lvl03_ThreeRooms)
# =========================================================================
print("\n>>> CONFIGURANDO NIVEL 3: PI_Lvl03_ThreeRooms")
les.load_level("/Game/ProyectoIntegrador/Maps/PI_Lvl03_ThreeRooms")

for a in unreal.EditorLevelLibrary.get_all_level_actors():
    lbl = a.get_actor_label()
    if any(k in lbl for k in ["Teleport", "Door", "Wave", "Floor", "Wall", "Spawner", "DirectionalLight_PI", "SkyLight_PI", "NavMeshBounds_PI"]):
        unreal.EditorLevelLibrary.destroy_actor(a)

# 3 Salas: Sala 1 (-2200), Sala 2 (0), Sala 3 (2200)
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, -2200, -25), unreal.Vector(18, 14, 0.5), "Floor_Room1")
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, -1350, -25), unreal.Vector(5, 5, 0.5), "Floor_Corridor1")
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 0, -25), unreal.Vector(18, 14, 0.5), "Floor_Room2")
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 1350, -25), unreal.Vector(5, 5, 0.5), "Floor_Corridor2")
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 2500, -25), unreal.Vector(18, 14, 0.5), "Floor_Room3")

# Muros perimetrales
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-900, -2200, 150), unreal.Vector(0.5, 14, 3), "Wall_R1_W")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(900, -2200, 150), unreal.Vector(0.5, 14, 3), "Wall_R1_E")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, -2900, 150), unreal.Vector(18, 0.5, 3), "Wall_R1_S")

spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-900, 0, 150), unreal.Vector(0.5, 14, 3), "Wall_R2_W")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(900, 0, 150), unreal.Vector(0.5, 14, 3), "Wall_R2_E")

spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-900, 2500, 150), unreal.Vector(0.5, 14, 3), "Wall_R3_W")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(900, 2500, 150), unreal.Vector(0.5, 14, 3), "Wall_R3_E")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, 3200, 150), unreal.Vector(18, 0.5, 3), "Wall_R3_N")

# PlayerStart
starts = [a for a in unreal.EditorLevelLibrary.get_all_level_actors() if a.get_class().get_name() == "PlayerStart"]
if not starts:
    ps = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, -2600, 100), unreal.Rotator(0, 90, 0))
    if ps: ps.set_actor_label("PlayerStart_Lvl03")
else:
    starts[0].set_actor_location(unreal.Vector(0, -2600, 100), False, False)

# Puertas (entre sala 1 y 2, entre sala 2 y 3, salida sala 3)
if door_class:
    d1 = unreal.EditorLevelLibrary.spawn_actor_from_class(door_class, unreal.Vector(0, -1500, 100), unreal.Rotator(0, 0, 0))
    if d1:
        d1.set_actor_label("Door_Room1_Exit")
        apply_material_to_actor(d1, m_door)

    d2 = unreal.EditorLevelLibrary.spawn_actor_from_class(door_class, unreal.Vector(0, 1100, 100), unreal.Rotator(0, 0, 0))
    if d2:
        d2.set_actor_label("Door_Room2_Exit")
        apply_material_to_actor(d2, m_door)

    d3 = unreal.EditorLevelLibrary.spawn_actor_from_class(door_class, unreal.Vector(0, 3000, 100), unreal.Rotator(0, 0, 0))
    if d3:
        d3.set_actor_label("Door_Room3_Exit")
        apply_material_to_actor(d3, m_door)

# Spawners para cada sala (3 oleadas cada uno, con spawn de llave en el centro)
if spawner_class:
    for idx, y_pos in enumerate([-2200, 0, 2500]):
        sp = unreal.EditorLevelLibrary.spawn_actor_from_class(spawner_class, unreal.Vector(0, y_pos, 50), unreal.Rotator(0, 0, 0))
        if sp:
            sp.set_actor_label(f"WaveSpawner_Room{idx+1}")
            sp.set_editor_property("total_waves", 3)
            sp.set_editor_property("enemies_per_wave", 3 + idx)
            sp.set_editor_property("wave_delay", 2.5)
            sp.set_editor_property("key_spawn_location", unreal.Vector(0, y_pos, 50))
            if enemy_class: sp.set_editor_property("enemy_class", enemy_class)
            if key_class: sp.set_editor_property("key_class", key_class)

# Teletransporte al Nivel 4 (Boss)
if teleport_class:
    tp3 = unreal.EditorLevelLibrary.spawn_actor_from_class(teleport_class, unreal.Vector(0, 3350, 50), unreal.Rotator(0, 0, 0))
    if tp3:
        tp3.set_actor_label("Teleport_To_Lvl04")
        tp3.set_editor_property("destination_level_name", "/Game/ProyectoIntegrador/Maps/PI_Lvl04_BossAndEnding")
        tp3.set_editor_property("fade_duration", 1.0)
        apply_material_to_actor(tp3, m_teleport)

ensure_environment(unreal.Vector(0, 0, 0), unreal.Vector(3000, 9000, 1000))
setup_world_settings("/Game/ProyectoIntegrador/Maps/PI_Lvl03_ThreeRooms")
les.save_current_level()
print("PI_Lvl03_ThreeRooms guardado.")

# =========================================================================
# 4. NIVEL 4 — SALA DE JEFE FINAL, ESCENA Y CRÉDITOS (PI_Lvl04_BossAndEnding)
# =========================================================================
print("\n>>> CONFIGURANDO NIVEL 4: PI_Lvl04_BossAndEnding")
les.load_level("/Game/ProyectoIntegrador/Maps/PI_Lvl04_BossAndEnding")

for a in unreal.EditorLevelLibrary.get_all_level_actors():
    lbl = a.get_actor_label()
    if any(k in lbl for k in ["Teleport", "Door", "Wave", "Floor", "Wall", "Spawner", "Boss", "Cover", "DirectionalLight_PI", "SkyLight_PI", "NavMeshBounds_PI"]):
        unreal.EditorLevelLibrary.destroy_actor(a)

# Arena del jefe (35x35m)
spawn_mesh_actor(cube_mesh, m_floor, unreal.Vector(0, 0, -25), unreal.Vector(35, 35, 0.5), "Floor_BossArena")

# Muros Arena
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(-1750, 0, 200), unreal.Vector(0.5, 35, 4), "Wall_Boss_W")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(1750, 0, 200), unreal.Vector(0.5, 35, 4), "Wall_Boss_E")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, -1750, 200), unreal.Vector(35, 0.5, 4), "Wall_Boss_S")
spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(0, 1750, 200), unreal.Vector(35, 0.5, 4), "Wall_Boss_N")

# Coberturas simples en la arena (4 pilares)
for i, (cx, cy) in enumerate([(-700, -700), (700, -700), (-700, 700), (700, 700)]):
    spawn_mesh_actor(cube_mesh, m_wall, unreal.Vector(cx, cy, 100), unreal.Vector(1.5, 1.5, 2.5), f"Cover_Pillar_0{i+1}")

# PlayerStart
starts = [a for a in unreal.EditorLevelLibrary.get_all_level_actors() if a.get_class().get_name() == "PlayerStart"]
if not starts:
    ps = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(0, -1200, 100), unreal.Rotator(0, 90, 0))
    if ps: ps.set_actor_label("PlayerStart_BossArena")
else:
    starts[0].set_actor_location(unreal.Vector(0, -1200, 100), False, False)

# Spawner del Jefe Final (1 oleada, 1 boss de mayor tamaño y salud, spawnea llave de salida)
if spawner_class:
    boss_spawner = unreal.EditorLevelLibrary.spawn_actor_from_class(spawner_class, unreal.Vector(0, 400, 50), unreal.Rotator(0, 0, 0))
    if boss_spawner:
        boss_spawner.set_actor_label("WaveSpawner_Boss")
        boss_spawner.set_editor_property("total_waves", 1)
        boss_spawner.set_editor_property("enemies_per_wave", 1)
        boss_spawner.set_editor_property("wave_delay", 1.0)
        boss_spawner.set_editor_property("key_spawn_location", unreal.Vector(0, 400, 50))
        if enemy_class: boss_spawner.set_editor_property("enemy_class", enemy_class)
        if key_class: boss_spawner.set_editor_property("key_class", key_class)

# Puerta de salida del Boss
if door_class:
    boss_door = unreal.EditorLevelLibrary.spawn_actor_from_class(door_class, unreal.Vector(0, 1500, 100), unreal.Rotator(0, 0, 0))
    if boss_door:
        boss_door.set_actor_label("Door_BossExit")
        apply_material_to_actor(boss_door, m_door)

# Punto de salida / créditos
if teleport_class:
    tp_end = unreal.EditorLevelLibrary.spawn_actor_from_class(teleport_class, unreal.Vector(0, 1800, 50), unreal.Rotator(0, 0, 0))
    if tp_end:
        tp_end.set_actor_label("Teleport_To_EndingCredits")
        # El teletransporte final ejecuta el fade y muestra los créditos
        tp_end.set_editor_property("destination_level_name", "/Game/ProyectoIntegrador/Maps/PI_Lvl01_Tutorial")
        tp_end.set_editor_property("fade_duration", 1.5)
        apply_material_to_actor(tp_end, m_teleport)

ensure_environment(unreal.Vector(0, 0, 0), unreal.Vector(5000, 5000, 1200))
setup_world_settings("/Game/ProyectoIntegrador/Maps/PI_Lvl04_BossAndEnding")
les.save_current_level()
print("PI_Lvl04_BossAndEnding guardado.")

print("\n=== TODOS LOS 4 NIVELES ACTUALIZADOS Y GUARDADOS EXITOSAMENTE ===")
