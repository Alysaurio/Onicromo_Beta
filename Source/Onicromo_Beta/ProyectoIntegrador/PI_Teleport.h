// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PI_Teleport.generated.h"

class API_Character;

/**
 * Punto de teletransporte con fade.
 * Cuando el jugador entra, se ejecuta un fade out suave y se cambia de nivel.
 */
UCLASS()
class ONICROMO_BETA_API API_Teleport : public AActor
{
	GENERATED_BODY()

public:

	API_Teleport();

protected:

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Componente visual (esfera/aro) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	class UStaticMeshComponent* TeleportMesh;

	/** Nombre del nivel de destino (ej. "/Game/ProyectoIntegrador/Maps/PI_Lvl02_TwoRooms") */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Teleport")
	FString DestinationLevelName;

	/** Si el teletransporte está activo */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Teleport")
	bool bIsActive = true;

	/** Duración del fade out (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Teleport", meta = (ClampMin = 0.1, Units = "s"))
	float FadeDuration = 1.0f;

	/** Tiempo de espera tras el fade antes de cambiar de nivel (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Teleport", meta = (ClampMin = 0, Units = "s"))
	float PostFadeDelay = 0.5f;

	/** Si el jugador está dentro del volumen de activación */
	bool bPlayerInside = false;

	/** Referencia al jugador dentro */
	TObjectPtr<API_Character> PlayerInside;

	/** Temporizador de activación */
	FTimerHandle TeleportTimer;

	/** Si ya se está ejecutando el teletransporte */
	bool bTeleporting = false;

public:

	/** Activa el teletransporte (fade + cambio de nivel) */
	UFUNCTION(BlueprintCallable, Category = "PI|Teleport")
	void ActivateTeleport(class API_Character* Player);

	/** Devuelve true si el teletransporte está activo */
	UFUNCTION(BlueprintCallable, Category = "PI|Teleport")
	bool IsActive() const { return bIsActive && !bTeleporting; }

protected:

	/** Ejecuta el cambio de nivel tras el fade */
	void CompleteTeleport();

	/** Evento BP para iniciar el fade visual */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Teleport")
	void BP_StartFadeOut(float Duration);
};
