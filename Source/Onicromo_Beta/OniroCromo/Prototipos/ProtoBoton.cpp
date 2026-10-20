// Copyright Epic Games, Inc. All Rights Reserved.

#include "ProtoBoton.h"
#include "ProtoPuerta.h"
#include "ProtoUtils.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"

DEFINE_LOG_CATEGORY(LogOniroProto);

AProtoBoton::AProtoBoton()
{
	PrimaryActorTick.bCanEverTick = false;

	// placa visual (raíz): cubo achatado en el suelo
	Placa = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Placa"));
	RootComponent = Placa;
	Placa->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Placa->SetRelativeScale3D(FVector(1.5f, 1.5f, 0.1f));
	Placa->SetCollisionProfileName(TEXT("BlockAllDynamic"));

	// caja de detección: overlap puro, un poco por encima de la placa
	CajaDeteccion = CreateDefaultSubobject<UBoxComponent>(TEXT("CajaDeteccion"));
	CajaDeteccion->SetupAttachment(RootComponent);
	CajaDeteccion->SetRelativeLocation(FVector(0.0f, 0.0f, 40.0f));
	CajaDeteccion->SetBoxExtent(FVector(80.0f, 80.0f, 40.0f));
	CajaDeteccion->SetCollisionProfileName(TEXT("OverlapAll"));
	CajaDeteccion->SetGenerateOverlapEvents(true);

	Puerta = nullptr;
}

bool AProtoBoton::EsPresionador(AActor* Actor) const
{
	if (!Actor || Actor == this)
	{
		return false;
	}

	// cualquier pawn (el jugador) o cualquier bloque empujable (tag "Bloque")
	return Cast<APawn>(Actor) != nullptr || Actor->ActorHasTag(FName(TEXT("Bloque")));
}

void AProtoBoton::NotifyActorBeginOverlap(AActor* OtherActor)
{
	Super::NotifyActorBeginOverlap(OtherActor);

	if (!EsPresionador(OtherActor))
	{
		return;
	}

	Presionadores++;

	if (!bPulsado)
	{
		bPulsado = true;
		ProtoPrint(TEXT("▲ Botón pisado: la puerta se abre"), FColor::Red);

		if (Puerta)
		{
			Puerta->Abrir();
		}
	}
}

void AProtoBoton::NotifyActorEndOverlap(AActor* OtherActor)
{
	Super::NotifyActorEndOverlap(OtherActor);

	if (!EsPresionador(OtherActor))
	{
		return;
	}

	Presionadores = FMath::Max(0, Presionadores - 1);

	if (Presionadores == 0 && bPulsado)
	{
		bPulsado = false;
		ProtoPrint(TEXT("▼ Botón liberado: la puerta se cierra"), FColor::Orange);

		if (Puerta)
		{
			Puerta->Cerrar();
		}
	}
}
