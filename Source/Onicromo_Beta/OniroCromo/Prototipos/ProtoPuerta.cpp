// Copyright Epic Games, Inc. All Rights Reserved.

#include "ProtoPuerta.h"
#include "ProtoUtils.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"

AProtoPuerta::AProtoPuerta()
{
	PrimaryActorTick.bCanEverTick = true;

	// malla-raíz: cubo del motor escalado como puerta (bloquea al jugador)
	Malla = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Malla"));
	RootComponent = Malla;
	Malla->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Malla->SetRelativeScale3D(FVector(2.0f, 0.5f, 3.0f));
	Malla->SetCollisionProfileName(TEXT("BlockAll"));

	DistanciaApertura = 300.0f;
	VelocidadDesplazamiento = 400.0f;
}

void AProtoPuerta::BeginPlay()
{
	Super::BeginPlay();

	// capturar posiciones cerrada/abierta al iniciar
	PosicionCerrada = GetActorLocation();
	PosicionAbierta = PosicionCerrada + FVector(0.0f, 0.0f, DistanciaApertura);
}

void AProtoPuerta::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	const FVector Objetivo = bAbierta ? PosicionAbierta : PosicionCerrada;
	const FVector Actual = GetActorLocation();

	if (!Actual.Equals(Objetivo, 0.5f))
	{
		SetActorLocation(FMath::VInterpConstantTo(Actual, Objetivo, DeltaSeconds, VelocidadDesplazamiento));
	}
}

void AProtoPuerta::Abrir()
{
	if (!bAbierta)
	{
		bAbierta = true;
		ProtoPrint(TEXT("▲ Puerta abierta"), FColor::Green);
	}
}

void AProtoPuerta::Cerrar()
{
	if (bAbierta)
	{
		bAbierta = false;
		ProtoPrint(TEXT("▼ Puerta cerrada"), FColor::Orange);
	}
}
