import unreal

maps = [
    "/Game/ProyectoIntegrador/Maps/PI_Lvl01_Tutorial",
    "/Game/ProyectoIntegrador/Maps/PI_Lvl02_TwoRooms",
    "/Game/ProyectoIntegrador/Maps/PI_Lvl03_ThreeRooms",
    "/Game/ProyectoIntegrador/Maps/PI_Lvl04_BossAndEnding",
]

les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

for map_path in maps:
    print(f"\n==========================================")
    print(f"MAPA: {map_path}")
    loaded = les.load_level(map_path)
    if not loaded:
        print(f"ERROR cargando {map_path}")
        continue

    world = unreal.EditorLevelLibrary.get_editor_world()
    actors = unreal.EditorLevelLibrary.get_all_level_actors()
    print(f"Total actores: {len(actors)}")

    # Contar por clase
    counts = {}
    for a in actors:
        cls_name = a.get_class().get_name()
        counts[cls_name] = counts.get(cls_name, 0) + 1

    for cls_name, count in sorted(counts.items()):
        print(f"  - {cls_name}: {count}")

    # Listar actores clave
    print("Actores clave:")
    for a in actors:
        label = a.get_actor_label()
        cls_name = a.get_class().get_name()
        if any(k in label.lower() or k in cls_name.lower() for k in ["start", "teleport", "door", "wave", "spawner", "boss", "key", "player"]):
            loc = a.get_actor_location()
            print(f"    * [{label}] ({cls_name}) at ({loc.x:.0f}, {loc.y:.0f}, {loc.z:.0f})")
