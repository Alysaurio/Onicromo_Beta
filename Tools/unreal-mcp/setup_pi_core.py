import unreal

def log(msg):
    print(f"[setup_pi] {msg}")

# 1. Reparent Blueprints
bp_map = {
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Character": "/Script/Onicromo_Beta.PI_Character",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode": "/Script/Onicromo_Beta.PI_GameMode",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_PlayerController": "/Script/Onicromo_Beta.PI_PlayerController",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Enemy": "/Script/Onicromo_Beta.PI_Enemy",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Projectile": "/Script/Onicromo_Beta.PI_Projectile",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Key": "/Script/Onicromo_Beta.PI_Key",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Door": "/Script/Onicromo_Beta.PI_Door",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Teleport": "/Script/Onicromo_Beta.PI_Teleport",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_WaveSpawner": "/Script/Onicromo_Beta.PI_WaveSpawner",
}

for bp_path, parent_class_path in bp_map.items():
    bp = unreal.load_asset(bp_path)
    if not bp:
        log(f"ADVERTENCIA: No se pudo cargar {bp_path}")
        continue
    new_parent = unreal.load_class(None, parent_class_path)
    if not new_parent:
        log(f"ERROR: Clase padre {parent_class_path} no encontrada")
        continue
    try:
        success = unreal.BlueprintEditorLibrary.reparent_blueprint(bp, new_parent)
        log(f"Reparent {bp.get_name()} -> {new_parent.get_name()}: {success}")
        unreal.BlueprintEditorLibrary.compile_blueprint(bp)
        unreal.EditorAssetLibrary.save_loaded_asset(bp)
    except Exception as e:
        log(f"Excepcion reparentando {bp_path}: {e}")

# 2. Crear / Actualizar DataAsset DA_PI_ShotCatalog
shot_catalog_pkg = "/Game/ProyectoIntegrador/Data"
shot_catalog_name = "DA_PI_ShotCatalog"
shot_catalog_path = f"{shot_catalog_pkg}/{shot_catalog_name}"

proj_bp_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Projectile.BP_PI_Projectile_C")
if not proj_bp_class:
    proj_bp_class = unreal.load_class(None, "/Script/Onicromo_Beta.PI_Projectile")

# Asegurar carpeta
if not unreal.EditorAssetLibrary.does_directory_exist(shot_catalog_pkg):
    unreal.EditorAssetLibrary.make_directory(shot_catalog_pkg)

catalog_asset = unreal.load_asset(shot_catalog_path)
if not catalog_asset:
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    factory = unreal.DataAssetFactory()
    catalog_class = unreal.load_class(None, "/Script/Onicromo_Beta.PI_ShotCatalog")
    factory.set_editor_property("data_asset_class", catalog_class)
    catalog_asset = asset_tools.create_asset(shot_catalog_name, shot_catalog_pkg, catalog_class, factory)
    log(f"Creado DataAsset DA_PI_ShotCatalog: {catalog_asset is not None}")

if catalog_asset:
    # Definir los 10 tipos de disparo
    # 0: Estándar rápido, 1: Escopeta, 2: Ráfaga triple, 3: Láser perforante, 4: Rebotador,
    # 5: Explosivo área, 6: Pesado alto impacto, 7: Doble paralelo, 8: Ondas senoidal, 9: Cadencia alta
    shot_configs = [
        # 1. Estándar rápido
        {"pellet_count": 1, "spread_degrees": 0.0, "projectile_speed": 1800.0, "damage": 1.0, "fire_rate": 0.18, "b_piercing": False, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
        # 2. Escopeta / dispersión
        {"pellet_count": 6, "spread_degrees": 35.0, "projectile_speed": 1500.0, "damage": 0.8, "fire_rate": 0.45, "b_piercing": False, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
        # 3. Ráfaga triple
        {"pellet_count": 3, "spread_degrees": 12.0, "projectile_speed": 1600.0, "damage": 1.0, "fire_rate": 0.30, "b_piercing": False, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
        # 4. Láser / rayo perforante
        {"pellet_count": 1, "spread_degrees": 0.0, "projectile_speed": 2800.0, "damage": 2.0, "fire_rate": 0.35, "b_piercing": True, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
        # 5. Rebotador
        {"pellet_count": 1, "spread_degrees": 0.0, "projectile_speed": 1400.0, "damage": 1.2, "fire_rate": 0.25, "b_piercing": False, "b_bouncing": True, "b_explosive": False, "explosion_radius": 0.0},
        # 6. Explosivo / área
        {"pellet_count": 1, "spread_degrees": 0.0, "projectile_speed": 1200.0, "damage": 2.5, "fire_rate": 0.50, "b_piercing": False, "b_bouncing": False, "b_explosive": True, "explosion_radius": 300.0},
        # 7. Pesado alto impacto
        {"pellet_count": 1, "spread_degrees": 0.0, "projectile_speed": 1000.0, "damage": 4.0, "fire_rate": 0.60, "b_piercing": False, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
        # 8. Doble paralelo
        {"pellet_count": 2, "spread_degrees": 6.0, "projectile_speed": 1600.0, "damage": 1.0, "fire_rate": 0.22, "b_piercing": False, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
        # 9. Ondas / senoidal
        {"pellet_count": 4, "spread_degrees": 24.0, "projectile_speed": 1300.0, "damage": 1.1, "fire_rate": 0.28, "b_piercing": True, "b_bouncing": True, "b_explosive": False, "explosion_radius": 0.0},
        # 10. Cadencia alta / ligero
        {"pellet_count": 1, "spread_degrees": 4.0, "projectile_speed": 2000.0, "damage": 0.5, "fire_rate": 0.08, "b_piercing": False, "b_bouncing": False, "b_explosive": False, "explosion_radius": 0.0},
    ]

    configs_array = []
    for sc in shot_configs:
        cfg = unreal.IShotConfig()
        cfg.set_editor_property("projectile_class", proj_bp_class)
        cfg.set_editor_property("pellet_count", sc["pellet_count"])
        cfg.set_editor_property("spread_degrees", sc["spread_degrees"])
        cfg.set_editor_property("projectile_speed", sc["projectile_speed"])
        cfg.set_editor_property("damage", sc["damage"])
        cfg.set_editor_property("fire_rate", sc["fire_rate"])
        cfg.set_editor_property("piercing", sc["b_piercing"])
        cfg.set_editor_property("bouncing", sc["b_bouncing"])
        cfg.set_editor_property("explosive", sc["b_explosive"])
        cfg.set_editor_property("explosion_radius", sc["explosion_radius"])
        configs_array.append(cfg)

    catalog_asset.set_editor_property("shot_configs", configs_array)
    unreal.EditorAssetLibrary.save_loaded_asset(catalog_asset)
    log(f"Configurados {len(configs_array)} tipos de disparo en DA_PI_ShotCatalog")

# 3. Asignar DA_PI_ShotCatalog a BP_PI_GameMode y BP_PI_Character
gm_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode")
if gm_bp:
    cdo = unreal.get_default_object(gm_bp.generated_class)
    if cdo and catalog_asset:
        try:
            cdo.set_editor_property("shot_catalog", catalog_asset)
            char_bp_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Character.BP_PI_Character_C")
            pc_bp_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_PlayerController.BP_PI_PlayerController_C")
            if char_bp_class:
                cdo.set_editor_property("default_pawn_class", char_bp_class)
            if pc_bp_class:
                cdo.set_editor_property("player_controller_class", pc_bp_class)
            unreal.BlueprintEditorLibrary.compile_blueprint(gm_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(gm_bp)
            log("BP_PI_GameMode configurado con ShotCatalog, DefaultPawn y PlayerController")
        except Exception as e:
            log(f"Error configurando BP_PI_GameMode CDO: {e}")

char_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Character")
if char_bp and catalog_asset:
    cdo = unreal.get_default_object(char_bp.generated_class)
    if cdo:
        try:
            cdo.set_editor_property("shot_catalog", catalog_asset)
            cdo.set_editor_property("max_lives", 3)
            cdo.set_editor_property("current_lives", 3)
            cdo.set_editor_property("invulnerability_time", 1.5)
            unreal.BlueprintEditorLibrary.compile_blueprint(char_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(char_bp)
            log("BP_PI_Character configurado con ShotCatalog, MaxLives=3, CurrentLives=3")
        except Exception as e:
            log(f"Error configurando BP_PI_Character CDO: {e}")

print("=== FINALIZADO SETUP PI CORE ===")
