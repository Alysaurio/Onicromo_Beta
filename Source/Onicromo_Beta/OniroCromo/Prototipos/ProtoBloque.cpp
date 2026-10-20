// Copyright Epic Games, Inc. All Rights Reserved.

#include "ProtoBloque.h"
#include "ProtoUtils.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"

AProtoBloque::AProtoBloque()
{
	PrimaryActorTick.bCanEverTick = true;

	// malla-raíz: cubo del motor como bloque-lápiz (colisión de bloqueo total)
	Malla = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Malla"));
	RootComponent = Malla;
	Malla->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Malla->SetRelativeScale3D(FVector(1.6f, 1.6f, 1.6f));
	Malla->SetCollisionProfileName(TEXT("BlockAll"));

	// tag para que el AProtoBoton lo reconozca como peso
	Tags.Add(FName(TEXT("Bloque")));

	DistanciaDeslizamiento = 150.0f;
	VelocidadDeslizamiento = 600.0f;
}

void AProtoBloque::NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp,
	bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse,
	const FHitResult& Hit)
{
	Super::NotifyHit(MyComp, Other, OtherComp, bSelfMoved, HitLocation, HitNormal, NormalImpulse, Hit);

	// solo el jugador (pawn) lo empuja, y con cadencia para no re-empujar en cada frame de contacto
	APawn* Jugador = Cast<APawn>(Other);

	if (!Jugador || bDeslizando)
	{
		return;
	}

	const float TiempoAhora = GetWorld()->GetTimeSeconds();

	if (TiempoAhora - TiempoUltimoEmpuje < 0.4f)
	{
		return;
	}

	// dirección alejándose del jugador (plano XY)
	const FVector Direccion = (GetActorLocation() - Other->GetActorLocation()).GetSafeNormal2D();

	if (Direccion.IsNearlyZero(0.01f))
	{
		return;
	}

	TiempoUltimoEmpuje = TiempoAhora;
	PosicionObjetivo = GetActorLocation() + Direccion * DistanciaDeslizamiento;
	bDeslizando = true;

	ProtoPrint(TEXT("▰ Bloque-lápiz empujado"), FColor::Green);
}

void AProtoBloque::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bDeslizando)
	{
		return;
	}

	const FVector Actual = GetActorLocation();

	if (Actual.Equals(PosicionObjetivo, 0.5f))
	{
		bDeslizando = false;
		return;
	}

	SetActorLocation(FMath::VInterpConstantTo(Actual, PosicionObjetivo, DeltaSeconds, VelocidadDeslizamiento));
}
