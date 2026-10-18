// Copyright Epic Games, Inc. All Rights Reserved.


#include "TrailHistoryComponent.h"
#include "GameFramework/Actor.h"

UTrailHistoryComponent::UTrailHistoryComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
}

void UTrailHistoryComponent::BeginPlay()
{
	Super::BeginPlay();

	// record the starting location so the trail exists even if the leader never moves
	if (const AActor* Owner = GetOwner())
	{
		LastRecordedLocation = Owner->GetActorLocation();
		PathPoints.Add(LastRecordedLocation);
		bHasRecordedLocation = true;
	}
}

void UTrailHistoryComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (const AActor* Owner = GetOwner())
	{
		RecordLocation(Owner->GetActorLocation());
	}
}

void UTrailHistoryComponent::RecordLocation(const FVector& Location)
{
	if (!bHasRecordedLocation)
	{
		LastRecordedLocation = Location;
		PathPoints.Add(Location);
		bHasRecordedLocation = true;
		return;
	}

	const float Distance = FVector::Dist(Location, LastRecordedLocation);

	// a huge jump is probably a teleport: start the path over
	if (Distance > TeleportDistanceThreshold)
	{
		PathPoints.Reset();
		TrailLength = 0.0f;
		PathPoints.Add(Location);
		LastRecordedLocation = Location;
		return;
	}

	// only store a new point once the leader has moved far enough from the last one
	if (Distance < PointSpacing)
	{
		return;
	}

	PathPoints.Add(Location);
	TrailLength += Distance;
	LastRecordedLocation = Location;

	// drop the oldest points once the path is longer than needed
	while (PathPoints.Num() > 1 && TrailLength > MaxTrailLength)
	{
		TrailLength -= FVector::Dist(PathPoints[0], PathPoints[1]);
		PathPoints.RemoveAt(0);
	}
}

int32 UTrailHistoryComponent::RegisterFollower(AActor* Follower)
{
	if (!Follower)
	{
		return INDEX_NONE;
	}

	// discard any followers that were destroyed without unregistering
	Followers.RemoveAll([](const TWeakObjectPtr<AActor>& Candidate)
	{
		return !Candidate.IsValid();
	});

	// already registered? return the existing index
	for (int32 Index = 0; Index < Followers.Num(); ++Index)
	{
		if (Followers[Index].Get() == Follower)
		{
			return Index;
		}
	}

	// new followers take the last slot in the chain
	Followers.Add(Follower);
	return Followers.Num() - 1;
}

void UTrailHistoryComponent::UnregisterFollower(AActor* Follower)
{
	Followers.RemoveAll([Follower](const TWeakObjectPtr<AActor>& Candidate)
	{
		return Candidate.Get() == Follower;
	});
}

int32 UTrailHistoryComponent::GetFollowerIndex(AActor* Follower) const
{
	for (int32 Index = 0; Index < Followers.Num(); ++Index)
	{
		if (Followers[Index].Get() == Follower)
		{
			return Index;
		}
	}

	return INDEX_NONE;
}

void UTrailHistoryComponent::EnsureTrailLengthAtLeast(float DistanceBehind)
{
	MaxTrailLength = FMath::Max(MaxTrailLength, DistanceBehind + PointSpacing * 2.0f);
}

bool UTrailHistoryComponent::GetLocationAlongTrail(float DistanceBehind, FVector& OutLocation, FVector& OutDirection) const
{
	const AActor* Owner = GetOwner();
	if (!Owner)
	{
		return false;
	}

	const FVector Head = Owner->GetActorLocation();

	if (PathPoints.Num() == 0)
	{
		OutLocation = Head;
		OutDirection = Owner->GetActorForwardVector();
		return true;
	}

	// walk the path from the newest point backwards until the requested distance is covered
	float Remaining = FMath::Max(DistanceBehind, 0.0f);
	FVector Previous = Head;

	for (int32 Index = PathPoints.Num() - 1; Index >= 0; --Index)
	{
		const FVector& Point = PathPoints[Index];
		const float SegmentLength = FVector::Dist(Previous, Point);

		if (SegmentLength >= Remaining)
		{
			const float Alpha = SegmentLength > UE_KINDA_SMALL_NUMBER ? Remaining / SegmentLength : 0.0f;
			OutLocation = FMath::Lerp(Previous, Point, Alpha);
			OutDirection = (Point - Previous).GetSafeNormal();
			return true;
		}

		Remaining -= SegmentLength;
		Previous = Point;
	}

	// the requested distance is longer than the path: clamp to the oldest point
	OutLocation = PathPoints[0];
	OutDirection = PathPoints.Num() > 1
		? (PathPoints[1] - PathPoints[0]).GetSafeNormal()
		: Owner->GetActorForwardVector();
	return true;
}
