// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "ProyectoIntegradorTypes.h"
#include "PI_ShotCatalog.generated.h"

/**
 * DataAsset que alberga el catálogo de los 10 tipos de disparo y su configuración.
 * Se crea como asset en /Game/ProyectoIntegrador/Data/DA_PI_ShotCatalog
 */
UCLASS()
class ONICROMO_BETA_API UPI_ShotCatalog : public UDataAsset
{
	GENERATED_BODY()

public:

	/** Configuración de cada uno de los 10 tipos de disparo (índice = valor de EPiShotType) */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Shots", meta = (DisplayName = "Catálogo de disparos"))
	TArray<FIShotConfig> ShotConfigs;

	/** Devuelve la configuración para un tipo de disparo dado (por valor) */
	UFUNCTION(BlueprintCallable, Category = "Shots")
	static FIShotConfig GetConfigFor(UPI_ShotCatalog* Catalog, EPiShotType ShotType);
};
