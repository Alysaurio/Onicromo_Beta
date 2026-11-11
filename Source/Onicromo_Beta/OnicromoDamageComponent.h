// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "OnicromoDamageComponent.generated.h"

/**
 * Componente que gestiona la vida del player y su destrucción al recibir daño.
 * Se añade a BP_TopDownCharacter para evitar el reparenting de clase padre.
 */
UCLASS(ClassGroup = (Custom), meta = (BlueprintSpawnableComponent))
class UOnicromoDamageComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UOnicromoDamageComponent();

protected:
	virtual void BeginPlay() override;

	/** Delegado de daño recibido (enlazado a OnTakeAnyDamage del owner) */
	UFUNCTION()
	void HandleAnyDamage(AActor* DamagedActor, float Damage, const class UDamageType* DamageType, class AController* InstigatedBy, AActor* DamageCauser);

	/** Vida actual (float, default 100). Al llegar a <= 0 se destruye el owner. */
	UPROPERTY(EditAnywhere, Category = "Damage", meta = (ClampMin = "0"))
	float Vida;
};
