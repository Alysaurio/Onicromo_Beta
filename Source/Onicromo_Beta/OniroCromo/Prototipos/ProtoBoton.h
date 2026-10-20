// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProtoBoton.generated.h"

class UStaticMeshComponent;
class UBoxComponent;
class AProtoPuerta;

/**
 * Prototipo de colisión 1/3 de OniroCromo (GDD: Sistema "Botones de Presión").
 * Placa de presión: al pisarla (jugador O bloque con tag "Bloque") abre la puerta
 * enlazada; al liberarse por completo, la vuelve a cerrar.
 * Tipo de colisión: OVERLAP (trigger de detección en el suelo).
 */
UCLASS()
class ONICROMO_BETA_API AProtoBoton : public AActor
{
	GENERATED_BODY()

public:
	AProtoBoton();

protected:
	virtual void NotifyActorBeginOverlap(AActor* OtherActor) override;
	virtual void NotifyActorEndOverlap(AActor* OtherActor) override;

	/** Puerta que controla este botón */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Boton")
	AProtoPuerta* Puerta;

	/** Placa visual del botón */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	UStaticMeshComponent* Placa;

	/** Caja de detección de la pisada (overlap) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	UBoxComponent* CajaDeteccion;

private:
	/** ¿Este actor pesa sobre la placa? (cualquier pawn o bloque con tag "Bloque") */
	bool EsPresionador(AActor* Actor) const;

	/** Nº de presionadores actualmente sobre la placa */
	int32 Presionadores = 0;

	/** Estado actual de la placa */
	bool bPulsado = false;
};
