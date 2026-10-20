// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProtoBloque.generated.h"

class UStaticMeshComponent;

/**
 * Prototipo de colisión 3/3 de OniroCromo (GDD: Sistema "Bloques Empujables").
 * Bloque-lápiz gigante: al caminar contra él (colisión de bloqueo) se desliza
 * suavemente en la dirección del empuje. Lleva el tag "Bloque" para que lo
 * reconozca el AProtoBoton (peso permanente sobre la placa).
 * Tipo de colisión: BLOCK + HIT (colisión física que notifica el impacto).
 */
UCLASS()
class ONICROMO_BETA_API AProtoBloque : public AActor
{
	GENERATED_BODY()

public:
	AProtoBloque();

	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp,
		bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse,
		const FHitResult& Hit) override;

	/** Malla del bloque (cubo del motor) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Componentes")
	UStaticMeshComponent* Malla;

	/** Distancia que desliza cada empuje, en cm (1 casilla) */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Bloque", meta = (ClampMin = 10, ClampMax = 1000, Units = "cm"))
	float DistanciaDeslizamiento;

	/** Velocidad del deslizamiento, en cm/s */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Bloque", meta = (ClampMin = 50, ClampMax = 5000, Units = "cm/s"))
	float VelocidadDeslizamiento;

private:
	/** Posición a la que se está deslizando */
	FVector PosicionObjetivo = FVector::ZeroVector;

	/** true mientras está deslizándose hacia el objetivo */
	bool bDeslizando = false;

	/** Momento (segundos de mundo) del último empuje, para evitar re-empujes continuos */
	float TiempoUltimoEmpuje = -1000.0f;
};
