// Copyright Epic Games, Inc. All Rights Reserved.

#include "Onicromo_BetaCharacter.h"
#include "Onicromo_Beta.h"
#include "UObject/ConstructorHelpers.h"
#include "Camera/CameraComponent.h"
#include "Components/DecalComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Materials/Material.h"
#include "Engine/World.h"
#include "Engine/DamageEvents.h"
#include "UObject/Class.h"
#include "UObject/UnrealType.h"

AOnicromo_BetaCharacter::AOnicromo_BetaCharacter()
{
	// Set size for player capsule
	GetCapsuleComponent()->InitCapsuleSize(42.f, 96.0f);

	// Don't rotate character to camera direction
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	// Configure character movement
	GetCharacterMovement()->bOrientRotationToMovement = true;
	GetCharacterMovement()->RotationRate = FRotator(0.f, 640.f, 0.f);
	GetCharacterMovement()->bConstrainToPlane = true;
	GetCharacterMovement()->bSnapToPlaneAtStart = true;

	// Default speeds (tunable from BP/Defaults)
	WalkSpeed = 400.f;
	RunSpeed = 800.f;
	GetCharacterMovement()->MaxWalkSpeed = WalkSpeed;

	// Run state
	bIsRunning = false;

	// Create the camera boom component
	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));

	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->SetUsingAbsoluteRotation(true);
	CameraBoom->TargetArmLength = 800.f;
	CameraBoom->SetRelativeRotation(FRotator(-60.f, 0.f, 0.f));
	CameraBoom->bDoCollisionTest = false;

	// Create the camera component
	TopDownCameraComponent = CreateDefaultSubobject<UCameraComponent>(TEXT("TopDownCamera"));

	TopDownCameraComponent->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	TopDownCameraComponent->bUsePawnControlRotation = false;

	// Activate ticking in order to update movement speed every frame.
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = true;
}

void AOnicromo_BetaCharacter::BeginPlay()
{
	Super::BeginPlay();
}

void AOnicromo_BetaCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Update walk speed based on run state
	if (GetCharacterMovement())
	{
		GetCharacterMovement()->MaxWalkSpeed = bIsRunning ? RunSpeed : WalkSpeed;
	}
}

void AOnicromo_BetaCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	// WASD movement axes
	PlayerInputComponent->BindAxis("MoveForward", this, &AOnicromo_BetaCharacter::MoveForward);
	PlayerInputComponent->BindAxis("MoveRight", this, &AOnicromo_BetaCharacter::MoveRight);

	// Shift to run
	PlayerInputComponent->BindAction("Run", IE_Pressed, this, &AOnicromo_BetaCharacter::StartRun);
	PlayerInputComponent->BindAction("Run", IE_Released, this, &AOnicromo_BetaCharacter::StopRun);
}

void AOnicromo_BetaCharacter::MoveForward(float Value)
{
	if (Value != 0.0f)
	{
		const FRotator Rotation = Controller->GetControlRotation();
		const FRotator YawRotation(0.f, Rotation.Yaw, 0.f);
		const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
		AddMovementInput(Direction, Value);
	}
}

void AOnicromo_BetaCharacter::MoveRight(float Value)
{
	if (Value != 0.0f)
	{
		const FRotator Rotation = Controller->GetControlRotation();
		const FRotator YawRotation(0.f, Rotation.Yaw, 0.f);
		const FVector Direction = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);
		AddMovementInput(Direction, Value);
	}
}

void AOnicromo_BetaCharacter::StartRun()
{
	bIsRunning = true;
}

void AOnicromo_BetaCharacter::StopRun()
{
	bIsRunning = false;
}

float AOnicromo_BetaCharacter::TakeDamage(float DamageAmount, const FDamageEvent& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	const float ActualDamage = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);

	if (ActualDamage > 0.0f)
	{
		// "Vida" is a Blueprint member variable (float, default 100) defined on the derived pawn
		if (FFloatProperty* VidaProperty = CastField<FFloatProperty>(GetClass()->FindPropertyByName(TEXT("Vida"))))
		{
			float Vida = VidaProperty->GetPropertyValue_InContainer(this);
			Vida -= ActualDamage;
			VidaProperty->SetPropertyValue_InContainer(this, Vida);

			if (Vida <= 0.0f)
			{
				Destroy();
			}
		}
	}

	return ActualDamage;
}
