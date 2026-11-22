// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "TwinStickPickup.h"
#include "PI_Key.generated.h"

class API_Character;

/**
 * Llave de ProyectoIntegrador.
 * Al ser recogida por el jugador no se destruye: le sigue como una cola (estilo Binding of Isaac).
 * Permite abrir puertas. Cuando el jugador llega a la puerta con la llave, la puerta se abre.
 */
UCLASS()
class ONICROMO_BETA_API API_Key : public ATwinStickPickup
{
	GENERATED_BODY()

public:

	API_Key();

protected:

	virtual void BeginPlay() override;
	virtual void NotifyActorBeginOverlap(AActor* OtherActor) override;

public:

	/** Si la llave ya fue recogida por el jugador */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Key")
	bool bIsHeld = false;

	/** Referencia al jugador que porta la llave */
	UPROPERTY(BlueprintReadOnly, Category = "PI|Key")
	TObjectPtr<API_Character> Holder;

	/** Entrega la llave al jugador (la hace seguirle) */
	UFUNCTION(BlueprintCallable, Category = "PI|Key")
	void GiveToPlayer(API_Character* NewHolder);

	/** Devuelve true si la llave está siendo portada por un jugador */
	UFUNCTION(BlueprintCallable, Category = "PI|Key")
	bool IsHeld() const { return bIsHeld; }
};
