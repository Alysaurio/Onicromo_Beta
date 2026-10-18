// Copyright Epic Games, Inc. All Rights Reserved.


#include "TwinStickPickup.h"
#include "Components/SceneComponent.h"
#include "Components/SphereComponent.h"
#include "TwinStickCharacter.h"
#include "Components/StaticMeshComponent.h"
#include "TrailHistoryComponent.h"
#include "Engine/World.h"

ATwinStickPickup::ATwinStickPickup()
{
 	PrimaryActorTick.bCanEverTick = true;

	// followers are moved in code: only tick once the pickup has been collected
	PrimaryActorTick.bStartWithTickEnabled = false;

	// create the root component
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));

	// create the collision sphere
	CollisionSphere = CreateDefaultSubobject<USphereComponent>(TEXT("Collision Sphere"));
	CollisionSphere->SetupAttachment(RootComponent);

	CollisionSphere->SetSphereRadius(100.0f);
	CollisionSphere->SetRelativeLocation(FVector(0.0f, 0.0f, 125.0f));
	CollisionSphere->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	CollisionSphere->SetCollisionObjectType(ECC_WorldDynamic);
	CollisionSphere->SetCollisionResponseToAllChannels(ECR_Ignore);
	CollisionSphere->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

	// create the mesh
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(CollisionSphere);

	Mesh->SetCollisionProfileName(FName("NoCollision"));

}

void ATwinStickPickup::NotifyActorBeginOverlap(AActor* OtherActor)
{
	Super::NotifyActorBeginOverlap(OtherActor);

	// have we overlapped the player character?
	if (ATwinStickCharacter* PlayerCharacter = Cast<ATwinStickCharacter>(OtherActor))
	{
		// trail pickups become followers instead of being consumed
		if (bFollowsPlayer)
		{
			StartFollowing(PlayerCharacter);
			return;
		}

		Collect(PlayerCharacter);
	}
}

void ATwinStickPickup::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	// leave our slot in the chain so the other followers are renumbered
	if (FollowedTrail)
	{
		FollowedTrail->UnregisterFollower(this);
		FollowedTrail = nullptr;
	}

	Super::EndPlay(EndPlayReason);
}

void ATwinStickPickup::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (FollowedTrail)
	{
		UpdateFollow(DeltaTime);
	}
}

void ATwinStickPickup::Collect(ATwinStickCharacter* PlayerCharacter)
{
	// give the pickup to the player
	PlayerCharacter->AddPickup();

	// destroy this pickup
	Destroy();
}

void ATwinStickPickup::StartFollowing(ATwinStickCharacter* PlayerCharacter)
{
	// already following? ignore the extra overlap
	if (FollowedTrail)
	{
		return;
	}

	FollowedTrail = PlayerCharacter->GetTrailComponent();

	// no trail available: keep the old behavior
	if (!FollowedTrail)
	{
		Collect(PlayerCharacter);
		return;
	}

	// stop generating overlap events
	CollisionSphere->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	// take our place at the end of the chain
	const int32 ChainIndex = FollowedTrail->RegisterFollower(this);

	// give each follower a different sway phase so the chain ripples
	SwayPhase = 2.0f * PI * (float)ChainIndex / 4.0f;

	// make sure the recorded path is long enough for our slot in the chain
	FollowedTrail->EnsureTrailLengthAtLeast(FollowDistance + ChainIndex * ChainSpacing + 200.0f);

	// start moving
	SetActorTickEnabled(true);
}

void ATwinStickPickup::UpdateFollow(float DeltaTime)
{
	const int32 ChainIndex = FollowedTrail->GetFollowerIndex(this);

	// the trail is gone: stop moving
	if (ChainIndex == INDEX_NONE)
	{
		FollowedTrail = nullptr;
		SetActorTickEnabled(false);
		return;
	}

	// find our slot along the leader's path
	FVector TargetLocation;
	FVector PathDirection;
	FollowedTrail->GetLocationAlongTrail(FollowDistance + ChainIndex * ChainSpacing, TargetLocation, PathDirection);

	// sway side to side along the path so the chain snakes like a tail
	const float Time = GetWorld()->GetTimeSeconds();

	if (!PathDirection.IsNearlyZero())
	{
		const FVector SwayDirection = FVector::CrossProduct(FVector::UpVector, PathDirection).GetSafeNormal();
		TargetLocation += SwayDirection * (SwayAmplitude * FMath::Sin(Time * SwayFrequency * 2.0f * PI + SwayPhase));
	}

	// bob up and down for the floating effect
	TargetLocation.Z += BobAmplitude * FMath::Sin(Time * BobFrequency * 2.0f * PI + SwayPhase);

	// apply the height offset (use it to align the mesh with the leader)
	TargetLocation.Z += FollowHeightOffset;

	// slide smoothly towards the target
	const FVector OldLocation = GetActorLocation();
	const FVector NewLocation = FMath::VInterpTo(OldLocation, TargetLocation, DeltaTime, FollowInterpSpeed);
	SetActorLocation(NewLocation);

	// face the movement direction
	if (bOrientToMovement)
	{
		const FVector MoveDirection = NewLocation - OldLocation;

		if (!MoveDirection.IsNearlyZero(1.0f))
		{
			const FRotator TargetRotation(0.0f, MoveDirection.ToOrientationRotator().Yaw, 0.0f);
			SetActorRotation(FMath::RInterpTo(GetActorRotation(), TargetRotation, DeltaTime, RotationInterpSpeed));
		}
	}
}
