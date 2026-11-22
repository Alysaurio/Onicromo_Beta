// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickPlayerController.h"
#include "PI_PlayerController.generated.h"

/**
 * PlayerController de ProyectoIntegrador.
 * Gestiona input de selección de disparo y transiciones de nivel.
 */
UCLASS()
class ONICROMO_BETA_API API_PlayerController : public ATwinStickPlayerController
{
	GENERATED_BODY()

public:

	API_PlayerController();

protected:

	virtual void BeginPlay() override;

public:

	/** Notifica al GameMode que el jugador eligió un tipo de disparo (índice del candidato) */
	UFUNCTION(BlueprintCallable, Category = "PI|Input")
	void OnShotTypeSelected(int32 CandidateIndex);

	/** Solicita abrir la puerta más cercana (llave requerida) */
	UFUNCTION(BlueprintCallable, Category = "PI|Input")
	void OnInteractDoor();
};
