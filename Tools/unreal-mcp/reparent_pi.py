import unreal

bp_reparent_map = {
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Character": "/Script/Onicromo_Beta.PI_Character",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_GameMode": "/Script/Onicromo_Beta.PI_GameMode",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_PlayerController": "/Script/Onicromo_Beta.PI_PlayerController",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Enemy": "/Script/Onicromo_Beta.PI_Enemy",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Projectile": "/Script/Onicromo_Beta.PI_Projectile",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Key": "/Script/Onicromo_Beta.PI_Key",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Door": "/Script/Onicromo_Beta.PI_Door",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_Teleport": "/Script/Onicromo_Beta.PI_Teleport",
    "/Game/ProyectoIntegrador/Blueprints/BP_PI_WaveSpawner": "/Script/Onicromo_Beta.PI_WaveSpawner",
    "/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_HUD": "/Script/Onicromo_Beta.PI_HUD",
}

print("=== VERIFICANDO ESTADO ACTUAL ===")
for bp_path, new_parent_path in bp_reparent_map.items():
    bp = unreal.load_asset(bp_path)
    if not bp:
        print(f"ERROR: No se pudo cargar {bp_path}")
        continue
    current_parent = unreal.BlueprintEditorLibrary.get_blueprint_parent_class(bp)
    print(f"{bp.get_name()}: actual padre = {current_parent.get_name() if current_parent else 'None'}")
