// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickSpawner.h"
#include "PI_WaveSpawner.generated.h"

class API_Enemy;
class API_Character;
class API_Key;

/**
 * Spawner de oleadas para ProyectoIntegrador.
 * Genera oleadas de enemigos en una sala. Al completar todas las oleadas,
 * spawnea una llave en el centro de la sala.
 */
UCLASS()
class ONICROMO_BETA_API API_WaveSpawner : public ATwinStickSpawner
{
	GENERATED_BODY()

public:

	API_WaveSpawner();

protected:

	virtual void BeginPlay() override;
	virtual void EndPlay(EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaTime) override;

	/** Clase de enemigo a spawnear */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Wave")
	TSubclassOf<API_Enemy> EnemyClass;

	/** Número de oleadas en esta sala */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Wave", meta = (ClampMin = 1, ClampMax = 10))
	int32 TotalWaves = 3;

	/** Enemigos por oleada */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Wave", meta = (ClampMin = 1, ClampMax = 20))
	int32 EnemiesPerWave = 4;

	/** Delay entre oleadas (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Wave", meta = (ClampMin = 0, Units = "s"))
	float WaveDelay = 3.0f;

	/** Oleada actual */
	int32 CurrentWave = 0;

	/** Enemigos vivos en la oleada actual */
	int32 EnemiesAlive = 0;

	/** Si todas las oleadas están completadas */
	bool bAllWavesCompleted = false;

	/** Clave que se spawnea al completar la sala */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Wave")
	TSubclassOf<API_Key> KeyClass;

	/** Posición donde spawnear la llave (centro de la sala) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Wave")
	FVector KeySpawnLocation = FVector::ZeroVector;

	/** Referencia a la llave spawneada */
	TObjectPtr<API_Key> SpawnedKey;

	/** Temporizador entre oleadas */
	FTimerHandle WaveTimer;

	/** Referencia al jugador */
	TObjectPtr<API_Character> PlayerCharacter;

public:

	/** Devuelve true si todas las oleadas se completaron */
	UFUNCTION(BlueprintCallable, Category = "PI|Wave")
	bool AreAllWavesCompleted() const { return bAllWavesCompleted; }

	/** Devuelve la oleada actual */
	UFUNCTION(BlueprintCallable, Category = "PI|Wave")
	int32 GetCurrentWave() const { return CurrentWave; }

	/** Devuelve el total de oleadas */
	UFUNCTION(BlueprintCallable, Category = "PI|Wave")
	int32 GetTotalWaves() const { return TotalWaves; }

	/** Devuelve true si hay una llave lista para recoger */
	UFUNCTION(BlueprintCallable, Category = "PI|Wave")
	bool HasKey() const { return SpawnedKey != nullptr && !SpawnedKey->IsHeld(); }

	/** Inicia el spawneo de oleadas */
	UFUNCTION(BlueprintCallable, Category = "PI|Wave")
	void StartWaves();

protected:

	/** Spawnea una oleada completa */
	void SpawnWave();

	/** Spawnea un enemigo individual */
	void SpawnSingleEnemy();

	/** Notifica que un enemigo fue destruido */
	UFUNCTION()
	void OnEnemyDestroyed(AActor* DestroyedActor);

	/** Completa todas las oleadas y spawnea la llave */
	void CompleteAllWaves();

	/** Evento BP al completar una oleada */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Wave")
	void BP_OnWaveCompleted(int32 WaveNumber);

	/** Evento BP al spawnear la llave */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Wave")
	void BP_OnKeySpawned(class API_Key* Key);
};
