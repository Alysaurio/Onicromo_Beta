// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_Key.h"
#include "PI_Character.h"
#include "TrailHistoryComponent.h"
#include "GameFramework/Character.h"
#include "Engine/World.h"

API_Key::API_Key()
{
	// La llave sigue al jugador por defecto
	bFollowsPlayer = true;
	FollowDistance = 100.0f;
	ChainSpacing = 90.0f;
	FollowInterpSpeed = 8.0f;
	bIsHeld = false;
}

void API_Key::BeginPlay()
{
	Super::BeginPlay();
}

void API_Key::NotifyActorBeginOverlap(AActor* OtherActor)
{
	Super::NotifyActorBeginOverlap(OtherActor);

	if (bFollowsPlayer && !bIsHeld)
	{
		if (API_Character* Player = Cast<API_Character>(OtherActor))
		{
			GiveToPlayer(Player);
		}
	}
}

void API_Key::GiveToPlayer(API_Character* NewHolder)
{
	if (!NewHolder || bIsHeld)
	{
		return;
	}

	Holder = NewHolder;
	bIsHeld = true;

	// Configurar para seguir al jugador usando el trail history
	if (UTrailHistoryComponent* Trail = NewHolder->GetTrailComponent())
	{
		StartFollowing(Trail);
	}
}
