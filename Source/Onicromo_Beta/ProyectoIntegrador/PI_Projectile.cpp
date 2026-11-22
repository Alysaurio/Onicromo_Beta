// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_Projectile.h"
#include "PI_Character.h"
#include "PI_Enemy.h"
#include "Kismet/KismetMathLibrary.h"
#include "Kismet/GameplayStatics.h"
#include "Components/SphereComponent.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "DrawDebugHelpers.h"
#include "Engine/World.h"

API_Projectile::API_Projectile()
{
	PrimaryActorTick.bCanEverTick = true;

	LifeTime = 5.0f;
	BouncesRemaining = 0;
}

void API_Projectile::BeginPlay()
{
	Super::BeginPlay();

	if (UProjectileMovementComponent* MoveComp = FindComponentByClass<UProjectileMovementComponent>())
	{
		MoveComp->ProjectileGravityScale = 0.0f;
		MoveComp->bShouldBounce = true;
		MoveComp->Bounciness = 0.8f;
		MoveComp->Friction = 0.0f;
	}

	BouncesRemaining = bBouncing ? MaxBounces : 0;
}

void API_Projectile::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (LifeTime > 0.0f)
	{
		LifeTimer += DeltaTime;
		if (LifeTimer >= LifeTime)
		{
			Destroy();
		}
	}
}

void API_Projectile::NotifyHit(class UPrimitiveComponent* MyComp, AActor* Other, class UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit)
{
	Super::NotifyHit(MyComp, Other, OtherComp, bSelfMoved, HitLocation, HitNormal, NormalImpulse, Hit);

	FHitResult ImpactHit = Hit;
	HandleProjectileImpact(ImpactHit);
}

void API_Projectile::ConfigureFromShot(const FIShotConfig& Config, API_Character* InInstigator)
{
	ProjectileSpeed = Config.ProjectileSpeed;
	Damage = Config.Damage;
	bPiercing = Config.bPiercing;
	bBouncing = Config.bBouncing;
	bExplosive = Config.bExplosive;
	ExplosionRadius = Config.ExplosionRadius;
	InstigatorCharacter = InInstigator;

	if (UProjectileMovementComponent* MoveComp = FindComponentByClass<UProjectileMovementComponent>())
	{
		MoveComp->InitialSpeed = ProjectileSpeed;
		MoveComp->MaxSpeed = ProjectileSpeed;
		MoveComp->bShouldBounce = bBouncing;
	}
}

void API_Projectile::HandleProjectileImpact(const FHitResult& ImpactResult)
{
	if (!ImpactResult.IsValidBlockingHit())
	{
		return;
	}

	AActor* HitActor = ImpactResult.GetActor();

	// Si explota, hacer daño en área y destruir
	if (bExplosive)
	{
		DoExplosion(ImpactResult.ImpactPoint);
		Destroy();
		return;
	}

	// Daño al actor impactado (si es enemigo y no es el instigador)
	if (HitActor && HitActor != InstigatorCharacter)
	{
		if (API_Enemy* Enemy = Cast<API_Enemy>(HitActor))
		{
			FVector Dir = ImpactResult.ImpactNormal.GetSafeNormal();
			Enemy->TakePiDamage(Damage, Dir);
		}
	}

	// Si no es perforante, destruir al impactar
	if (!bPiercing)
	{
		Destroy();
		return;
	}

	// Perforante: rebote contado si corresponde
	if (bBouncing && BouncesRemaining > 0)
	{
		--BouncesRemaining;
		if (BouncesRemaining <= 0)
		{
			Destroy();
		}
	}
}

void API_Projectile::DoExplosion(const FVector& ExplosionLocation)
{
	// Daño en área a enemigos cercanos
	TArray<AActor*> OverlappingActors;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_Enemy::StaticClass(), OverlappingActors);

	for (AActor* Actor : OverlappingActors)
	{
		if (Actor && Actor != InstigatorCharacter)
		{
			float Dist = FVector::Dist(Actor->GetActorLocation(), ExplosionLocation);
			if (Dist <= ExplosionRadius)
			{
				if (API_Enemy* Enemy = Cast<API_Enemy>(Actor))
				{
					FVector Dir = (Actor->GetActorLocation() - ExplosionLocation).GetSafeNormal();
					float DamageScale = FMath::GetMappedRangeValueClamped(FVector2D(0.0f, ExplosionRadius), FVector2D(1.0f, 0.2f), Dist);
					Enemy->TakePiDamage(Damage * DamageScale, Dir);
				}
			}
		}
	}

	// Debug visual de la explosión
	DrawDebugSphere(GetWorld(), ExplosionLocation, ExplosionRadius, 16, FColor::Red, false, 2.0f);
}
