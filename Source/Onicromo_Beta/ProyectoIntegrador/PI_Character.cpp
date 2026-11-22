// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_Character.h"
#include "ProyectoIntegradorTypes.h"
#include "PI_ShotCatalog.h"
#include "PI_Projectile.h"
#include "TwinStickProjectile.h"
#include "Kismet/KismetMathLibrary.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/ProjectileMovementComponent.h"
#include "EnhancedInputComponent.h"

API_Character::API_Character()
{
	PrimaryActorTick.bCanEverTick = true;

	// Configuración por defecto del movimiento twin-stick
	GetCharacterMovement()->MaxAcceleration = 1200.0f;
	GetCharacterMovement()->BrakingFrictionFactor = 1.5f;
	GetCharacterMovement()->RotationRate = FRotator(0.0f, 800.0f, 0.0f);
	GetCharacterMovement()->bConstrainToPlane = true;
	GetCharacterMovement()->bSnapToPlaneAtStart = true;
}

void API_Character::BeginPlay()
{
	Super::BeginPlay();

	// Asegurar vidas iniciales
	if (CurrentLives <= 0)
	{
		CurrentLives = MaxLives;
	}
}

void API_Character::EndPlay(EEndPlayReason::Type EndPlayReason)
{
	Super::EndPlay(EndPlayReason);

	GetWorld()->GetTimerManager().ClearTimer(InvulnerabilityTimer);
}

void API_Character::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	// Avanzar cadencia de disparo
	if (ShotCooldownTimer > 0.0f)
	{
		ShotCooldownTimer -= DeltaTime;
		if (ShotCooldownTimer < 0.0f)
		{
			ShotCooldownTimer = 0.0f;
		}
	}
}

void API_Character::TakePiDamage(float DamageAmount, const FVector& DamageDirection)
{
	if (bIsInvulnerable || IsDead())
	{
		return;
	}

	// Perder una vida
	--CurrentLives;
	bIsInvulnerable = true;

	// Activar temporizador de invulnerabilidad
	GetWorld()->GetTimerManager().SetTimer(
		InvulnerabilityTimer,
		this,
		&API_Character::EndInvulnerability,
		InvulnerabilityTime,
		false
	);

	// Notificar al BP para efectos de pantalla (viñeta / tinte rojo)
	BP_OnPiDamaged(CurrentLives, CurrentLives <= 1);

	// Knockback suave
	FVector LaunchVector = DamageDirection;
	LaunchVector.Z = 0.0f;
	LaunchCharacter(LaunchVector * 1500.0f, true, true);

	if (IsDead())
	{
		HandlePlayerDeath();
	}
}

void API_Character::EndInvulnerability()
{
	bIsInvulnerable = false;
}

void API_Character::HandlePlayerDeath()
{
	// Derrota: el GameMode gestionará el reinicio de nivel/sala
	if (GetWorld())
	{
		UE_LOG(LogOnicromo_Beta, Log, TEXT("API_Character: jugador sin vidas. Notificando derrota al GameMode."));
	}
}

bool API_Character::CanShoot() const
{
	return ShotCooldownTimer <= 0.0f && !IsDead();
}

void API_Character::ShootWithCurrentType()
{
	if (!CanShoot())
	{
		return;
	}

	if (!ShotCatalog)
	{
		// Fallback al disparo base si no hay catálogo
		DoShoot();
		return;
	}

	FIShotConfig Config = UPI_ShotCatalog::GetConfigFor(ShotCatalog, CurrentShotType);
	if (!Config.ProjectileClass)
	{
		DoShoot();
		return;
	}

	// Aplicar cadencia del tipo de disparo
	ShotCooldownTimer = Config.FireRate;

	// Transform base
	FTransform SpawnTransform = GetActorTransform();
	FVector Forward = SpawnTransform.GetRotation().GetForwardVector();
	FVector Location = SpawnTransform.GetLocation() + Forward * 100.0f;

	// Disparar según el tipo
	int32 Pellets = FMath::Clamp(Config.PelletCount, 1, 12);
	float Spread = FMath::DegreesToRadians(Config.SpreadDegrees);

	for (int32 i = 0; i < Pellets; ++i)
	{
		FVector Dir = Forward;
		if (Pellets > 1)
		{
			// Distribuir pallets en abanico centrado
			float Offset = (i - (Pellets - 1) * 0.5f) * (Spread / FMath::Max(1, Pellets - 1));
			FRotator Rot(0.0f, Offset, 0.0f);
			Dir = Rot.RotateVector(Forward);
		}

		FTransform PelletTransform(Dir.Rotation(), Location, FVector::OneVector);
		ATwinStickProjectile* Projectile = GetWorld()->SpawnActor<ATwinStickProjectile>(Config.ProjectileClass, PelletTransform);
		if (Projectile)
		{
			if (API_Projectile* PiProj = Cast<API_Projectile>(Projectile))
			{
				PiProj->ConfigureFromShot(Config, this);
			}

			// Asegurar velocidad y dirección de vuelo del proyectil
			if (UProjectileMovementComponent* MoveComp = Projectile->FindComponentByClass<UProjectileMovementComponent>())
			{
				MoveComp->Velocity = Dir * Config.ProjectileSpeed;
				MoveComp->ProjectileGravityScale = 0.0f;
			}
		}
	}
}

void API_Character::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	if (UEnhancedInputComponent* EnhancedInputComponent = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (ShootAction)
		{
			EnhancedInputComponent->BindAction(ShootAction, ETriggerEvent::Triggered, this, &API_Character::ShootCustom);
		}
	}
}

void API_Character::ShootCustom()
{
	ShootWithCurrentType();
}
