import unreal

mel = unreal.MaterialEditingLibrary

mat_definitions = [
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Wall",
        "color": unreal.LinearColor(0.35, 0.35, 0.38, 1.0),
        "emissive": None
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Floor",
        "color": unreal.LinearColor(0.12, 0.12, 0.14, 1.0),
        "emissive": None
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Door",
        "color": unreal.LinearColor(0.75, 0.45, 0.1, 1.0),
        "emissive": unreal.LinearColor(0.3, 0.15, 0.02, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Key",
        "color": unreal.LinearColor(1.0, 0.85, 0.1, 1.0),
        "emissive": unreal.LinearColor(0.8, 0.65, 0.1, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Teleport",
        "color": unreal.LinearColor(0.1, 0.7, 1.0, 1.0),
        "emissive": unreal.LinearColor(0.5, 1.5, 2.0, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Enemy",
        "color": unreal.LinearColor(0.9, 0.15, 0.15, 1.0),
        "emissive": unreal.LinearColor(0.1, 0.0, 0.0, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Boss",
        "color": unreal.LinearColor(0.8, 0.05, 0.75, 1.0),
        "emissive": unreal.LinearColor(0.4, 0.0, 0.4, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Projectile",
        "color": unreal.LinearColor(1.0, 0.9, 0.2, 1.0),
        "emissive": unreal.LinearColor(1.5, 1.3, 0.3, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_Player",
        "color": unreal.LinearColor(0.1, 0.55, 0.95, 1.0),
        "emissive": None
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_DamageVignette",
        "color": unreal.LinearColor(0.5, 0.0, 0.0, 1.0),
        "emissive": unreal.LinearColor(0.3, 0.0, 0.0, 1.0)
    },
    {
        "path": "/Game/ProyectoIntegrador/Materials/M_PI_LowLifeTint",
        "color": unreal.LinearColor(0.7, 0.05, 0.05, 1.0),
        "emissive": unreal.LinearColor(0.2, 0.01, 0.01, 1.0)
    },
]

for item in mat_definitions:
    mat = unreal.load_asset(item["path"])
    if not mat:
        print(f"No se encontro material {item['path']}")
        continue

    mel.delete_all_material_expressions(mat)

    # Base Color
    expr_color = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -300, 0)
    expr_color.set_editor_property("constant", item["color"])
    mel.connect_material_property(expr_color, "", unreal.MaterialProperty.MP_BASE_COLOR)

    # Emissive si corresponde
    if item["emissive"]:
        expr_emiss = mel.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -300, 150)
        expr_emiss.set_editor_property("constant", item["emissive"])
        mel.connect_material_property(expr_emiss, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

    mel.recompile_material(mat)
    unreal.EditorAssetLibrary.save_loaded_asset(mat)
    print(f"Material {mat.get_name()} configurado y guardado.")

print("=== TODOS LOS MATERIALES CONFIGURADOS EXITOSAMENTE ===")
