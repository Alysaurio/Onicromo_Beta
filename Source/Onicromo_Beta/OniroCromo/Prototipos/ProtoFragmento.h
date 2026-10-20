// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProtoFragmento.generated.h"

class UStaticMeshComponent;
class USphereComponent;
class APawn;

/**
 * Prototipo de colisión 2/3 de OniroCromo (GDD: Sistema "Recolección de Fragmentos").
 * Al tocarlo con el jugador NO se consume: se pega a la mano (Attach) y lo llevas
 * puesto. Pulsa E para soltarlo en el suelo. (GDD: "no basta tocarlo, hay que
 * llevarlo en mano"; ocupa las manos mientras lo llevas).
 * Tipo de colisión: OVERLAP (pickup) + Attach al colisionar.
 */
UCLASS()
class ONICROMO_BETA_API AProtoFragmento : public AActor
{
	GENERATED_BODY()

public:
	AProtoFragmento();

	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void NotifyActorBeginOverlap(AActor* OtherActor) override;

	/** Malla del fragmento */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	UStaticMeshComponent* Malla;

	/** Esfera de detección del pickup (overlap) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	USphereComponent* Deteccion;

private:
	/** Se pega a la mano del jugador */
	void Recoger(APawn* Jugador);

	/** Se suelta en el suelo donde está */
	void Soltar();

	/** true mientras el fragmento está en la mano */
	bool bLlevado = false;

	/** Estado anterior de la tecla E (detector de flanco) */
	bool bTeclaEAntes = false;

	/** Pawn que lo lleva (débil: no impide su recolección/garbage collection) */
	TWeakObjectPtr<APawn> Portador;
};
