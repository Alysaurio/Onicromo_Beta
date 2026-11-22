// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_Teleport.h"
#include "PI_Character.h"
#include "Components/StaticMeshComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Camera/PlayerCameraManager.h"

API_Teleport::API_Teleport()
{
	PrimaryActorTick.bCanEverTick = true;

	TeleportMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("TeleportMesh"));
	RootComponent = TeleportMesh;

	bIsActive = true;
	FadeDuration = 1.0f;
	PostFadeDelay = 0.5f;
	bPlayerInside = false;
	bTeleporting = false;
}

void API_Teleport::BeginPlay()
{
	Super::BeginPlay();
}

void API_Teleport::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Detección automática de proximidad del jugador
	if (bIsActive && !bTeleporting)
	{
		if (API_Character* Player = Cast<API_Character>(UGameplayStatics::GetPlayerCharacter(GetWorld(), 0)))
		{
			float Dist = FVector::Dist(GetActorLocation(), Player->GetActorLocation());
			if (Dist <= 180.0f)
			{
				ActivateTeleport(Player);
			}
		}
	}
}

void API_Teleport::ActivateTeleport(API_Character* Player)
{
	if (!bIsActive || bTeleporting || !Player)
	{
		return;
	}

	bTeleporting = true;
	PlayerInside = Player;

	// Fade suave de cámara a negro
	if (APlayerCameraManager* CameraManager = UGameplayStatics::GetPlayerCameraManager(GetWorld(), 0))
	{
		CameraManager->StartCameraFade(0.0f, 1.0f, FadeDuration, FLinearColor::Black, false, true);
	}

	BP_StartFadeOut(FadeDuration);

	float TotalDelay = FadeDuration + PostFadeDelay;
	GetWorld()->GetTimerManager().SetTimer(
		TeleportTimer,
		this,
		&API_Teleport::CompleteTeleport,
		TotalDelay,
		false
	);
}

void API_Teleport::CompleteTeleport()
{
	if (DestinationLevelName.IsEmpty())
	{
		UE_LOG(LogOnicromo_Beta, Error, TEXT("API_Teleport: DestinationLevelName no configurado."));
		bTeleporting = false;
		return;
	}

	UGameplayStatics::OpenLevel(GetWorld(), FName(*DestinationLevelName));
}
