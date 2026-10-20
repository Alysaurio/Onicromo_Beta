// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "LabDisparoRaycast.generated.h"

class UStaticMeshComponent;
class USceneComponent;

/**
 * Laboratorio de Colisiones — ejercicios 1 y 2 (nivel Lvl_TopDown):
 *  1) "Genere un raycast desde un armamento y realice un disparo de rayo"
 *  2) "Cuando el ray cast colisione con un objeto, aplique una fuerza de empuje"
 *
 * Armamento cenital que apunta al cursor, dispara con clic izquierdo y (opcional)
 * automáticamente por cadencia. Cada disparo:
 *  - Lanza LineTraceSingleByChannel (canal Visibility) desde el muzzle.
 *  - Dibuja el rayo (DrawDebugLine rojo, visible 0.5 s).
 *  - Imprime el impacto por pantalla y log (equivalente al nodo Print del lab).
 *  - Si FuerzaEmpuje > 0, aplica AddImpulseAtLocation sobre el componente
 *    impactado (solo si simula física o tiene el tag "Empujable": el suelo
 *    nunca se mueve).
 *
 * Instancias del nivel:
 *  - Lab_Raycast01         (ejercicio 1: FuerzaEmpuje = 0)
 *  - Lab_RaycastEmpuje02   (ejercicio 2: FuerzaEmpuje = 400)
 */
UCLASS()
class ONICROMO_BETA_API ALabDisparoRaycast : public AActor
{
	GENERATED_BODY()

public:
	ALabDisparoRaycast();

	virtual void Tick(float DeltaSeconds) override;

protected:
	/** Raíz sin escala (hace de origen de rotación del armamento) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	USceneComponent* Origen;

	/** Cañón del armamento (cubo alargado apuntando +X) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	UStaticMeshComponent* Armamento;

	/** Punto de salida del rayo (frente del cañón) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	USceneComponent* PuntoMuzzle;

	/** ¿Dispara solo, sin necesidad de clic? */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Disparo")
	bool bDisparoAutomatico;

	/** Cadencia del disparo automático, en segundos */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Disparo", meta = (ClampMin = 0.2, ClampMax = 10.0, Units = "s"))
	float CadenciaDisparo;

	/** Alcance del raycast, en cm */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Disparo", meta = (ClampMin = 100.0, ClampMax = 50000.0, Units = "cm"))
	float Alcance;

	/** Fuerza de empuje al impactar. 0 = ejercicio 1 (solo información) */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Disparo", meta = (ClampMin = 0.0, ClampMax = 100000.0))
	float FuerzaEmpuje;

private:
	/** Ejecuta el raycast completo: rayo visible + print de impacto + empuje opcional */
	void Disparar();

	/** Dirección normalizada desde el muzzle hacia el cursor del jugador (fallback: hacia delante) */
	FVector ObtenerDireccionDisparo(const FVector& Inicio) const;

	/** Momento (segundos de mundo) del último disparo */
	float TiempoUltimoDisparo = -1000.0f;

	/** Estado anterior del clic izquierdo (detector de flanco) */
	bool bClicAntes = false;
};
