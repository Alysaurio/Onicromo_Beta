// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PI_Door.generated.h"

class API_Key;

/**
 * Puerta de ProyectoIntegrador.
 * Está cerrada por defecto. Se abre cuando el jugador (portando una llave) se acerca.
 * Movimiento simple: se desliza hacia arriba o gira.
 */
UCLASS()
class ONICROMO_BETA_API API_Door : public AActor
{
	GENERATED_BODY()

public:

	API_Door();

protected:

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Componente malla visual */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	class UStaticMeshComponent* DoorMesh;

	/** Posición inicial de la puerta (cerrada) */
	FVector ClosedLocation;

	/** Posición abierta de la puerta */
	FVector OpenLocation;

	/** Si la puerta está abierta */
	bool bIsOpen = false;

	/** Si la puerta está en proceso de abrirse */
	bool bIsOpening = false;

	/** Velocidad de apertura (cm/s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Door", meta = (ClampMin = 0, Units = "cm/s"))
	float OpenSpeed = 400.0f;

	/** Distancia que se desplaza la puerta al abrirse (cm) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Door", meta = (ClampMin = 0, Units = "cm"))
	float OpenDistance = 300.0f;

	/** Llave requerida para abrir (vacío = cualquier llave sirve) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Door")
	TSubclassOf<API_Key> RequiredKeyClass;

	/** Distancia desde la que el jugador puede activar la puerta (cm) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Door", meta = (ClampMin = 0, Units = "cm"))
	float ActivationDistance = 200.0f;

public:

	/** Intenta abrir la puerta si el jugador porta una llave válida */
	UFUNCTION(BlueprintCallable, Category = "PI|Door")
	bool TryOpen(class API_Character* Player);

	/** Devuelve true si la puerta está abierta */
	UFUNCTION(BlueprintCallable, Category = "PI|Door")
	bool IsOpen() const { return bIsOpen; }

	/** Evento para que BP reproduzca sonido/animación de apertura */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Door")
	void BP_OnDoorOpened();
};
