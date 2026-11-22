import unreal

def log(msg):
    print(f"[configure_cdos] {msg}")

catalog_asset = unreal.load_asset("/Game/ProyectoIntegrador/Data/DA_PI_ShotCatalog")
char_bp_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Character.BP_PI_Character_C")
pc_bp_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_PlayerController.BP_PI_PlayerController_C")
hud_widget_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_HUD.WBP_PI_HUD_C")
shot_sel_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_ShotSelection.WBP_PI_ShotSelection_C")
game_over_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_GameOver.WBP_PI_GameOver_C")
credits_class = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_Credits.WBP_PI_Credits_C")

# Configurar BP_PI_GameMode
gm_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode")
gm_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode.BP_PI_GameMode_C")
if gm_bp and gm_cls:
    gm_cdo = unreal.get_default_object(gm_cls)
    if gm_cdo:
        try:
            if char_bp_class:
                gm_cdo.set_editor_property("default_pawn_class", char_bp_class)
            if pc_bp_class:
                gm_cdo.set_editor_property("player_controller_class", pc_bp_class)
            if catalog_asset:
                gm_cdo.set_editor_property("shot_catalog", catalog_asset)
            if shot_sel_class:
                gm_cdo.set_editor_property("shot_selection_widget_class", shot_sel_class)
            if game_over_class:
                gm_cdo.set_editor_property("game_over_widget_class", game_over_class)
            if credits_class:
                gm_cdo.set_editor_property("credits_widget_class", credits_class)

            # Configurar los 4 niveles
            lvl_configs = []
            maps = [
                ("PI_Lvl01_Tutorial", 1, 1),
                ("PI_Lvl02_TwoRooms", 2, 3),
                ("PI_Lvl03_ThreeRooms", 3, 3),
                ("PI_Lvl04_BossAndEnding", 1, 1),
            ]
            for map_name, num_rooms, waves_per_room in maps:
                cfg = unreal.PILevelConfig()
                cfg.set_editor_property("level_name", unreal.Name(f"/Game/ProyectoIntegrador/Maps/{map_name}"))
                cfg.set_editor_property("num_rooms", num_rooms)
                cfg.set_editor_property("waves_per_room", waves_per_room)
                lvl_configs.append(cfg)

            gm_cdo.set_editor_property("level_configs", lvl_configs)
            unreal.BlueprintEditorLibrary.compile_blueprint(gm_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(gm_bp)
            log("BP_PI_GameMode configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_GameMode: {e}")

# Configurar BP_PI_Character
char_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Character")
char_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Character.BP_PI_Character_C")
if char_bp and char_cls:
    char_cdo = unreal.get_default_object(char_cls)
    if char_cdo:
        try:
            if catalog_asset:
                char_cdo.set_editor_property("shot_catalog", catalog_asset)
            char_cdo.set_editor_property("max_lives", 3)
            char_cdo.set_editor_property("current_lives", 3)
            char_cdo.set_editor_property("invulnerability_time", 1.5)
            unreal.BlueprintEditorLibrary.compile_blueprint(char_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(char_bp)
            log("BP_PI_Character configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_Character: {e}")

# Configurar BP_PI_Projectile
proj_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Projectile")
proj_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Projectile.BP_PI_Projectile_C")
if proj_bp and proj_cls:
    proj_cdo = unreal.get_default_object(proj_cls)
    if proj_cdo:
        try:
            proj_cdo.set_editor_property("damage", 1.0)
            proj_cdo.set_editor_property("projectile_speed", 1400.0)
            proj_cdo.set_editor_property("life_time", 5.0)
            unreal.BlueprintEditorLibrary.compile_blueprint(proj_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(proj_bp)
            log("BP_PI_Projectile configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_Projectile: {e}")

# Configurar BP_PI_Enemy
enemy_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Enemy")
enemy_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Enemy.BP_PI_Enemy_C")
if enemy_bp and enemy_cls:
    enemy_cdo = unreal.get_default_object(enemy_cls)
    if enemy_cdo:
        try:
            enemy_cdo.set_editor_property("chase_speed", 400.0)
            enemy_cdo.set_editor_property("contact_damage", 1.0)
            enemy_cdo.set_editor_property("contact_damage_cooldown", 1.0)
            enemy_cdo.set_editor_property("max_health", 3.0)
            unreal.BlueprintEditorLibrary.compile_blueprint(enemy_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(enemy_bp)
            log("BP_PI_Enemy configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_Enemy: {e}")

# Configurar BP_PI_Key
key_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Key")
key_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Key.BP_PI_Key_C")
if key_bp and key_cls:
    key_cdo = unreal.get_default_object(key_cls)
    if key_cdo:
        try:
            key_cdo.set_editor_property("b_follows_player", True)
            key_cdo.set_editor_property("follow_distance", 100.0)
            key_cdo.set_editor_property("chain_spacing", 90.0)
            key_cdo.set_editor_property("follow_interp_speed", 8.0)
            unreal.BlueprintEditorLibrary.compile_blueprint(key_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(key_bp)
            log("BP_PI_Key configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_Key: {e}")

# Configurar BP_PI_WaveSpawner
spawner_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_WaveSpawner")
spawner_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_WaveSpawner.BP_PI_WaveSpawner_C")
if spawner_bp and spawner_cls:
    spawner_cdo = unreal.get_default_object(spawner_cls)
    if spawner_cdo:
        try:
            if enemy_cls:
                spawner_cdo.set_editor_property("enemy_class", enemy_cls)
            if key_cls:
                spawner_cdo.set_editor_property("key_class", key_cls)
            spawner_cdo.set_editor_property("total_waves", 3)
            spawner_cdo.set_editor_property("enemies_per_wave", 4)
            spawner_cdo.set_editor_property("wave_delay", 3.0)
            unreal.BlueprintEditorLibrary.compile_blueprint(spawner_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(spawner_bp)
            log("BP_PI_WaveSpawner configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_WaveSpawner: {e}")

# Configurar BP_PI_Door
door_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Door")
door_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Door.BP_PI_Door_C")
if door_bp and door_cls:
    door_cdo = unreal.get_default_object(door_cls)
    if door_cdo:
        try:
            door_cdo.set_editor_property("open_speed", 400.0)
            door_cdo.set_editor_property("open_distance", 300.0)
            door_cdo.set_editor_property("activation_distance", 200.0)
            unreal.BlueprintEditorLibrary.compile_blueprint(door_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(door_bp)
            log("BP_PI_Door configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_Door: {e}")

# Configurar BP_PI_Teleport
tp_bp = unreal.load_asset("/Game/ProyectoIntegrador/Blueprints/BP_PI_Teleport")
tp_cls = unreal.load_class(None, "/Game/ProyectoIntegrador/Blueprints/BP_PI_Teleport.BP_PI_Teleport_C")
if tp_bp and tp_cls:
    tp_cdo = unreal.get_default_object(tp_cls)
    if tp_cdo:
        try:
            tp_cdo.set_editor_property("fade_duration", 1.0)
            tp_cdo.set_editor_property("post_fade_delay", 0.5)
            unreal.BlueprintEditorLibrary.compile_blueprint(tp_bp)
            unreal.EditorAssetLibrary.save_loaded_asset(tp_bp)
            log("BP_PI_Teleport configurado con éxito.")
        except Exception as e:
            log(f"Error configurando BP_PI_Teleport: {e}")

print("=== CONFIGURACIÓN DE CDOs COMPLETADA ===")
