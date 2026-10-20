// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProtoPuerta.generated.h"

class UStaticMeshComponent;

/**
 * Prototipo de colisión 1/3 de OniroCromo (GDD: Sistema "Botones de Presión").
 * Puerta que se abre al ser pulsada por un AProtoBoton y se cierra al liberarse.
 * Tipo de colisión: bloqueo total (el jugador no puede atravesarla estando cerrada).
 */
UCLASS()
class ONICROMO_BETA_API AProtoPuerta : public AActor
{
	GENERATED_BODY()

public:
	AProtoPuerta();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** Abre la puerta (sube) de forma suave */
	void Abrir();

	/** Cierra la puerta (baja) de forma suave */
	void Cerrar();

protected:
	/** Malla de la puerta (cubo del motor escalado) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	UStaticMeshComponent* Malla;

	/** Distancia vertical de apertura, en cm */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Puerta", meta = (ClampMin = 0, ClampMax = 1000, Units = "cm"))
	float DistanciaApertura;

	/** Velocidad de desplazamiento, en cm/s */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Puerta", meta = (ClampMin = 50, ClampMax = 5000, Units = "cm/s"))
	float VelocidadDesplazamiento;

private:
	/** true = subiendo/abierta; false = bajando/cerrada */
	bool bAbierta = false;

	/** Posición de la puerta cerrada (capturada en BeginPlay) */
	FVector PosicionCerrada = FVector::ZeroVector;

	/** Posición objetivo al abrir */
	FVector PosicionAbierta = FVector::ZeroVector;
};
