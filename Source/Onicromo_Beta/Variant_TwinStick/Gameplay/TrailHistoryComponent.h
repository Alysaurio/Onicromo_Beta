// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "TrailHistoryComponent.generated.h"

/**
 *  Records the path traveled by its owner actor so other actors can retrace it.
 *  Used by trailing pickups (e.g. a key that follows the player like a tail):
 *  each follower samples the recorded path a fixed distance behind the leader,
 *  which keeps chain spacing constant at any speed.
 */
UCLASS(ClassGroup=(Custom), meta=(BlueprintSpawnableComponent))
class ONICROMO_BETA_API UTrailHistoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:

	UTrailHistoryComponent();

	/** Minimum distance between recorded path points, in cm */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Trail", meta=(ClampMin="1.0"))
	float PointSpacing = 30.0f;

	/** Maximum length of the recorded path, in cm. Grows automatically when a follower needs more */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Trail", meta=(ClampMin="100.0"))
	float MaxTrailLength = 3000.0f;

	/** If the owner moves further than this in a single tick, the path is treated as a teleport and restarted, in cm */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Trail", meta=(ClampMin="0.0"))
	float TeleportDistanceThreshold = 1500.0f;

	/** Registers a follower and returns its chain index (0 = closest to the leader) */
	UFUNCTION(BlueprintCallable, Category="Trail")
	int32 RegisterFollower(AActor* Follower);

	/** Removes a follower; the remaining followers are renumbered automatically */
	UFUNCTION(BlueprintCallable, Category="Trail")
	void UnregisterFollower(AActor* Follower);

	/** Returns the current chain index of a follower, or INDEX_NONE if it isn't registered */
	UFUNCTION(BlueprintCallable, Category="Trail")
	int32 GetFollowerIndex(AActor* Follower) const;

	/** Grows the maximum path length if needed so a follower at DistanceBehind always has room */
	UFUNCTION(BlueprintCallable, Category="Trail")
	void EnsureTrailLengthAtLeast(float DistanceBehind);

	/** Samples the recorded path: returns the location and direction found DistanceBehind cm away from the leader */
	UFUNCTION(BlueprintCallable, Category="Trail")
	bool GetLocationAlongTrail(float DistanceBehind, FVector& OutLocation, FVector& OutDirection) const;

protected:

	virtual void BeginPlay() override;

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Records the owner's current location, maintaining point spacing and max length */
	void RecordLocation(const FVector& Location);

	/** Path points, from the oldest (index 0) to the newest */
	TArray<FVector> PathPoints;

	/** Followers currently trailing the leader, from the closest to the farthest */
	TArray<TWeakObjectPtr<AActor>> Followers;

	/** Location of the last recorded path point */
	FVector LastRecordedLocation = FVector::ZeroVector;

	/** Total length in cm of the recorded path */
	float TrailLength = 0.0f;

	/** True once the first path point has been recorded */
	bool bHasRecordedLocation = false;
};
