// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickCharacter.h"
#include "ProyectoIntegradorTypes.h"
#include "PI_Character.generated.h"

class UPI_ShotCatalog;

/**
 * Personaje jugador de ProyectoIntegrador.
 * Añade sistema de vidas (3 HP), invulnerabilidad tras daño y selección del tipo de disparo activo.
 */
UCLASS()
class ONICROMO_BETA_API API_Character : public ATwinStickCharacter
{
	GENERATED_BODY()

public:

	API_Character();

protected:

	/** Gameplay initialization */
	virtual void BeginPlay() override;

	/** Cleanup */
	virtual void EndPlay(EEndPlayReason::Type EndPlayReason) override;

	/** Tick */
	virtual void Tick(float DeltaTime) override;

public:

	/** Vida máxima del jugador */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Lives", meta = (ClampMin = 1, ClampMax = 10))
	int32 MaxLives = 3;

	/** Vidas actuales */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Lives", meta = (ClampMin = 0))
	int32 CurrentLives = 3;

	/** Tiempo de invulnerabilidad tras recibir daño (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Lives", meta = (ClampMin = 0, Units = "s"))
	float InvulnerabilityTime = 1.5f;

	/** Catálogo de tipos de disparo */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "PI|Shots")
	TObjectPtr<UPI_ShotCatalog> ShotCatalog;

	/** Tipo de disparo actualmente equipado por el jugador */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Shots")
	EPiShotType CurrentShotType = EPiShotType::PI_ST_Standard;

	/** Tiempo restante de cadencia de disparo para el tipo activo */
	float ShotCooldownTimer = 0.0f;

	/** Si está invulnerable tras recibir daño */
	bool bIsInvulnerable = false;

	/** Temporizador de invulnerabilidad */
	FTimerHandle InvulnerabilityTimer;

	/** Recibe daño: reduce una vida (si no está invulnerable) y activa efectos de pantalla */
	UFUNCTION(BlueprintCallable, Category = "PI|Lives")
	void TakePiDamage(float DamageAmount, const FVector& DamageDirection);

	/** Devuelve true si el jugador puede disparar ahora (cadencia cumplida) */
	UFUNCTION(BlueprintCallable, Category = "PI|Shots")
	bool CanShoot() const;

	/** Dispara usando el tipo de disparo activo configurado */
	UFUNCTION(BlueprintCallable, Category = "PI|Shots")
	void ShootWithCurrentType();

	/** Devuelve las vidas actuales */
	UFUNCTION(BlueprintCallable, Category = "PI|Lives")
	int32 GetCurrentLives() const { return CurrentLives; }

	/** Devuelve la vida máxima */
	UFUNCTION(BlueprintCallable, Category = "PI|Lives")
	int32 GetMaxLives() const { return MaxLives; }

	/** Devuelve true si el jugador ha perdido todas las vidas */
	UFUNCTION(BlueprintCallable, Category = "PI|Lives")
	bool IsDead() const { return CurrentLives <= 0; }

protected:

	/** Setup input component */
	virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

	/** Disparo personalizado que respeta el tipo seleccionado */
	void ShootCustom();

	/** Termina la invulnerabilidad */
	void EndInvulnerability();

	/** Maneja la muerte del jugador (derrota / reinicio) */
	void HandlePlayerDeath();

	/** Evento de daño para que BP reaccione (pantalla roja, etc.) */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Lives", meta = (DisplayName = "On Pi Damaged"))
	void BP_OnPiDamaged(int32 NewLives, bool bIsLowLife);
};
