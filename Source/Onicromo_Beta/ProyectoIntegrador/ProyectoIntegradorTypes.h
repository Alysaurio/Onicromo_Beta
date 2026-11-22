// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickProjectile.h"
#include "ProyectoIntegradorTypes.generated.h"

/**
 * Catálogo de los 10 tipos de disparo disponibles.
 */
UENUM(BlueprintType)
enum class EPiShotType : uint8
{
	PI_ST_Standard		UMETA(DisplayName = "1. Estándar rápido"),
	PI_ST_Shotgun		UMETA(DisplayName = "2. Escopeta / dispersión"),
	PI_ST_TripleBurst	UMETA(DisplayName = "3. Ráfaga triple"),
	PI_ST_Laser			UMETA(DisplayName = "4. Láser perforante rápido"),
	PI_ST_Bouncer		UMETA(DisplayName = "5. Rebotador"),
	PI_ST_Explosive		UMETA(DisplayName = "6. Explosivo / área"),
	PI_ST_Heavy			UMETA(DisplayName = "7. Pesado alto impacto"),
	PI_ST_Double		UMETA(DisplayName = "8. Doble paralelo"),
	PI_ST_Sinusoidal	UMETA(DisplayName = "9. Ondas / senoidal"),
	PI_ST_RapidFire		UMETA(DisplayName = "10. Cadencia alta / ligero"),
	PI_ST_MAX
};

/**
 * Configuración de un tipo de disparo individual.
 */
USTRUCT(BlueprintType)
struct FIShotConfig
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Projectile")
	TSubclassOf<ATwinStickProjectile> ProjectileClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Projectile", meta = (ClampMin = 1, ClampMax = 12))
	int32 PelletCount = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Projectile", meta = (ClampMin = 0, ClampMax = 90))
	float SpreadDegrees = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Movement", meta = (ClampMin = 100, Units = "cm/s"))
	float ProjectileSpeed = 1400.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Damage", meta = (ClampMin = 0))
	float Damage = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Timing", meta = (ClampMin = 0.05, Units = "s"))
	float FireRate = 0.2f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Flags")
	bool bPiercing = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Flags")
	bool bBouncing = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Flags")
	bool bExplosive = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Shot|Explosive", meta = (ClampMin = 0, Units = "cm"))
	float ExplosionRadius = 200.0f;

	FIShotConfig()
		: PelletCount(1)
		, SpreadDegrees(0.0f)
		, ProjectileSpeed(1400.0f)
		, Damage(1.0f)
		, FireRate(0.2f)
		, bPiercing(false)
		, bBouncing(false)
		, bExplosive(false)
		, ExplosionRadius(200.0f)
	{}
};

/**
 * Nivel del juego y su configuración de salas.
 */
USTRUCT(BlueprintType)
struct FPILevelConfig
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Level")
	FName LevelName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Level", meta = (ClampMin = 1, ClampMax = 5))
	int32 NumRooms = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Level", meta = (ClampMin = 1, ClampMax = 6))
	int32 WavesPerRoom = 3;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Level")
	TSubclassOf<class AActor> TeleportActorClass;

	FPILevelConfig()
		: NumRooms(1)
		, WavesPerRoom(3)
	{}
};
