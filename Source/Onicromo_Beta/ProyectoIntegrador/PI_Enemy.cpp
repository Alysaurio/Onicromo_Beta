// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_Enemy.h"
#include "PI_Character.h"
#include "PI_WaveSpawner.h"
#include "Kismet/KismetMathLibrary.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

API_Enemy::API_Enemy()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCharacterMovement()->MaxAcceleration = 800.0f;
	GetCharacterMovement()->BrakingFrictionFactor = 2.0f;
	GetCharacterMovement()->RotationRate = FRotator(0.0f, 720.0f, 0.0f);
	GetCharacterMovement()->bConstrainToPlane = true;
	GetCharacterMovement()->bSnapToPlaneAtStart = true;
}

void API_Enemy::BeginPlay()
{
	Super::BeginPlay();

	// Buscar el jugador (API_Character)
	TArray<AActor*> Found;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_Character::StaticClass(), Found);
	if (Found.Num() > 0)
	{
		PlayerCharacter = Cast<API_Character>(Found[0]);
	}

	Score = 1;
	PickupSpawnChance = 15;
	CurrentHealth = MaxHealth;
}

void API_Enemy::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (ContactDamageTimer > 0.0f)
	{
		ContactDamageTimer -= DeltaTime;
		if (ContactDamageTimer < 0.0f)
		{
			ContactDamageTimer = 0.0f;
		}
	}

	ChasePlayer(DeltaTime);
}

void API_Enemy::ChasePlayer(float DeltaTime)
{
	if (!PlayerCharacter)
	{
		PlayerCharacter = Cast<API_Character>(UGameplayStatics::GetPlayerCharacter(GetWorld(), 0));
	}

	if (!PlayerCharacter || PlayerCharacter->IsDead())
	{
		return;
	}

	FVector EnemyLoc = GetActorLocation();
	FVector PlayerLoc = PlayerCharacter->GetActorLocation();
	EnemyLoc.Z = 0.0f;
	PlayerLoc.Z = 0.0f;

	FVector ToPlayer = PlayerLoc - EnemyLoc;
	float Dist = ToPlayer.Size();

	if (Dist > StopDistance && Dist > 0.0f)
	{
		FVector Dir = ToPlayer / Dist;
		FVector DesiredVel = Dir * ChaseSpeed;
		FVector CurrentVel = GetCharacterMovement()->Velocity;
		CurrentVel.Z = 0.0f;
		FVector Accel = (DesiredVel - CurrentVel) * GetCharacterMovement()->MaxAcceleration * DeltaTime;
		AddMovementInput(Accel.GetSafeNormal(), 1.0f);

		// Orientar hacia el jugador
		FRotator TargetRot = UKismetMathLibrary::FindLookAtRotation(GetActorLocation(), PlayerCharacter->GetActorLocation());
		SetActorRotation(FRotator(0.0f, TargetRot.Yaw, 0.0f));
	}
	else
	{
		// Detener movimiento
		GetCharacterMovement()->Velocity = FVector::ZeroVector;
		ApplyContactDamage();
	}
}

void API_Enemy::ApplyContactDamage()
{
	if (!PlayerCharacter || ContactDamageTimer > 0.0f || ContactDamage <= 0.0f)
	{
		return;
	}

	FVector EnemyLoc = GetActorLocation();
	FVector PlayerLoc = PlayerCharacter->GetActorLocation();
	EnemyLoc.Z = 0.0f;
	PlayerLoc.Z = 0.0f;

	if ((PlayerLoc - EnemyLoc).Size() <= StopDistance + 40.0f)
	{
		FVector Dir = (PlayerLoc - EnemyLoc).GetSafeNormal();
		PlayerCharacter->TakePiDamage(ContactDamage, Dir);
		ContactDamageTimer = ContactDamageCooldown;
	}
}

void API_Enemy::TakePiDamage(float DamageAmount, const FVector& DamageDirection)
{
	CurrentHealth -= DamageAmount;

	// Knockback suave al enemigo
	FVector LaunchVector = DamageDirection;
	LaunchVector.Z = 0.0f;
	LaunchCharacter(LaunchVector * 1000.0f, true, true);

	if (IsDead())
	{
		// Notificar al WaveSpawner si este enemigo pertenece a una oleada
		if (GetWorld())
		{
			TArray<AActor*> Spawners;
			UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_WaveSpawner::StaticClass(), Spawners);
			for (AActor* SpawnerActor : Spawners)
			{
				if (API_WaveSpawner* Spawner = Cast<API_WaveSpawner>(SpawnerActor))
				{
					// El WaveSpawner detecta la destrucción vía OnDestroyed delegate
					break;
				}
			}
		}

		// Destruir el enemigo tras un breve delay para permitir efectos
		FTimerHandle DestroyTimer;
		GetWorld()->GetTimerManager().SetTimer(DestroyTimer, this, &API_Enemy::DeferredDestroy, 0.1f, false);
	}
}

void API_Enemy::DeferredDestroy()
{
	Destroy();
}
