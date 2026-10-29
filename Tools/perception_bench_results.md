# Telemetría del banco de percepción — `BP_NPCTPCH` / `PawnSensing`

Medición automatizada de `UPawnSensingComponent` sobre `NPC_Patrulla01` en
`Lvl_TopDown`. Todas las cifras provienen del banco `Tools/perception_bench.py`
(ejecutado en PIE desde MCP), no de observación manual.

## 1. Método y control de calidad de la medida

| Aspecto | Decisión |
|---|---|
| Reloj | `GameplayStatics.get_time_seconds()` muestreado por `register_slate_post_tick_callback` (sin `sleep`, el game thread sigue vivo) |
| Ritmo del mundo | **112 Hz (dt ≈ 8.9 ms)** → resolución de medida ≈ 1 frame |
| Aislamiento | NPC y jugador con `CharacterMovement` tick-desactivado y `gravity_scale = 0`; lógica del Behavior Tree detenida |
| Reset por trial | jugador aparcado a 20 000 cm, `ISeeEnemy`/`SeeEnemy`/3 claves del Blackboard a cero, espera = retardo medido de `ResetEnemy` + 0.6 s |
| Fase del temporizador | jitter aleatorio de 0…`SensingInterval` en la espera de reset (sin él la fase queda clavada y la latencia se sesga) |
| Oclusión | validada con **`AIController::LineOfSightTo`** (la misma función que usa `PawnSensingComponent`), no con trazas propias |

> ⚠️ **Requisito de precisión:** si el editor no tiene el foco de Windows,
> `UEditorEngine::GetMaxTickRate()` devuelve `3.0f` y el mundo avanza en cuantos de
> 333.3 ms. Todas las medidas salen entonces múltiplos de 333.3/666.7 ms (falso).
> `bench_fps_report()` lo detecta; `Tools/keep_editor_focus.ps1` lo evita.

## 2. `PeripheralVisionAngle` — es un SEMIángulo

`CouldSeePawn()` compara `dot(dir_al_jugador, facing) >= cos(PeripheralVisionAngle)`.
Por tanto `90` **no** es un cono de 90°: es un cono de **180°** (±90°).

Barrido con el NPC fijo en `(0,0,1000)`, yaw 0 (+X), jugador a 800 cm, radio 2000,
`SensingInterval` 0.5 (3 s de ventana por trial):

| semiángulo | FOV total | 0° | 45° | 90° | 120° | 135° | 150° | 170° | 180° | cono ciego trasero |
|---:|---:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---:|
| **90**  | 180° | SI | SI | SI | -- | -- | -- | -- | -- | 180° |
| **120** | 240° | SI | SI | SI | SI | -- | -- | -- | -- | 120° |
| **140** | 280° | SI | SI | SI | SI | SI | -- | -- | -- | 80° |
| **160** | 320° | SI | SI | SI | SI | SI | SI | -- | -- | 40° |

La frontera cae exactamente en ±el valor configurado en las cuatro filas: el
motor no aplica ninguna corrección. `90` deja al NPC ciego en todo el hemisferio
trasero (se puede flanquear a 120° sin ser visto).

## 3. `SensingInterval` — latencia de reacción

Jugador aparece de frente a 800 cm dentro del cono; se mide (a) entrada → `ISeeEnemy`
y (b) `ISeeEnemy` → clave `HasSeePlayer?` escrita en el Blackboard. n = 10 por intervalo.

| intervalo | sensor → `ISeeEnemy` (min/media/max) | `ISeeEnemy` → Blackboard | total entrada → Blackboard |
|---:|---|---|---|
| 0.5 s | 57 / 194 / 492 ms | 8 / 9 / 13 ms | 66 / 203 / **500 ms** |
| 0.2 s | 26 / 100 / 178 ms | 8 / 9 / 10 ms | 34 / 109 / **187 ms** |
| 0.1 s | 8 / 50 / 84 ms | 8 / 9 / 12 ms | 17 / 59 / **92 ms** |

Lecturas:

1. La latencia del sensor es aproximadamente uniforme en `[0, intervalo]`
   (media ≈ intervalo/2, máximo ≈ intervalo): es la fase del temporizador
   interno `InitialDelay = SensingInterval * SRand()`.
2. **La escritura del Blackboard cuesta exactamente 1 frame (8–13 ms).** El
   `SetValueBlackBoard` no añade retardo propio: intercalar lógica ahí es gratis.
3. Con 0.5 s existe una ventana de invisibilidad de hasta medio segundo; con
   0.1 s baja a ≤ 92 ms.

## 4. Corte de línea de visión

NPC y jugador a ambos lados de `SM_Cube13` (eje X), mismo rumbo, 1500 cm,
`LineOfSightTo` verificado como `True` antes y `False` después.

| intervalo | n | `ISeeEnemy` → false | `HasSeePlayer?` → false | ¿LOS roto por el motor? |
|---:|---:|---|---|---|
| 0.5 s | 4 | 600.9 – 608.7 ms | 610.9 – 620.2 ms | sí (4/4) |
| 0.1 s | 4 | 602.3 – 604.5 ms | 611.2 – 615.7 ms | sí (4/4) |

**Hallazgo crítico:** el retardo es ~604 ms **independiente de `SensingInterval`**
(0.5 y 0.1 dan lo mismo) y coincide con el retardo medido al salir del radio
(604–608 ms). Conclusión: no es latencia del sensor sino un **latch de ~0.6 s en el
Blueprint** (`ResetEnemy`, probablemente un *Retriggerable Delay*). Durante esa
ventana el NPC "sigue viendo" a un jugador ocluido, y el Blackboard mantiene
`HasSeePlayer?` en `True` ~10 ms más.

## 5. Valores aplicados a la instancia del nivel

| Propiedad | Antes | Después | Motivo |
|---|---|---|---|
| `PeripheralVisionAngle` | 90 (FOV 180°) | **140** (FOV 280°) | conciencia periférica real (detecta a 135°) conservando un cono ciego trasero de 80° para el sigilo |
| `SensingInterval` | 0.5 s | **0.1 s** | ventana de invisibilidad de 500 ms → 92 ms; coste despreciable (1 timer) |
| `SightRadius` | 2000 cm | 2000 cm | no se toca |

`160` (FOV 320°, ciego solo 40°) se descartó: reduce el ángulo de infiltración a
±20° tras la espalda y rompe la mecánica de backstab.

## 6. Reproducir

```python
exec(open(r'A:\Proyectos\Unreal\Onicromo_Beta\Tools\perception_bench.py').read())
bench_setup(); bench_fps(); bench_build(); bench_start()
bench_fps_report(); bench_status()      # tablas
bench_report()                          # crudo
```
