// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickUI.h"
#include "PI_HUD.generated.h"

/**
 * HUD de ProyectoIntegrador.
 * Expone funciones para mostrar vidas, efectos de pantalla por bajo HP y selección de disparo.
 */
UCLASS()
class ONICROMO_BETA_API UPI_HUD : public UTwinStickUI
{
	GENERATED_BODY()

public:

	/** Actualiza el contador de vidas en el HUD */
	UFUNCTION(BlueprintCallable, Category = "PI|HUD")
	void UpdateLivesDisplay(int32 CurrentLives, int32 MaxLives);

	/** Activa el efecto de pantalla según vidas restantes: 3=normal, 2=viñeta roja, 1=tinte rojo */
	UFUNCTION(BlueprintCallable, Category = "PI|HUD")
	void ApplyLowLifeEffect(int32 CurrentLives);

	/** Muestra la UI de selección de disparo (2 candidatos, elige 1) */
	UFUNCTION(BlueprintCallable, Category = "PI|HUD")
	void ShowShotSelection();

	/** Oculta la UI de selección de disparo */
	UFUNCTION(BlueprintCallable, Category = "PI|HUD")
	void HideShotSelection();

	/** Muestra pantalla de game over */
	UFUNCTION(BlueprintCallable, Category = "PI|HUD")
	void ShowGameOver();

	/** Muestra pantalla de créditos / victoria */
	UFUNCTION(BlueprintCallable, Category = "PI|HUD")
	void ShowCredits();
};
