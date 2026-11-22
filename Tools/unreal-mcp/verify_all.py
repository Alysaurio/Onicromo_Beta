import unreal

report = {
    "engine": str(unreal.SystemLibrary.get_engine_version()),
    "classes": {},
    "blueprints": {},
    "catalog": 0,
    "maps": {},
    "materials": {}
}

# 1. Clases C++
classes = ['PI_Character', 'PI_GameMode', 'PI_Enemy', 'PI_Projectile', 'PI_Key', 'PI_Door', 'PI_Teleport', 'PI_WaveSpawner', 'PI_HUD', 'PI_PlayerController', 'PI_ShotCatalog']
for c in classes:
    cls = unreal.load_class(None, f"/Script/Onicromo_Beta.{c}")
    report["classes"][c] = cls is not None

# 2. Blueprints
bps = [
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_Character", "PI_Character"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode", "PI_GameMode"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_PlayerController", "PI_PlayerController"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_Enemy", "PI_Enemy"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_Projectile", "PI_Projectile"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_Key", "PI_Key"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_Door", "PI_Door"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_Teleport", "PI_Teleport"),
    ("/Game/ProyectoIntegrador/Blueprints/BP_PI_WaveSpawner", "PI_WaveSpawner"),
    ("/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_HUD", "PI_HUD"),
]
for path, expected_parent in bps:
    bp = unreal.load_asset(path)
    if bp:
        parent = unreal.BlueprintEditorLibrary.get_blueprint_parent_class(bp)
        parent_name = parent.get_name() if parent else "None"
        report["blueprints"][path.split("/")[-1]] = {
            "parent": parent_name,
            "ok": expected_parent in parent_name
        }

# 3. DataAsset Catálogo
cat = unreal.load_asset("/Game/ProyectoIntegrador/Data/DA_PI_ShotCatalog")
if cat:
    configs = cat.get_editor_property("shot_configs")
    report["catalog"] = len(configs)

# 4. Mapas
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
maps = [
    "PI_Lvl01_Tutorial",
    "PI_Lvl02_TwoRooms",
    "PI_Lvl03_ThreeRooms",
    "PI_Lvl04_BossAndEnding"
]
for m in maps:
    p = f"/Game/ProyectoIntegrador/Maps/{m}"
    loaded = les.load_level(p)
    if loaded:
        actors = unreal.EditorLevelLibrary.get_all_level_actors()
        report["maps"][m] = {
            "total_actors": len(actors),
            "classes": list(set(a.get_class().get_name() for a in actors))
        }

# 5. Materiales
materials = [
    "M_PI_Wall", "M_PI_Floor", "M_PI_Door", "M_PI_Key",
    "M_PI_Teleport", "M_PI_Enemy", "M_PI_Boss", "M_PI_Projectile",
    "M_PI_Player", "M_PI_DamageVignette", "M_PI_LowLifeTint"
]
for mat_name in materials:
    mat = unreal.load_asset(f"/Game/ProyectoIntegrador/Materials/{mat_name}")
    report["materials"][mat_name] = mat is not None

import json
print("###VERIFY_REPORT###" + json.dumps(report, indent=2))
