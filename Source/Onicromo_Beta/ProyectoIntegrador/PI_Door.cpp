// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_Door.h"
#include "PI_Key.h"
#include "PI_Character.h"
#include "Components/StaticMeshComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"

API_Door::API_Door()
{
	PrimaryActorTick.bCanEverTick = true;

	DoorMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("DoorMesh"));
	RootComponent = DoorMesh;

	OpenSpeed = 400.0f;
	OpenDistance = 300.0f;
	ActivationDistance = 200.0f;
	bIsOpen = false;
	bIsOpening = false;
}

void API_Door::BeginPlay()
{
	Super::BeginPlay();

	ClosedLocation = GetActorLocation();
	OpenLocation = ClosedLocation + FVector(0.0f, 0.0f, OpenDistance);
}

void API_Door::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Apertura automática por proximidad si el jugador porta la llave
	if (!bIsOpen && !bIsOpening)
	{
		if (API_Character* Player = Cast<API_Character>(UGameplayStatics::GetPlayerCharacter(GetWorld(), 0)))
		{
			float Dist = FVector::Dist(GetActorLocation(), Player->GetActorLocation());
			if (Dist <= ActivationDistance)
			{
				TryOpen(Player);
			}
		}
	}

	if (bIsOpening)
	{
		FVector CurrentLoc = GetActorLocation();
		FVector TargetLoc = OpenLocation;
		FVector NewLoc = FMath::VInterpConstantTo(CurrentLoc, TargetLoc, DeltaTime, OpenSpeed);
		SetActorLocation(NewLoc);

		if (FVector::Dist(NewLoc, TargetLoc) < 5.0f)
		{
			SetActorLocation(TargetLoc);
			bIsOpening = false;
			bIsOpen = true;

			if (DoorMesh)
			{
				DoorMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			}

			BP_OnDoorOpened();
		}
	}
}

bool API_Door::TryOpen(API_Character* Player)
{
	if (bIsOpen || bIsOpening)
	{
		return false;
	}

	if (!Player)
	{
		return false;
	}

	// Verificar distancia
	float Dist = FVector::Dist(GetActorLocation(), Player->GetActorLocation());
	if (Dist > ActivationDistance)
	{
		return false;
	}

	// Verificar que el jugador porte una llave válida
	bool bHasValidKey = false;
	if (RequiredKeyClass)
	{
		// Buscar si el jugador tiene una llave de la clase requerida
		// (en este diseño, el jugador porta la llave como follower; aquí comprobamos tags)
		TArray<AActor*> Keys;
		UGameplayStatics::GetAllActorsOfClass(GetWorld(), RequiredKeyClass, Keys);
		for (AActor* KeyActor : Keys)
		{
			if (API_Key* Key = Cast<API_Key>(KeyActor))
			{
				if (Key->IsHeld() && Key->Holder == Player)
				{
					bHasValidKey = true;
					break;
				}
			}
		}
	}
	else
	{
		// Cualquier llave portada sirve
		TArray<AActor*> Keys;
		UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_Key::StaticClass(), Keys);
		for (AActor* KeyActor : Keys)
		{
			if (API_Key* Key = Cast<API_Key>(KeyActor))
			{
				if (Key->IsHeld() && Key->Holder == Player)
				{
					bHasValidKey = true;
					break;
				}
			}
		}
	}

	if (!bHasValidKey)
	{
		return false;
	}

	bIsOpening = true;
	bIsOpen = false;
	return true;
}
