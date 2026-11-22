// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickGameMode.h"
#include "ProyectoIntegradorTypes.h"
#include "PI_GameMode.generated.h"

class API_Character;
class API_Key;
class API_Door;
class API_Teleport;
class API_WaveSpawner;
class UTwinStickUI;

/**
 * GameMode de ProyectoIntegrador.
 * Gestiona progresión de 4 niveles, salas, oleadas, selección de tipo de disparo,
 * sistema de vidas, llaves/puertas y teletransporte con fade.
 */
UCLASS()
class ONICROMO_BETA_API API_GameMode : public ATwinStickGameMode
{
	GENERATED_BODY()

public:

	API_GameMode();

protected:

	virtual void BeginPlay() override;
	virtual void EndPlay(EEndPlayReason::Type EndPlayReason) override;

public:

	/** Configuración de los 4 niveles */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "PI|Levels")
	TArray<FPILevelConfig> LevelConfigs;

	/** Índice del nivel actual (0-based) */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Levels")
	int32 CurrentLevelIndex = 0;

	/** Índice de la sala actual dentro del nivel */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Levels")
	int32 CurrentRoomIndex = 0;

	/** Catálogo de tipos de disparo */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "PI|Shots")
	TObjectPtr<UPI_ShotCatalog> ShotCatalog;

	/** Los 2 tipos de disparo candidatos seleccionados al azar para este nivel */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Shots")
	TArray<EPiShotType> CandidateShotTypes;

	/** Tipo de disparo elegido por el jugador para este nivel */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Shots")
	EPiShotType SelectedShotType = EPiShotType::PI_ST_Standard;

	/** Si la selección de disparo está pendiente de que el jugador elija */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Shots")
	bool bAwaitingShotSelection = false;

	/** Referencia al jugador */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Game")
	TObjectPtr<API_Character> PlayerCharacter;

	/** Clase del widget de selección de disparo */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|UI")
	TSubclassOf<UUserWidget> ShotSelectionWidgetClass;

	/** Referencia al widget de selección de disparo */
	UPROPERTY()
	TObjectPtr<UUserWidget> ShotSelectionWidget;

	/** Clase del widget de game over */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|UI")
	TSubclassOf<UUserWidget> GameOverWidgetClass;

	/** Clase del widget de créditos / victoria */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|UI")
	TSubclassOf<UUserWidget> CreditsWidgetClass;

	/** Tiempo entre niveles (transición) (s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "PI|Levels", meta = (ClampMin = 0, Units = "s"))
	float InterLevelDelay = 2.0f;

	/** Si el juego ha terminado (derrota) */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Game")
	bool bGameOver = false;

	/** Si el jugador ganó (completó el nivel 4) */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Game")
	bool bGameWon = false;

	/** Inicia el nivel actual (o la selección de disparos si es el primero de una sala) */
	UFUNCTION(BlueprintCallable, Category = "PI|Game")
	void StartCurrentLevel();

	/** Inicia la selección aleatoria de 2 disparos y muestra UI para elegir 1 */
	UFUNCTION(BlueprintCallable, Category = "PI|Shots")
	void BeginShotSelection();

	/** El jugador elige uno de los 2 candidatos (índice 0 o 1) y se avanza a la primera sala */
	UFUNCTION(BlueprintCallable, Category = "PI|Shots")
	void SelectShotType(int32 CandidateIndex);

	/** Comienza la siguiente sala (o siguiente nivel si se terminaron las salas) */
	UFUNCTION(BlueprintCallable, Category = "PI|Levels")
	void StartNextRoom();

	/** Notifica que una sala fue completada (oleadas terminadas, llave spawneada) */
	UFUNCTION(BlueprintCallable, Category = "PI|Levels")
	void OnRoomCompleted();

	/** Notifica que el jugador recogió la llave de la sala */
	UFUNCTION(BlueprintCallable, Category = "PI|Levels")
	void OnKeyPickedUp(API_Key* Key);

	/** Intenta abrir la puerta de la sala actual si el jugador tiene la llave */
	UFUNCTION(BlueprintCallable, Category = "PI|Levels")
	bool TryOpenCurrentDoor(API_Character* Player);

	/** Maneja la muerte del jugador (derrota / reinicio de sala) */
	UFUNCTION(BlueprintCallable, Category = "PI|Game")
	void OnPlayerDeath();

	/** Muestra pantalla de game over */
	UFUNCTION(BlueprintCallable, Category = "PI|Game")
	void ShowGameOver();

	/** Muestra pantalla de créditos / victoria */
	UFUNCTION(BlueprintCallable, Category = "PI|Game")
	void ShowCredits();

	/** Devuelve el tipo de disparo seleccionado */
	UFUNCTION(BlueprintCallable, Category = "PI|Shots")
	EPiShotType GetSelectedShotType() const { return SelectedShotType; }

	/** Devuelve true si está esperando selección de disparo */
	UFUNCTION(BlueprintCallable, Category = "PI|Shots")
	bool IsAwaitingShotSelection() const { return bAwaitingShotSelection; }

protected:

	/** Crea y muestra el widget de selección de disparo */
	void ShowShotSelectionWidget();

	/** Oculta el widget de selección de disparo */
	void HideShotSelectionWidget();

	/** Carga el nivel dado por su nombre */
	void LoadLevelByName(const FString& LevelName);

	/** Reinicia la sala actual (tras muerte del jugador) */
	void RestartCurrentRoom();

	/** Notifica al jugador el tipo de disparo seleccionado */
	void ApplySelectedShotToPlayer();

	/** Evento BP para transición de nivel con fade */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Levels")
	void BP_TransitionToNextLevel(float FadeDuration);

	/** Evento BP al cambiar de sala */
	UFUNCTION(BlueprintImplementableEvent, Category = "PI|Levels")
	void BP_OnRoomChanged(int32 LevelIndex, int32 RoomIndex);
};
