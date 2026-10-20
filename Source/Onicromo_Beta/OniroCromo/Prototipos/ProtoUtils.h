// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Engine/Engine.h"

DECLARE_LOG_CATEGORY_EXTERN(LogOniroProto, Log, All);

/**
 * Feedback de los prototipos de colisión de OniroCromo.
 * Equivalente al nodo "Print" del laboratorio: imprime en pantalla y en el log.
 * (Solo en prototipado; en producción de juego usar el sistema de logging y UI propio.)
 */
FORCEINLINE void ProtoPrint(const FString& Mensaje, const FColor& Color = FColor::White)
{
	UE_LOG(LogOniroProto, Log, TEXT("%s"), *Mensaje);

	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 4.0f, Color, Mensaje);
	}
}
