// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_PlayerController.h"
#include "PI_GameMode.h"
#include "PI_Character.h"
#include "Kismet/GameplayStatics.h"

API_PlayerController::API_PlayerController()
{
}

void API_PlayerController::BeginPlay()
{
	Super::BeginPlay();
}

void API_PlayerController::OnShotTypeSelected(int32 CandidateIndex)
{
	if (API_GameMode* GM = Cast<API_GameMode>(UGameplayStatics::GetGameMode(GetWorld())))
	{
		GM->SelectShotType(CandidateIndex);
	}
}

void API_PlayerController::OnInteractDoor()
{
	if (API_Character* PiCharacter = Cast<API_Character>(GetPawn()))
	{
		if (API_GameMode* GM = Cast<API_GameMode>(UGameplayStatics::GetGameMode(GetWorld())))
		{
			GM->TryOpenCurrentDoor(PiCharacter);
		}
	}
}
