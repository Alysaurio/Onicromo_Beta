// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_GameMode.h"
#include "PI_Character.h"
#include "PI_Key.h"
#include "PI_Door.h"
#include "PI_Teleport.h"
#include "PI_WaveSpawner.h"
#include "PI_ShotCatalog.h"
#include "Kismet/GameplayStatics.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Blueprint/UserWidget.h"
#include "UObject/ConstructorHelpers.h"
#include "Onicromo_Beta.h"

API_GameMode::API_GameMode()
{
	static ConstructorHelpers::FClassFinder<APawn> PawnFinder(TEXT("/Game/ProyectoIntegrador/Blueprints/BP_PI_Character"));
	if (PawnFinder.Succeeded())
	{
		DefaultPawnClass = PawnFinder.Class;
	}

	static ConstructorHelpers::FClassFinder<APlayerController> PCFinder(TEXT("/Game/ProyectoIntegrador/Blueprints/BP_PI_PlayerController"));
	if (PCFinder.Succeeded())
	{
		PlayerControllerClass = PCFinder.Class;
	}

	static ConstructorHelpers::FClassFinder<UTwinStickUI> UIFinder(TEXT("/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_HUD"));
	if (UIFinder.Succeeded())
	{
		UIWidgetClass = UIFinder.Class;
	}

	static ConstructorHelpers::FClassFinder<UUserWidget> ShotSelFinder(TEXT("/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_ShotSelection"));
	if (ShotSelFinder.Succeeded())
	{
		ShotSelectionWidgetClass = ShotSelFinder.Class;
	}

	static ConstructorHelpers::FClassFinder<UUserWidget> GameOverFinder(TEXT("/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_GameOver"));
	if (GameOverFinder.Succeeded())
	{
		GameOverWidgetClass = GameOverFinder.Class;
	}

	static ConstructorHelpers::FClassFinder<UUserWidget> CreditsFinder(TEXT("/Game/ProyectoIntegrador/Blueprints/UI/WBP_PI_Credits"));
	if (CreditsFinder.Succeeded())
	{
		CreditsWidgetClass = CreditsFinder.Class;
	}

	static ConstructorHelpers::FObjectFinder<UPI_ShotCatalog> CatalogFinder(TEXT("/Game/ProyectoIntegrador/Data/DA_PI_ShotCatalog"));
	if (CatalogFinder.Succeeded())
	{
		ShotCatalog = CatalogFinder.Object;
	}

	LevelConfigs.SetNum(4);

	LevelConfigs[0].LevelName = TEXT("/Game/ProyectoIntegrador/Maps/PI_Lvl01_Tutorial");
	LevelConfigs[0].NumRooms = 1;
	LevelConfigs[0].WavesPerRoom = 1;

	LevelConfigs[1].LevelName = TEXT("/Game/ProyectoIntegrador/Maps/PI_Lvl02_TwoRooms");
	LevelConfigs[1].NumRooms = 2;
	LevelConfigs[1].WavesPerRoom = 3;

	LevelConfigs[2].LevelName = TEXT("/Game/ProyectoIntegrador/Maps/PI_Lvl03_ThreeRooms");
	LevelConfigs[2].NumRooms = 3;
	LevelConfigs[2].WavesPerRoom = 3;

	LevelConfigs[3].LevelName = TEXT("/Game/ProyectoIntegrador/Maps/PI_Lvl04_BossAndEnding");
	LevelConfigs[3].NumRooms = 1;
	LevelConfigs[3].WavesPerRoom = 1;

	CurrentLevelIndex = 0;
	CurrentRoomIndex = 0;
	InterLevelDelay = 2.0f;
	bGameOver = false;
	bGameWon = false;
	bAwaitingShotSelection = false;
}

void API_GameMode::BeginPlay()
{
	Super::BeginPlay();

	TArray<AActor*> Found;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_Character::StaticClass(), Found);
	if (Found.Num() > 0)
	{
		PlayerCharacter = Cast<API_Character>(Found[0]);
	}

	StartCurrentLevel();
}

void API_GameMode::EndPlay(EEndPlayReason::Type EndPlayReason)
{
	Super::EndPlay(EndPlayReason);
}

void API_GameMode::StartCurrentLevel()
{
	if (bGameOver || bGameWon)
	{
		return;
	}

	if (CurrentLevelIndex >= LevelConfigs.Num())
	{
		bGameWon = true;
		ShowCredits();
		return;
	}

	bAwaitingShotSelection = true;
	CurrentRoomIndex = 0;
	BeginShotSelection();
}

void API_GameMode::BeginShotSelection()
{
	if (!ShotCatalog)
	{
		UE_LOG(LogOnicromo_Beta, Error, TEXT("API_GameMode: ShotCatalog no configurado."));
		return;
	}

	CandidateShotTypes.Empty();
	TArray<EPiShotType> AllTypes;
	for (int32 i = 0; i < (int8)EPiShotType::PI_ST_MAX; ++i)
	{
		AllTypes.Add((EPiShotType)i);
	}

	for (int32 i = 0; i < 2 && AllTypes.Num() > 0; ++i)
	{
		int32 Idx = FMath::RandRange(0, AllTypes.Num() - 1);
		CandidateShotTypes.Add(AllTypes[Idx]);
		AllTypes.RemoveAt(Idx);
	}

	bAwaitingShotSelection = true;
	ShowShotSelectionWidget();

	UE_LOG(LogOnicromo_Beta, Log, TEXT("API_GameMode: Selección de disparo iniciada. Candidatos: %d, %d"),
		(int8)CandidateShotTypes[0], (int8)CandidateShotTypes[1]);
}

void API_GameMode::SelectShotType(int32 CandidateIndex)
{
	if (!bAwaitingShotSelection || CandidateIndex < 0 || CandidateIndex >= CandidateShotTypes.Num())
	{
		return;
	}

	SelectedShotType = CandidateShotTypes[CandidateIndex];
	bAwaitingShotSelection = false;

	HideShotSelectionWidget();

	ApplySelectedShotToPlayer();

	StartNextRoom();

	UE_LOG(LogOnicromo_Beta, Log, TEXT("API_GameMode: Tipo de disparo seleccionado: %d"), (int8)SelectedShotType);
}

void API_GameMode::ApplySelectedShotToPlayer()
{
	if (!PlayerCharacter)
	{
		PlayerCharacter = Cast<API_Character>(UGameplayStatics::GetPlayerCharacter(GetWorld(), 0));
	}

	if (PlayerCharacter && ShotCatalog)
	{
		PlayerCharacter->CurrentShotType = SelectedShotType;
		PlayerCharacter->ShotCatalog = ShotCatalog;
	}
}

void API_GameMode::StartNextRoom()
{
	if (bGameOver || bGameWon)
	{
		return;
	}

	if (CurrentLevelIndex >= LevelConfigs.Num())
	{
		bGameWon = true;
		ShowCredits();
		return;
	}

	const FPILevelConfig& LevelConfig = LevelConfigs[CurrentLevelIndex];

	if (CurrentRoomIndex >= LevelConfig.NumRooms)
	{
		++CurrentLevelIndex;
		CurrentRoomIndex = 0;

		if (CurrentLevelIndex >= LevelConfigs.Num())
		{
			bGameWon = true;
			ShowCredits();
			return;
		}

		BP_TransitionToNextLevel(1.0f);
		StartCurrentLevel();
		return;
	}

	BP_OnRoomChanged(CurrentLevelIndex, CurrentRoomIndex);
}

void API_GameMode::OnRoomCompleted()
{
	UE_LOG(LogOnicromo_Beta, Log, TEXT("API_GameMode: Sala %d del nivel %d completada."), CurrentRoomIndex, CurrentLevelIndex);
}

void API_GameMode::OnKeyPickedUp(API_Key* Key)
{
	if (!Key) return;
	UE_LOG(LogOnicromo_Beta, Log, TEXT("API_GameMode: Llave recogida por el jugador."));
}

bool API_GameMode::TryOpenCurrentDoor(API_Character* Player)
{
	if (!Player) return false;

	TArray<AActor*> Doors;
	UGameplayStatics::GetAllActorsOfClass(GetWorld(), API_Door::StaticClass(), Doors);

	API_Door* ClosestDoor = nullptr;
	float ClosestDist = TNumericLimits<float>::Max();

	for (AActor* DoorActor : Doors)
	{
		API_Door* Door = Cast<API_Door>(DoorActor);
		if (Door && !Door->IsOpen())
		{
			float Dist = FVector::Dist(Door->GetActorLocation(), Player->GetActorLocation());
			if (Dist < ClosestDist)
			{
				ClosestDist = Dist;
				ClosestDoor = Door;
			}
		}
	}

	if (ClosestDoor)
	{
		return ClosestDoor->TryOpen(Player);
	}

	return false;
}

void API_GameMode::OnPlayerDeath()
{
	bGameOver = true;
	ShowGameOver();
}

void API_GameMode::ShowGameOver()
{
	if (GameOverWidgetClass)
	{
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0))
		{
			UUserWidget* Widget = CreateWidget<UUserWidget>(PC, GameOverWidgetClass);
			if (Widget)
			{
				Widget->AddToViewport();
			}
		}
	}
}

void API_GameMode::ShowCredits()
{
	if (CreditsWidgetClass)
	{
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0))
		{
			UUserWidget* Widget = CreateWidget<UUserWidget>(PC, CreditsWidgetClass);
			if (Widget)
			{
				Widget->AddToViewport();
			}
		}
	}
}

void API_GameMode::ShowShotSelectionWidget()
{
	if (ShotSelectionWidgetClass)
	{
		if (APlayerController* PC = UGameplayStatics::GetPlayerController(GetWorld(), 0))
		{
			ShotSelectionWidget = CreateWidget<UUserWidget>(PC, ShotSelectionWidgetClass);
			if (ShotSelectionWidget)
			{
				ShotSelectionWidget->AddToViewport();
			}
		}
	}
}

void API_GameMode::HideShotSelectionWidget()
{
	if (ShotSelectionWidget)
	{
		ShotSelectionWidget->RemoveFromParent();
		ShotSelectionWidget = nullptr;
	}
}

void API_GameMode::LoadLevelByName(const FString& LevelName)
{
	UGameplayStatics::OpenLevel(GetWorld(), FName(*LevelName));
}

void API_GameMode::RestartCurrentRoom()
{
	bGameOver = false;
	if (CurrentLevelIndex < LevelConfigs.Num())
	{
		UGameplayStatics::OpenLevel(GetWorld(), LevelConfigs[CurrentLevelIndex].LevelName);
	}
}
