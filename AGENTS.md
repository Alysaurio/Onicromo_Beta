# AGENTS.md — Onicromo_Beta (Unreal Engine 5.7)

Directrices para agentes de desarrollo (OpenCode) sobre este proyecto. El editor
**UnrealEditor** se controla en tiempo real mediante el servidor MCP local
(`opencode.json` → `Tools/unreal-mcp/server.ts`, herramientas `unreal_*`).

---

## 1. Visión general del proyecto

| Campo | Valor |
|---|---|
| Proyecto | `Onicromo_Beta.uproject` |
| Motor | Unreal Engine **5.8.3** (`C:\Program Files\Epic Games\UE_5.8`; la 5.7.4 permanece instalada como referencia) |
| Plantilla base | TopDown (C++) con dos variantes: **TwinStick** y **Strategy** |
| Módulo C++ | `Onicromo_Beta` (Editor target: `Onicromo_BetaEditor`) |
| Mapa por defecto | `/Game/TopDown/Lvl_TopDown` (`Config/DefaultEngine.ini`) |
| GameMode global | `/Game/TopDown/Blueprints/BP_TopDownGameMode` |
| Canales MCP | UDP multicast `239.0.0.1:6766` + TCP callback `127.0.0.1:6776` |

### Estructura de carpetas

```
Onicromo_Beta/
├── Config/                  # Default*.ini (Engine, Game, Input, Editor...)
├── Content/
│   ├── Characters/          # Personajes
│   ├── Collections/         # Colecciones de assets
│   ├── Cursor/              # Cursores
│   ├── LevelPrototyping/    # Geometría de prototipado
│   ├── Materiales/          # Materiales (nomenclatura en español)
│   ├── Modelos3D/           # Mallas 3D
│   ├── Niveles/              # Mapas de juego
│   ├── Pruebas/             # Assets de prueba (sandbox)
│   ├── TopDown/             # Mapa principal Lvl_TopDown + Blueprints del template
│   ├── Variant_TwinStick/   # Assets de la variante TwinStick
│   └── Variant_Strategy/    # Assets de la variante Strategy
├── Source/
│   ├── Onicromo_Beta.Target.cs / Onicromo_BetaEditor.Target.cs
│   └── Onicromo_Beta/
│       ├── Onicromo_Beta.{h,cpp}                 # Módulo principal
│       ├── Onicromo_BetaGameMode / PlayerController / Character
│       ├── Variant_TwinStick/                    # TwinStick* (GameMode, Character, PlayerController)
│       │   ├── AI/          # TwinStickNPC, TwinStickAIController, TwinStickSpawner, StateTree...
│       │   ├── Gameplay/    # TwinStickProjectile, TwinStickPickup, TwinStickAoEAttack
│       │   └── UI/          # TwinStickUI
│       ├── Variant_Strategy/                     # Strategy* (GameMode, Pawn, Unit, PlayerController)
│       │   └── UI/          # StrategyUI, StrategyHUD
│       ├── OniroCromo/Prototipos/                # Proto* (prototipos de colisión del GDD, laboratorio)
│       └── Laboratorio/                           # LabDisparoRaycast (ejercicios 1-2 raycast, Lvl_TopDown)
├── Tools/unreal-mcp/server.ts   # Servidor MCP local (Deno, stdio)
├── opencode.json                # Config de OpenCode (MCP "unreal")
└── AGENTS.md                    # Este archivo
```

**No tocar**: `Saved/`, `Intermediate/`, `DerivedDataCache/`, `Binaries/`, `.vs/`, `state/`.

---

## 2. Convenciones de nomenclatura (Unreal estándar)

### Prefijos de tipo C++ (OBLIGATORIOS, estilo Epic)

| Prefijo | Uso | Ejemplo en el proyecto |
|---|---|---|
| `A` | Clases derivadas de `AActor` (y `APawn`, `AController`) | `TwinStickNPC` → en código: `class ATwinStickNPC : public ACharacter` |
| `U` | `UObject`/`UActorComponent`/`UWidget` | `UTwinStickNPCDestruction` |
| `F` | Structs y tipos plain-C++ | `FTwinStickStateTree...` |
| `E` | Enums (`enum class`) | `ETwinStickFaction` |
| `T` | Templates | `TSubclassOf<...>`, `TArray<...>` |
| `I` | Interfaces | `IInterfazEjemplo` |
| `W` | Widgets Slate | `SMyWidget` |

### Nombres de assets en Content

| Prefijo | Tipo | Ejemplo |
|---|---|---|
| `BP_` | Blueprint de actor/objeto | `BP_TopDownGameMode` |
| `Lvl_` | Mapas | `Lvl_TopDown` |
| `SM_` | Static Mesh | `SM_Roca01` |
| `M_` / `MI_` / `MF_` | Material / Instance / Material Function | `M_Piedra` |
| `T_` / `DT_` | Texture / DataTable | `T_IconoVida` |
| `S_` / `NS_` | Sound / Niagara System | `NS_Explosion` |
| `WBP_` | Widget Blueprint | `WBP_HUDPrincipal` |
| `ST_` | StateTree | `ST_ComportamientoNPC` |
| `FB_` | Font / Feedback? No: **`FB_` no se usa**; para funciones de gameplay usar verbos claros | — |

- Los nombres de variables/funciones de Blueprints siguen **PascalCase**.
- Los labels de actores en el nivel describen rol + índice: `Luz_Sala01`, `Spawnpoint_Oleada3`.
- Nomenclatura en español o inglés **consistente por categoría** (respetar la existente:
  carpetas `Materiales/Modelos3D/Niveles` en español; clases C++ en inglés Epic-style).

---

## 3. Estándares para clases C++

- **Módulo**: `Onicromo_Beta`. Dependencias en `Source/Onicromo_Beta/Onicromo_Beta.Build.cs`:
  `Core, CoreUObject, Engine, InputCore, EnhancedInput, AIModule, NavigationSystem,
  StateTreeModule, GameplayStateTreeModule, Niagara, UMG, Slate`.
  Añadir nuevas dependencias ahí, nunca con includes hardcodeados de otros módulos.
- **Encabezado**: `#pragma once`, copyright Epic, `#include "CoreMinimal.h"` primero,
  includes de UE agrupados (`Engine/...` después de los propios del módulo).
- Toda variable expuesta debe tener `UPROPERTY()`; toda función llamable desde
  BP/Python debe tener `UFUNCTION()`. Usar `BlueprintReadWrite/Callable` con criterio
  (no exponer internals).
- Propiedades con validadores: `ClampMin`, `EditAnywhere`, `Category = "Nombre|Subcat"`.
- **GC**: nunca guardar punteros crudos a `UObject` en structs plain-C++; usar
  `TWeakObjectPtr<>` o `UPROPERTY()` para mantener vivos los objetos.
- **Hilo**: el game thread no debe bloquearse (`Sleep`, bucles largos). Usar
  `FTimerManager`, `AsyncTask` o ticks. Los comandos MCP se ejecutan en el game
  thread: no usar `time.sleep` en Python remoto.
- Sin `GEngine->AddOnScreenDebugMessage` en código de producción; usar el sistema
  de logging con categorías propias: `DEFINE_LOG_CATEGORY_STATIC(LogOnicromo, Log, All)`.
- Los cambios C++ requieren **recompilar** (ver §7). Durante desarrollo con editor
  abierto, Live Coding (`Ctrl+Alt+F11`) para cambios no-PDO; cambios en
  `UCLASS`/`USTRUCT`/`UENUM` o `.uproject`/`Build.cs` → cerrar editor y recompilar.
- **`.uproject` — sección `Modules` obligatoria**: el editor solo carga el DLL del
  módulo C++ en runtime si `Onicromo_Beta.uproject` conserva el bloque
  `Modules` (`Name: Onicromo_Beta, Type: Runtime, LoadingPhase: Default`).
  Si se edita el `.uproject` (añadir plugins, etc.) **preservar ese bloque**; sin él,
  `/Script/Onicromo_Beta.*` no existe en el editor (Python `load_class` → `None`) y
  ningún BP puede heredar de las clases C++ del proyecto aunque el binario esté compilado.

---

## 4. Estándares para Blueprints

1. **Lógica mínima en BP**: la lógica de gameplay núcleo va en C++; BP se usa para
   composición (mallas, materiales, ajuste de parámetros), UI y prototipado.
   Los BP de gameplay deben tener su **clase padre en C++** cuando aporten lógica.
2. **Componentes con nombre descriptivo** en PascalCase: `MallaPrincipal`, `ArrowSpawn`,
   `AreaDano`. Los componentes heredados de BP padre no se renombran.
3. Tras **cualquier** creación/modificación de BP: **compilar y guardar**
   (`unreal_create_blueprint` ya lo hace; con `unreal_exec_python` usar
   `unreal.BlueprintEditorLibrary.compile_blueprint(bp)` +
   `unreal.EditorAssetLibrary.save_asset(...)`).
4. No romper referencias: antes de eliminar/renombrar un asset, verificar referencias
   con `unreal.EditorAssetLibrary.find_asset_data(...)` o listar dependencias
   (`list_dependencies`). **No borrar assets sin confirmación explícita del usuario.**
5. Los BPs de una variante viven en `Content/Variant_<Nombre>/`; los del template en
   `Content/TopDown/`. Respetar esa organización al crear nuevos.
6. Tags de actores: usar `ActorTags` para marcar categorías jugables
   (`enemigo`, `recogible`, `destructible`), se leen desde MCP con `get_actors`.

---

## 5. Manipulación del nivel vía MCP (reglas de oro)

Herramientas disponibles (servidor MCP `unreal`, §8):

| Herramienta | Uso |
|---|---|
| `unreal_status` | Motor, mapa activo, nº de actores, selección, estado PIE |
| `unreal_get_actors` | Outliner del nivel: label, clase, ubicación, rotación |
| `unreal_spawn_actor` | Spawn por clase (Script o BP `_C`) con transform y mesh |
| `unreal_set_transform` | Mover/rotar/escalar actores por label |
| `unreal_add_component` | Añadir componentes (StaticMeshComponent, PointLight...) |
| `unreal_set_property` | `set_editor_property` sobre actores/componentes |
| `unreal_create_blueprint` | Crear BP con parent class + componentes en plantilla (SubobjectDataSubsystem), compilar y guardar |
| `unreal_list_assets` | Listar assets de `/Game` con filtro |
| `unreal_screenshot` | Screenshot del viewport del editor (PNG en `Saved/Screenshots`)`) |
| `unreal_exec_python` | Python arbitrario del editor (herramienta comodín) |

### Reglas de manipulación

1. **Leer antes de modificar**: ante la duda sobre un actor/asset, ejecutar
   `unreal_get_actors` o `unreal_list_assets` antes de decidir.
2. **Unidades**: distancias en **centímetros** (1 m = 100 uu), ángulos en **grados**,
   sistema **Z-up**. Rotación como `[Pitch, Yaw, Roll]`.
3. **Identidad por `label`**: los actores se referencian por su label de Outliner
   (único por nivel). Si un spawn no devuelve el label esperado, verificar con
   `unreal_get_actors` con filtro.
4. **Verificar tras actuar**: después de spawnear o modificar, releer el estado
   (`get_actors`/`set_transform` devuelve el estado resultante; validar el `ok:true`).
5. **Spawning**: siempre indicar `class_path` completo. Clases de motor:
   `/Script/Engine.StaticMeshActor`; Blueprints: `/Game/.../BP_X.BP_X_C`.
6. **Sin borrar ni sobrescribir** actores/assets existentes sin pedir confirmación.
   `unreal_create_blueprint` falla si el asset ya existe (por diseño).
7. **PIE**: si el editor está en Play, los cambios afectan a la sesión de juego
   (se descartan al parar). Verificar `unreal_status.in_pie` antes de editar niveles.
8. **Guardado**: las herramientas guardan assets de Blueprint creados por MCP.
   **Los mapas NO se guardan automáticamente**: pedir confirmación antes de
   `unreal.EditorLevelLibrary.save_current_level()` / `save_all_dirty_levels`.
9. **Game thread**: los comandos MCP corren en el game thread. Nada de `sleep`
   largo en Python remoto; para operaciones largas, trocear en varias llamadas.
10. **Errores**: si el resultado trae `isError` o `success:false`, leer el traceback
    incluido antes de reintentar; no reintentar ciegamente en bucle.

---

## 6. Integración MCP — cómo funciona

- **Archivo de config**: `opencode.json` (raíz) define el MCP local `unreal`:
  `deno run -A Tools/unreal-mcp/server.ts` (Deno 2.9, sin dependencias externas).
- **Capas oficiales de UE 5.8** (ver `GUIA_MAESTRA.md`): plugins
  `ModelContextProtocol` ("Unreal MCP", servidor HTTP en `http://127.0.0.1:8000/mcp`,
  arranque con la consola `ModelContextProtocol.StartServer`), `MCPClientToolset`,
  `EditorToolset` y `Terminal`. Conviven con el MCP local de este proyecto.
- **Transporte**: stdio JSON-RPC (MCP). El servidor habla con el editor mediante el
  protocolo oficial **Python Remote Execution v1** del plugin `PythonScriptPlugin`
  (UDP multicast descubrimiento `239.0.0.1:6766`; canal de comandos TCP `127.0.0.1:6776`
  en dirección editor→servidor). Portado 1:1 de
  `Engine/Plugins/Experimental/PythonScriptPlugin/Content/Python/remote_execution.py`.
- **Plugins habilitados** en `Onicromo_Beta.uproject`: `PythonScriptPlugin`,
  `EditorScriptingUtilities` (más los existentes: StateTree, AIAssistant, etc.).
- **Remote Execution activado** en `Config/DefaultEngine.ini`:
  `[/Script/PythonScriptPlugin.PythonScriptPluginSettings] bRemoteExecution=True`.
- **Variables de entorno** del servidor: `UNREAL_PROJECT_ROOT`, `UNREAL_PROJECT_FILTER`
  (selección del nodo de editor correcto si hay varios abiertos).

### Diagnóstico de fallos MCP

| Síntoma | Causa probable / solución |
|---|---|
| Timeout de descubrimiento | Editor cerrado, plugin deshabilitado o Remote Execution apagado → revisar `.uproject`/`DefaultEngine.ini` y **reiniciar el editor** |
| "puerto en uso" (TCP 6766/6776) | Otro cliente de remote execution conectado; cerrar procesos `python`/`deno` colgados |
| Sin respuesta durante PIE largo | Normal: reintentar cuando el juego esté en pausa |
| Fallos tras renombrar carpetas MCP | El server está en `Tools/unreal-mcp/server.ts`; actualizar la ruta en `opencode.json` |
| Python `load_class('/Script/Onicromo_Beta.*')` → `None` o BP sin clase padre | El módulo C++ del proyecto **no está cargado**: verificar que `Onicromo_Beta.uproject` conserva la sección `Modules` (ver §3) y reiniciar el editor |
| Firewall | Permitir tráfico **local** UDP 239.0.0.1:6766 y TCP loopback |

---

## 7. Compilación y comandos útiles

```bat
:: Compilar editor (desde CMD/PowerShell)
"C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" Onicromo_BetaEditor Win64 Development -Project="A:\Proyectos\Unreal\Onicromo_Beta\Onicromo_Beta.uproject" -WaitMutex

:: Generar proyecto de VS
"C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" -projectfiles -project="A:\Proyectos\Unreal\Onicromo_Beta\Onicromo_Beta.uproject" -game -engine
```

- Compilador: MSVC (VS 2022+), C++20 (UE 5.8).
- Live Coding en editor: `Ctrl+Alt+F11` (solo cambios compatibles en runtime).

---

## 8. Flujo de trabajo recomendado para tareas de juego

1. `unreal_status` → contexto (mapa actores, PIE, selección).
2. Localizar assets/actores (`unreal_list_assets` / `unreal_get_actors`).
3. Aplicar cambios (spawn/transform/property/crear BP o código C++).
4. Verificar resultado (relectura + `unreal_screenshot` si es visual).
5. Compilar BP (`compile_blueprint`) y guardar assets cuando corresponda.
6. Informar al usuario de cambios realizados y de si falta guardar algún mapa.

## 9. Sistema de llaves seguidoras (`BP_FollowKey`)

- `BP_FollowKey` (`Content/Variant_TwinStick/Blueprints/`) es hijo de
  `BP_TwinStickPickup` con **`Follows Player = True`**: al solaparse **no se
  consume**, sino que empieza a retraer la ruta del líder (estilo The Binding of
  Isaac). Varias llaves se encadenan en cola (`ChainSpacing`).
- **El líder puede ser cualquier pawn controlado por el jugador** (ver
  `ATwinStickPickup::NotifyActorBeginOverlap`): se busca un
  `UTrailHistoryComponent` en el pawn y, si no existe, **se crea en runtime**
  (`TrailRuntime`). Por eso funciona igual en `LVL_TwinStick`
  (`BP_TwinStickCharacter`) que en niveles con `BP_TopDownGameMode`/otros.
- `BP_TopDownCharacter` lleva además el componente **`TrailHistory`** en su
  plantilla (añadido vía MCP), para que el historial exista desde el spawn.
  Los pawn sin componente heredan el fallback runtime (el historial empieza
  al recoger la llave).
- Las pickups **normales** (`Follows Player = False`) siguen comportándose como
  en la plantilla: solo las consume `ATwinStickCharacter`.
- Los NPCs/IA ignoran las llaves follow (`IsPlayerControlled()`).
- Añadir un personaje jugable nuevo no requiere cambios: basta con ser poseído
  por un PlayerController.

## 10. Prototipos de colisión OniroCromo (laboratorio Colisiones 2)

En `Source/Onicromo_Beta/OniroCromo/Prototipos/` viven las clases C++ del
punto 6 de la práctica de colisiones (3 prototipos referidos al GDD). Están
colocados en `Content/Niveles/Tutorial` (losa "Cube", cara superior `z=-40`,
alrededor del PlayerStart), etiquetados:

| Prototipo | Clases | Colisión | Comportamiento |
|---|---|---|---|
| Placa → Puerta | `AProtoBoton` + `AProtoPuerta` | **Overlap** | Pisar la placa (jugador o bloque con tag `Bloque`) abre la puerta; al liberarse se cierra |
| Fragmento en mano | `AProtoFragmento` | **Overlap + Attach** | Al tocarlo se pega al jugador (no se consume); tecla **E** lo suelta |
| Bloque empujable | `AProtoBloque` | **Block + Hit** | Chocar contra él lo desliza (150 cm/empuje, cadencia 0.4 s) |

- Colores leyenda del GDD en `Content/Materiales/`: `M_ProtoBoton` (rojo),
  `M_ProtoFragmento` (amarillo), `M_ProtoBloque` (verde). La puerta queda gris.
- Feedback con `ProtoPrint()` de `ProtoUtils.h` (log `LogOniroProto` + mensaje
  en pantalla, equivalente al nodo Print del laboratorio).
- Enlace botón→puerta: propiedad `Puerta` (`EditAnywhere`) de `AProtoBoton`;
  los actores del nivel son instancias de las clases nativas (sin BP hijo).
  **Si se coloca una instancia nueva de `ProtoBoton` desde el editor, hay que
  asignarle `Puerta` a mano en los Detalles** (si queda NULL el botón imprime
  pero no mueve la puerta — incidente 2026-10-20). Las instancias nuevas
  tampoco heredan los materiales de leyenda: reasignarlos.

## 11. Ejercicios de raycast (laboratorio Colisiones, `Lvl_TopDown`)

`Source/Onicromo_Beta/Laboratorio/LabDisparoRaycast.{h,cpp}` — clase
`ALabDisparoRaycast` para los ejercicios 1 y 2 de la práctica de colisiones:

1. **Disparo de rayo**: `LineTraceSingleByChannel` (canal Visibility) desde el
   muzzle hacia el cursor del jugador; rayo visible con `DrawDebugLine` (rojo,
   0.5 s) e impacto impreso en pantalla/log (`ProtoPrint`: objeto + distancia).
2. **Fuerza de empuje**: con `FuerzaEmpuje > 0`, `AddImpulseAtLocation` en el
   punto de impacto — **solo** si el componente `IsSimulatingPhysics()` o el
   actor tiene el tag **`Empujable`** (el suelo nunca se mueve).

Instancias en `Content/TopDown/Lvl_TopDown` — **estación de tiro propia** en
zona libre al norte (`0, 1300`), creada para no tocar el resto del lab:

- `Lab_PlataformaRaycast` — losa 1400×600, cara superior `z=+25`
- `Lab_Raycast01` — ejercicio 1 (`FuerzaEmpuje = 0`)
- `Lab_RaycastEmpuje02` — ejercicio 2 (`FuerzaEmpuje = 400`)
- `Lab_Objeto01/02` — dianas del ej. 1: reciben el impacto, **no se mueven**
- `Lab_Objeto03/04/05` — dianas del ej. 2: física (`set_simulate_physics`) +
  tag `Empujable`: **vuelan** al impactar

Disparo: **clic izquierdo** + **automático** cada 2 s (toggle `bDisparoAutomatico`
en Detalles). Los rayos/prints solo existen en PIE. **Verificado en PIE
2026-10-20**: ambos armamentos disparan cada 2 s, imprimen impacto + distancia
y la restricción de empuje rechaza correctamente los objetos no empujables.

**Notas Python/MCP aprendidas aquí:**

- `UPROPERTY` bool con prefijo `b`: usar el **nombre crudo de C++**
  (`set_editor_property("bDisparoAutomatico", True)`); `b_disparo_automatico`
  **no** existe (en cambio los normales sí son snake_case: `fuerza_empuje`).
- Física de componente: `comp.set_simulate_physics(True)` y verificar con
  `comp.get_editor_property("body_instance").get_editor_property("bSimulatePhysics")`
  — ni `simulate_physics` ni `bSimulatePhysics` existen directamente sobre el
  componente (`static_mesh` en `UStaticMeshComponent` sí, vía
  `get_editor_property`, no `get_static_mesh()`).
- PIE desde MCP: `unreal.EditorLevelLibrary.editor_play_simulate()` /
  `editor_end_play()` (deprecated pero operativos); `get_pie_worlds()` exige el
  argumento `include_dedicated_server`.

*Última actualización: 2026-10-20. Generado para OpenCode + UnrealEngine 5.8 MCP.*
