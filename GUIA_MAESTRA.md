# GUIA MAESTRA MCP — Onicromo_Beta (Unreal Engine 5.8.3)

> **Documento de contexto obligatorio.** Toda instancia de OpenCode (o cualquier IA)
> que trabaje en este proyecto debe leer este archivo al iniciar, junto con
> `AGENTS.md` (nomenclatura y convenciones). Este documento define **qué puedes hacer,
> cómo y bajo qué reglas** dentro del motor. Habla en serio: tienes acceso directo al
> editor, a los assets y a la compilación. Úsalo con precisión, no con improvisación.

---

## 0. Cómo usar este documento

1. `AGENTS.md` manda en **nomenclatura, organización y convenciones**. Este documento
   manda en **capacidades de automatización y flujos de trabajo con el motor**.
2. **Regla transversal de honestidad técnica**: solo afirma capacidades verificadas.
   Si una herramienta no aparece en tu catálogo de tools MCP o no responde, **dilo
   explícitamente** en lugar de simular que existe. Verifica antes de actuar y
   verifica después de actuar.
3. Tienes **dos canales de automatización** hacia el editor (ver §5):
   - **Canal A — MCP nativo de UE 5.8** (`ModelContextProtocol` / "Unreal MCP"): servidor
     HTTP del propio editor, expone los "Toolsets" instalados como tools MCP.
   - **Canal B — MCP local del proyecto** (`opencode.json` → servidor `unreal`
     en `Tools/unreal-mcp/server.ts`): 10 tools `unreal_*` + Python de editor,
     sobre Python Remote Execution. Es el canal **probado en producción** de este proyecto.
4. Si el editor no está abierto, **los canales A y B no funcionan**. Puedes trabajar en
   C++/config sin editor; para todo lo demás, pide al usuario que abra el editor o
   ábrelo tú (ver §5.5) y espera a que esté listo.

---

## 1. Descripción del Proyecto (Onicromo_Beta)

| Campo | Valor (verificado en disco) |
|---|---|
| Proyecto | `A:\Proyectos\Unreal\Onicromo_Beta\Onicromo_Beta.uproject` |
| Motor | **Unreal Engine 5.8.3** (`C:\Program Files\Epic Games\UE_5.8`, promoted build) |
| Motor alternativo | UE 5.7.4 también instalado (proyecto migrado recientemente; no usar salvo petición explícita) |
| Módulo C++ | `Onicromo_Beta` (Runtime, LoadingPhase Default) — **la sección `Modules` del `.uproject` es obligatoria**; sin ella no cargan las clases C++ en editor |
| Targets | `Onicromo_Beta.Target.cs` / `Onicromo_BetaEditor.Target.cs` con `DefaultBuildSettings = BuildSettingsVersion.V7` |
| Mapa por defecto | `/Game/TopDown/Lvl_TopDown` (`Config/DefaultEngine.ini`) |
| GameMode global | `/Game/TopDown/Blueprints/BP_TopDownGameMode` (pawn: `BP_TopDownCharacter`, con componente `TrailHistory`) |
| Variantes de plantilla | **TopDown** (base), **TwinStick** (`Content/Variant_TwinStick/`, `LVL_TwinStick`), **Strategy** (`Content/Variant_Strategy/`) |
| Plugins MCP habilitados | `ModelContextProtocol`, `MCPClientToolset`, `EditorToolset`, `Terminal` (+ `PythonScriptPlugin`, `EditorScriptingUtilities`, `AIAssistant`, StateTree, etc.) |
| Remote Execution | `bRemoteExecution=True` en `Config/DefaultEngine.ini` (necesario para el Canal B) |

**[ENTRE CORCHETES — completa aquí]:** _Describe en 3-6 líneas de qué trata el juego o
simulador: género, bucle principal, personaje(s), objetivos del jugador, estado actual
de desarrollo y Qué se espera de la IA a medio plazo._

**Contexto de gameplay ya implementado** (detalle en `AGENTS.md` §9):
- Sistema de llaves seguidoras estilo *The Binding of Isaac*: `BP_FollowKey` (hijo de
  `BP_TwinStickPickup`, `Follows Player=True`). Funciona con **cualquier pawn controlado
  por el jugador**: el pickup busca un `UTrailHistoryComponent` y, si no existe, lo crea
  en runtime. Las pickups normales solo las consume `ATwinStickCharacter`.

---

## 2. Capacidades con Blueprints (EditorToolset + Unreal MCP)

### 2.1 Arquitectura de tools (qué es cada cosa)

UE 5.8 introduce un marco de "Toolsets" para IA sobre el plugin `ToolsetRegistry`:

- **`ToolsetRegistry`**: registro central de capacidades. Cada plugin de toolsets
  publica operaciones atómicas tipadas ("tools" con esquema JSON). Es el bus al que
  se conectan tanto el asistente del editor como el servidor MCP.
- **`EditorToolset`** ("Editor Tool Set", `Engine/Plugins/Experimental/Toolsets/EditorToolset`):
  toolsets del dominio editor: **EditorAppToolset** (leer/escribir **CVars** con su
  `help`, resolver rutas de objetos, interacciones con `LevelEditor` y actores),
  **LogsToolset** (leer el **Output Log en vivo** — tu principal fuente de diagnóstico),
  **BitmapAnnotation** (anotar imágenes capturadas para devolver contexto visual).
- **`ModelContextProtocol`** ("Unreal MCP", `Engine/Plugins/Experimental/ModelContextProtocol`):
  implementación oficial del **servidor MCP de Epic**. Adapta el ToolsetRegistry a un
  servidor **HTTP (Streamable HTTP + SSE)** en `http://127.0.0.1:8000/mcp` por defecto,
  con sesiones, validación de `Origin` (solo local) y refresco dinámico de tools.
- **`MCPClientToolset`**: dirección inversa — permite que el editor actúe como
  **cliente MCP** hacia servidores locales/privados (para el asistente EDA y los
  consumidores del registro).
- **`Terminal`**: emulador de terminal **Slate nativo** integrado en el editor
  (pestaña *Terminal*): shells del sistema sin salir del editor.

### 2.2 Qué gana tu flujo de trabajo de Blueprints

1. **Lectura de estructura** — puedes inspeccionar un BP sin abrir el editor de BP a mano:
   - Canal probado (B, Python): clase nativa (`load_class`), **CDO** y sus propiedades,
     cadena de herencia por propiedades heredadas, componentes del template vía
     `SubobjectDataSubsystem.k2_gather_subobject_data_for_blueprint` + `export_text()`.
   - Canal nativo (A): tools expuestas por `EditorToolset` (verificables con `tools/list`).
2. **Creación y edición** — dos caminos, en orden de fiabilidad:
   - **Composición de BP** (componentes, propiedades por defecto, herencia): vía
     `SubobjectDataSubsystem` (`add_new_subobject`), `BlueprintEditorLibrary`
     (`compile_blueprint`, `add_member_variable`/`remove_member_variable`) y
     `EditorAssetLibrary.save_asset`. **Patrón ya probado** en este proyecto:
     crear BP hijo, añadir componente a un BP existente, compilar, guardar y verificar
     con instancia temporal.
   - **Tools MCP nativas (Canal A)**: úsalas cuando aparezcan en tu catálogo; si
     incluyen manipulación de grafos K2 (nodos/pins), verifica con una BP de prueba
     antes de aplicar a assets del usuario. **El grafo K2 por scripting es
     experimental: confirma disponibilidad, no lo des por hecho.**
   - **Lógica de gameplay**: va en **C++** (§4), no en grafos BP (convención del proyecto).
3. **Auditoría de BPs** — flujo obligatorio antes de modificar un BP ajeno:
   `load_asset` → `generated_class()` → `get_default_object` → leer props clave
   (`parent_class` puede no estar expuesto; usa props heredadas o el CDO) →
   comprobar referencias (`EditorAssetLibrary.list_dependencies`) → modificar →
   **compilar + guardar** → verificar (relectura + instancia temporal si aplica).
4. **Reglas duras**:
   - Tras **cualquier** creación o modificación de BP: `compile_blueprint` + `save_asset`.
     Un BP sin compilar guardado es un fallo.
   - **Nunca** borres ni sobrescribas assets existentes sin confirmación explícita del usuario.
   - No renombres carpetas/activos referenciados sin verificar dependencias antes.
   - Distingue siempre en tu informe lo **hecho y verificado** de lo **propuesto**.

---

## 3. Modificación de Escenarios (Level Editing)

### 3.1 Tools del Canal B (`opencode.json` → servidor `unreal`) — probadas

| Tool | Uso |
|---|---|
| `unreal_status` | Motor, mapa activo, nº de actores, selección, estado PIE |
| `unreal_get_actors` | Outliner del nivel: label, clase, ubicación, rotación |
| `unreal_spawn_actor` | Spawn por clase (Script o BP `_C`) con transform y mesh |
| `unreal_set_transform` | Mover/rotar/escalar actores por label |
| `unreal_add_component` | Añadir componentes a actores |
| `unreal_set_property` | `set_editor_property` sobre actores/componentes |
| `unreal_create_blueprint` | Crear BP con parent class + componentes de template, compilar y guardar |
| `unreal_list_assets` | Listar assets de `/Game` con filtro |
| `unreal_screenshot` | Screenshot del viewport (PNG en `Saved/Screenshots`) |
| `unreal_exec_python` | Python arbitrario del editor (comodín: inspección profunda, SubobjectData, CVars…) |

### 3.2 Reglas de edición de mundo

1. **Leer antes de modificar**: `unreal_get_actors` / `unreal_list_assets` primero.
2. **Unidades**: centímetros (1 m = 100 uu), grados, **Z-up**; rotación `[Pitch, Yaw, Roll]`.
3. **Identidad por `label`** de Outliner (único por nivel). Tras spawnear, relee el
   estado para confirmar el label real asignado.
4. **No borrar actores** ni sobrescribir transformaciones de assets del usuario sin
   confirmación. Si debes crear actores temporales de prueba (p. ej. para verificar un
   componente), **destrúyelos al terminar** y deja el nivel limpio.
5. **Guardado de mapas**: las tools de MCP **no guardan mapas automáticamente**.
   Los `.umap` solo se guardan tras confirmación explícita del usuario
   (`save_current_level` / `save_all_dirty_levels`).
6. **PIE**: consulta `unreal_status.in_pie` antes de editar; en PIE los cambios viven
   en la sesión de juego y se descartan al parar.
7. **Verificación final**: relectura de actores afectados + `unreal_screenshot` si el
   cambio es visual. Informa de qué quedó modificado y de si falta guardar algún mapa.

---

## 4. Desarrollo y Modificación en C++

### 4.1 Flujo obligatorio

1. **Edita** los `.h`/`.cpp` con las herramientas de edición de archivos (respeta el
   estilo e incluye del archivo; `#pragma once`, `CoreMinimal.h`, prefijos `A/U/F/E`).
2. **Clasifica el cambio**:
   - Cuerpos de funciones, lógica interna, includes en `.cpp` → compilación normal.
   - Cualquier cambio en `UCLASS`/`USTRUCT`/`UENUM`, `UPROPERTY`/`UFUNCTION`, añadir
     archivos `.cpp` nuevos, tocar `.uproject` o `Build.cs` → **cierra el editor antes
     de compilar** (Live Coding no es fiable en estos casos).
3. **Compila con la Terminal** (§5.4) usando la ruta del motor activo:

```bat
"C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat" Onicromo_BetaEditor Win64 Development -Project="A:\Proyectos\Unreal\Onicromo_Beta\Onicromo_Beta.uproject" -WaitMutex
```

4. **Revisa la salida**: `Result: Succeeded` y cero `error C`/`fatal error`. Un warning
   nuevo también se informa.
5. **Relanza el editor** y **verifica en vivo**: `unreal_exec_python` →
   `unreal.load_class(None, '/Script/Onicromo_Beta.TuClase')` debe devolver la clase;
   para clases BP hijas, comprueba el CDO. Solo entonces da el trabajo por terminado.

### 4.2 Reglas duras de C++

- La sección `Modules` del `.uproject` es **intocable**: sin ella el DLL no carga y
  `/Script/Onicromo_Beta.*` no existe en editor.
- Los Targets usan `BuildSettingsVersion.V7` (migración a 5.8 completada en ese aspecto).
  Si el editor de 5.8 sugiere actualizar `IncludeOrderVersion` a `Unreal5_8`, **pregunta
  al usuario** antes de cambiarlo.
- El game thread no debe bloquearse (nada de `sleep` largo en Python remoto).
- Toda propiedad expuesta lleva `UPROPERTY()`, toda función llamada desde BP/Python
  lleva `UFUNCTION()`. Sin `AddOnScreenDebugMessage` en producción; usa categorías de
  log propias (`DEFINE_LOG_CATEGORY_STATIC(LogOnicromo, ...)`).
- Vive en `Source/Onicromo_Beta/`: `Variant_TwinStick/` (Gameplay, AI, UI),
  `Variant_Strategy/`, y las clases raíz del template (`Onicromo_BetaCharacter`, GameMode…).

---

## 5. Comandos y Otras Capacidades

### 5.1 Servidor MCP nativo de UE 5.8 (Canal A — "Unreal MCP")

- **Endpoint por defecto**: `http://127.0.0.1:8000/mcp` (Streamable HTTP + SSE;
  puerto por defecto `8000`, ruta `/mcp`).
- **NO auto-arranca** (`bAutoStartServer=false`). Arráncalo con la consola del editor
  o de un proceso de juego:

```text
ModelContextProtocol.StartServer            ; puerto por defecto (8000)
ModelContextProtocol.StartServer 9000       ; puerto personalizado
ModelContextProtocol.RefreshTools           ; reconstruye la lista de tools tras cambios
ModelContextProtocol.StopServer             ; detiene el servidor
```

- **Conexión desde OpenCode**: añadir en `opencode.json` un servidor remoto apuntando
  al endpoint (por ejemplo `"type": "remote", "url": "http://127.0.0.1:8000/mcp"`).
  Tras conectar, ejecuta `tools/list` y **toma nota de las tools reales**: el catálogo
  depende de los toolsets habilitados (`EditorToolset` y los que actives en `.uproject`).
- **Convivencia**: el servidor nativo (puerto 8000) no entra en conflicto con el Canal B
  (UDP 239.0.0.1:6766 + TCP 127.0.0.1:6776 de Python Remote Execution).

### 5.2 MCP Client Toolset y Terminal

- `MCPClientToolset` permite que **el editor** se conecte como cliente a otros servidores
  MCP locales/privados (uso principal: el asistente EDA del editor). Útil si en el
  futuro quieres exponer servicios externos al propio editor.
- `Terminal` añade una **pestaña Terminal** nativa (Slate) al editor: shells del sistema
  dentro del editor. Para tus automatizaciones sigue siendo preferible la Terminal del
  entorno (shell dedicada), pero si el usuario trabaja solo en el editor, esta existe.

### 5.3 Comandos de consola y CVars

- Puedes ejecutar cualquier consola de motor/ juego vía Python (Canal B):
  `unreal.SystemLibrary.execute_console_command(mundo, "comando")`.
- El EditorToolset permite **leer y escribir CVars** con su descripción (`help`) —
  ideal para forzar estados de debug (`r.`/`t.`/`ke.`...) sin recompilar.
- Para diagnóstico: Output Log del editor, `LogsToolset` (Canal A, si está expuesto) y
  los logs en `Saved/Logs/`.

### 5.4 Terminal del entorno (para C++ y automatización del sistema)

- La shell del entorno (PowerShell) es tu herramienta para: `Build.bat` (§4),
  generar proyectos de VS (`-projectfiles`), inspeccionar archivos binarios
  (`.uasset`/`.umap` con `Select-String` sobre bytes ASCII para hallar referencias),
  gestionar procesos del editor y leer logs.

### 5.5 Abrir y preparar el editor (checklist de sesión)

1. Lanza el editor con **UE 5.8**:
   `"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe" "A:\Proyectos\Unreal\Onicromo_Beta\Onicromo_Beta.uproject"`
2. Espera a que la ventana tenga el título `Onicromo_Beta - Unreal Editor` (hasta ~4 min).
3. Comprueba el canal B: `unreal_status` debe devolver `engine_version` **5.8.x**.
4. Si vas a usar el Canal A: `ModelContextProtocol.StartServer` + `tools/list`.
5. Relee `unreal_status` (mapa activo, PIE) antes de tocar el nivel.

### 5.6 Otras capacidades verificadas

- **Inspección forense de assets**: búsqueda de strings ASCII en `.uasset`/`.umap`
  (referencias de herencia, GameMode serializado, etc.) cuando el API de Python no
  expone un dato.
- **Screenshots del viewport** para verificación visual remota.
- **Gestión de procesos**: abrir/cerrar el editor, compilaciones en background,
  comprobación de bloqueos de DLL antes de compilar.
- **Creación de assets por script**: BPs (con componentes de template), materiales
  simples, niveles por script; siempre con compilar+guardar y verificación posterior.

---

*Última actualización: 2026-10-18 — migración a UE 5.8.3; plugins MCP oficiales de Epic
habilitados; Canal B (MCP local por Remote Execution) validado en 5.7.4 y pendiente de
revalidación en 5.8.3 en la primera sesión con el editor abierto.*
