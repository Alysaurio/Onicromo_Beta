// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickProjectile.h"
#include "ProyectoIntegradorTypes.h"
#include "PI_Projectile.generated.h"

class API_Character;

/**
 * Proyectil de ProyectoIntegrador con comportamiento según tipo de disparo:
 * rebote, explosión, perforación, velocidad, daño.
 */
UCLASS()
class ONICROMO_BETA_API API_Projectile : public ATwinStickProjectile
{
	GENERATED_BODY()

public:

	API_Projectile();

protected:

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaTime) override;

	/** Colisión del proyectil */
	virtual void NotifyHit(class UPrimitiveComponent* MyComp, AActor* Other, class UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit) override;

	/** Velocidad del proyectil (sobrescribe la del movement component) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile", meta = (ClampMin = 0, Units = "cm/s"))
	float ProjectileSpeed = 1400.0f;

	/** Daño que inflige al impactar */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile", meta = (ClampMin = 0))
	float Damage = 1.0f;

	/** Si el proyectil atraviesa enemigos (no se destruye al primer impacto) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile")
	bool bPiercing = false;

	/** Si rebota contra superficies */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile")
	bool bBouncing = false;

	/** Si explota al impactar (daño en área) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile")
	bool bExplosive = false;

	/** Radio de explosión (cm) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile", meta = (ClampMin = 0, Units = "cm"))
	float ExplosionRadius = 200.0f;

	/** Número máximo de rebotes antes de destruirse */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile", meta = (ClampMin = 0, ClampMax = 20))
	int32 MaxBounces = 3;

	/** Rebotes restantes */
	int32 BouncesRemaining = 0;

	/** Quién disparó el proyectil (para no dañarse a sí mismo) */
	TObjectPtr<API_Character> InstigatorCharacter;

	/** Tiempo de vida máximo antes de autodestruirse (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Projectile", meta = (ClampMin = 0, Units = "s"))
	float LifeTime = 5.0f;

	float LifeTimer = 0.0f;

public:

	/** Configura el proyectil desde una configuración de disparo */
	UFUNCTION(BlueprintCallable, Category = "PI|Projectile")
	void ConfigureFromShot(const struct FIShotConfig& Config, class API_Character* InInstigator);

	/** Devuelve el daño del proyectil */
	UFUNCTION(BlueprintCallable, Category = "PI|Projectile")
	float GetDamage() const { return Damage; }

protected:

	/** Maneja el impacto: explosión / rebote / destruir */
	void HandleProjectileImpact(const FHitResult& ImpactResult);

	/** Ejecuta explosión en área */
	void DoExplosion(const FVector& ExplosionLocation);
};
