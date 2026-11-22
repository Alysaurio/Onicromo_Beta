// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_WaveSpawner.h"
#include "PI_Enemy.h"
#include "PI_Key.h"
#include "PI_Character.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "DrawDebugHelpers.h"

API_WaveSpawner::API_WaveSpawner()
{
	PrimaryActorTick.bCanEverTick = true;

	TotalWaves = 3;
	EnemiesPerWave = 4;
	WaveDelay = 3.0f;
	CurrentWave = 0;
	EnemiesAlive = 0;
	bAllWavesCompleted = false;
}

void API_WaveSpawner::BeginPlay()
{
	Super::BeginPlay();

	TArray<AActor*> Found;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_Character::StaticClass(), Found);
	if (Found.Num() > 0)
	{
		PlayerCharacter = Cast<API_Character>(Found[0]);
	}

	if (KeySpawnLocation.IsZero())
	{
		KeySpawnLocation = GetActorLocation();
	}
}

void API_WaveSpawner::EndPlay(EEndPlayReason::Type EndPlayReason)
{
	Super::EndPlay(EndPlayReason);
	GetWorld()->GetTimerManager().ClearTimer(WaveTimer);
}

void API_WaveSpawner::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Iniciar oleadas automáticamente cuando el jugador se acerca a la sala
	if (CurrentWave == 0 && !bAllWavesCompleted)
	{
		if (API_Character* Player = Cast<API_Character>(UGameplayStatics::GetPlayerCharacter(GetWorld(), 0)))
		{
			float Dist = FVector::Dist(GetActorLocation(), Player->GetActorLocation());
			if (Dist <= 1600.0f)
			{
				StartWaves();
			}
		}
	}
}

void API_WaveSpawner::StartWaves()
{
	if (bAllWavesCompleted)
	{
		return;
	}

	CurrentWave = 0;
	SpawnWave();
}

void API_WaveSpawner::SpawnWave()
{
	if (CurrentWave >= TotalWaves)
	{
		CompleteAllWaves();
		return;
	}

	++CurrentWave;
	EnemiesAlive = EnemiesPerWave;

	for (int32 i = 0; i < EnemiesPerWave; ++i)
	{
		float Angle = (360.0f / EnemiesPerWave) * i;
		FRotator Rot(0.0f, Angle, 0.0f);
		FVector SpawnLoc = GetActorLocation() + Rot.RotateVector(FVector::ForwardVector) * SpawnRadius;

		FActorSpawnParameters SpawnParams;
		if (API_Enemy* Enemy = GetWorld()->SpawnActor<API_Enemy>(EnemyClass, SpawnLoc, Rot, SpawnParams))
		{
			Enemy->OnDestroyed.AddDynamic(this, &API_WaveSpawner::OnEnemyDestroyed);
		}
	}

	UE_LOG(LogOnicromo_Beta, Log, TEXT("PI_WaveSpawner: Oleada %d/%d iniciada (%d enemigos)."), CurrentWave, TotalWaves, EnemiesPerWave);
}

void API_WaveSpawner::OnEnemyDestroyed(AActor* DestroyedActor)
{
	if (EnemiesAlive > 0)
	{
		--EnemiesAlive;
	}

	if (EnemiesAlive <= 0 && CurrentWave < TotalWaves)
	{
		BP_OnWaveCompleted(CurrentWave);

		GetWorld()->GetTimerManager().SetTimer(
			WaveTimer,
			this,
			&API_WaveSpawner::SpawnWave,
			WaveDelay,
			false
		);
	}
	else if (EnemiesAlive <= 0 && CurrentWave >= TotalWaves)
	{
		BP_OnWaveCompleted(CurrentWave);
		CompleteAllWaves();
	}
}

void API_WaveSpawner::CompleteAllWaves()
{
	bAllWavesCompleted = true;

	if (KeyClass && !SpawnedKey)
	{
		FActorSpawnParameters SpawnParams;
		FVector SpawnLoc = KeySpawnLocation;
		SpawnLoc.Z += 40.0f; // Asegurar altura adecuada sobre el suelo
		SpawnedKey = GetWorld()->SpawnActor<API_Key>(KeyClass, SpawnLoc, FRotator::ZeroRotator, SpawnParams);
		if (SpawnedKey)
		{
			BP_OnKeySpawned(SpawnedKey);
			UE_LOG(LogOnicromo_Beta, Log, TEXT("PI_WaveSpawner: Llave spawneada en el centro de la sala."));
		}
	}
}
