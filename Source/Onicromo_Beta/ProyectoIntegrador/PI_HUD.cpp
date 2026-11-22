// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_HUD.h"
#include "PI_GameMode.h"
#include "PI_Character.h"
#include "Kismet/GameplayStatics.h"

void UPI_HUD::UpdateLivesDisplay(int32 CurrentLives, int32 MaxLives)
{
	// Los valores se leen desde el widget BP; esta función sirve de punto de entrada desde C++
	if (API_GameMode* GM = Cast<API_GameMode>(UGameplayStatics::GetGameMode(GetWorld())))
	{
		// Sincronizar con el GameMode si es necesario
	}
}

void UPI_HUD::ApplyLowLifeEffect(int32 CurrentLives)
{
	// El efecto visual (viñeta / tinte rojo) se implementa en el widget BP
	// desde el evento BP_OnPiDamaged del personaje
}

void UPI_HUD::ShowShotSelection()
{
}

void UPI_HUD::HideShotSelection()
{
}

void UPI_HUD::ShowGameOver()
{
	if (API_GameMode* GM = Cast<API_GameMode>(UGameplayStatics::GetGameMode(GetWorld())))
	{
		GM->ShowGameOver();
	}
}

void UPI_HUD::ShowCredits()
{
	if (API_GameMode* GM = Cast<API_GameMode>(UGameplayStatics::GetGameMode(GetWorld())))
	{
		GM->ShowCredits();
	}
}
