// Copyright Epic Games, Inc. All Rights Reserved.

#include "OnicromoDamageComponent.h"
#include "Onicromo_Beta.h"
#include "Engine/DamageEvents.h"

UOnicromoDamageComponent::UOnicromoDamageComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
	Vida = 100.0f;
}

void UOnicromoDamageComponent::BeginPlay()
{
	Super::BeginPlay();

	// Enlazar al delegado de daño del actor owner
	AActor* Owner = GetOwner();
	if (Owner)
	{
		Owner->OnTakeAnyDamage.AddDynamic(this, &UOnicromoDamageComponent::HandleAnyDamage);
	}
}

void UOnicromoDamageComponent::HandleAnyDamage(AActor* DamagedActor, float Damage, const UDamageType* DamageType, AController* InstigatedBy, AActor* DamageCauser)
{
	if (Damage > 0.0f)
	{
		Vida -= Damage;

		if (Vida <= 0.0f)
		{
			GetOwner()->Destroy();
		}
	}
}
