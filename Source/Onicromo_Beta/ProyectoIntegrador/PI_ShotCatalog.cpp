// Copyright Epic Games, Inc. All Rights Reserved.


#include "PI_ShotCatalog.h"

FIShotConfig UPI_ShotCatalog::GetConfigFor(UPI_ShotCatalog* Catalog, EPiShotType ShotType)
{
	FIShotConfig EmptyConfig;

	if (!Catalog)
	{
		return EmptyConfig;
	}

	int32 Index = (int8)ShotType;
	if (Index < 0 || Index >= Catalog->ShotConfigs.Num())
	{
		return EmptyConfig;
	}

	return Catalog->ShotConfigs[Index];
}
