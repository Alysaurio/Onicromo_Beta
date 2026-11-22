// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickNPC.h"
#include "PI_Enemy.generated.h"

/**
 * Enemigo de ProyectoIntegrador con IA básica de persecución twin-stick.
 * Se mueve hacia el jugador y causa daño al contactar.
 */
UCLASS()
class ONICROMO_BETA_API API_Enemy : public ATwinStickNPC
{
	GENERATED_BODY()

public:

	API_Enemy();

protected:

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Velocidad de persecución (cm/s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Enemy", meta = (ClampMin = 0, Units = "cm/s"))
	float ChaseSpeed = 400.0f;

	/** Distancia a la que deja de perseguir y se detiene (cm) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Enemy", meta = (ClampMin = 0, Units = "cm"))
	float StopDistance = 120.0f;

	/** Daño que inflige al jugador al contactar */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Enemy", meta = (ClampMin = 0))
	float ContactDamage = 1.0f;

	/** Tiempo entre golpes de contacto (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Enemy", meta = (ClampMin = 0, Units = "s"))
	float ContactDamageCooldown = 1.0f;

	/** Vida máxima del enemigo */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Enemy", meta = (ClampMin = 0))
	float MaxHealth = 3.0f;

	/** Vida actual del enemigo */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Enemy")
	float CurrentHealth = 3.0f;

	float ContactDamageTimer = 0.0f;

	/** Referencia al jugador (cacheada) */
	TObjectPtr<class API_Character> PlayerCharacter;

public:

	/** Devuelve true si el enemigo está activo persiguiendo */
	UFUNCTION(BlueprintCallable, Category = "PI|Enemy")
	bool IsChasing() const { return PlayerCharacter != nullptr; }

	/** Devuelve true si el enemigo ha muerto */
	UFUNCTION(BlueprintCallable, Category = "PI|Enemy")
	bool IsDead() const { return CurrentHealth <= 0.0f; }

	/** Aplica daño al enemigo y destruye si se queda sin vida */
	UFUNCTION(BlueprintCallable, Category = "PI|Enemy")
	void TakePiDamage(float DamageAmount, const FVector& DamageDirection);

protected:

	/** Mueve al enemigo hacia el jugador */
	void ChasePlayer(float DeltaTime);

	/** Aplica daño de contacto al jugador si está en rango y cooldown cumplido */
	void ApplyContactDamage();

	/** Destrucción diferida tras morir */
	UFUNCTION()
	void DeferredDestroy();
};
