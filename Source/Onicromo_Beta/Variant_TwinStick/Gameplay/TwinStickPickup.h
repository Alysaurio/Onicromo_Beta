// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "TwinStickPickup.generated.h"

class USphereComponent;
class UStaticMeshComponent;
class UTrailHistoryComponent;
class ATwinStickCharacter;

/**
 *  A simple pickup for a Twin Stick Shooter game
 *  When "Follows Player" is enabled the pickup isn't consumed on overlap:
 *  it starts trailing the player, retraceing the character's path like a tail.
 *  Every new pickup joins the end of the chain, so collected keys string out
 *  behind the player one after another (like the key pieces in The Binding of Isaac).
 */
UCLASS(abstract)
class ATwinStickPickup : public AActor
{
	GENERATED_BODY()

	/** Pickup collision sphere */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	USphereComponent* CollisionSphere;

	/** Provides visual representation for the pickup */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	UStaticMeshComponent* Mesh;

public:	

	/** Constructor */
	ATwinStickPickup();

	/** Collision handling */
	virtual void NotifyActorBeginOverlap(AActor* OtherActor) override;

	/** Gameplay cleanup */
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	/** Updates the trailing movement */
	virtual void Tick(float DeltaTime) override;

protected:

	/** If true the pickup isn't consumed on overlap: it starts trailing the player as part of a chain */
	UPROPERTY(EditAnywhere, Category = "Follow")
	bool bFollowsPlayer = false;

	/** Distance between the leader and the first follower in the chain, in cm */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.0"))
	float FollowDistance = 120.0f;

	/** Extra distance added for each follower index, in cm */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "10.0"))
	float ChainSpacing = 100.0f;

	/** Speed of the position interpolation: higher values make the follower stick tighter */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.1"))
	float FollowInterpSpeed = 6.0f;

	/** Speed of the rotation interpolation */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.1"))
	float RotationInterpSpeed = 5.0f;

	/** If true the follower yaws to face its movement direction */
	UPROPERTY(EditAnywhere, Category = "Follow")
	bool bOrientToMovement = true;

	/** Horizontal serpentine sway amplitude, in cm */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.0"))
	float SwayAmplitude = 40.0f;

	/** Horizontal serpentine sway frequency, in cycles per second */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.0"))
	float SwayFrequency = 1.2f;

	/** Vertical bob amplitude, in cm */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.0"))
	float BobAmplitude = 20.0f;

	/** Vertical bob frequency, in cycles per second */
	UPROPERTY(EditAnywhere, Category = "Follow", meta = (ClampMin = "0.0"))
	float BobFrequency = 1.8f;

	/** Height offset added to the trail target, so you can align the mesh with the leader, in cm */
	UPROPERTY(EditAnywhere, Category = "Follow")
	float FollowHeightOffset = 0.0f;

	/** The trail component of the leader being followed */
	UPROPERTY(Transient)
	TObjectPtr<UTrailHistoryComponent> FollowedTrail;

	/** Phase offset so chained followers don't sway in sync */
	float SwayPhase = 0.0f;

	/** Starts trailing the given path recorder, taking the last slot in its chain */
	void StartFollowing(UTrailHistoryComponent* InTrail);

	/** Moves the pickup along the leader's trail */
	void UpdateFollow(float DeltaTime);

	/** Consumes the pickup the old way: gives it to the player and destroys it */
	void Collect(ATwinStickCharacter* PlayerCharacter);
};
