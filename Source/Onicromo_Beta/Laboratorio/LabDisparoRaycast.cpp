// Copyright Epic Games, Inc. All Rights Reserved.

#include "LabDisparoRaycast.h"
#include "OniroCromo/Prototipos/ProtoUtils.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/PrimitiveComponent.h"
#include "Components/SceneComponent.h"
#include "Components/StaticMeshComponent.h"
#include "DrawDebugHelpers.h"
#include "Engine/HitResult.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"

ALabDisparoRaycast::ALabDisparoRaycast()
{
	PrimaryActorTick.bCanEverTick = true;

	// raíz sin escala: origen del armamento y de la rotación de apunte
	Origen = CreateDefaultSubobject<USceneComponent>(TEXT("Origen"));
	RootComponent = Origen;

	// cañón: cubo alargado sobre +X
	Armamento = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Armamento"));
	Armamento->SetupAttachment(Origen);
	Armamento->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Armamento->SetRelativeScale3D(FVector(1.4f, 0.25f, 0.25f));
	Armamento->SetCollisionProfileName(TEXT("BlockAllDynamic"));

	// salida del rayo, justo delante del cañón (sin escala: attach a Origen)
	PuntoMuzzle = CreateDefaultSubobject<USceneComponent>(TEXT("PuntoMuzzle"));
	PuntoMuzzle->SetupAttachment(Origen);
	PuntoMuzzle->SetRelativeLocation(FVector(80.0f, 0.0f, 0.0f));

	bDisparoAutomatico = true;
	CadenciaDisparo = 2.0f;
	Alcance = 10000.0f;
	FuerzaEmpuje = 3000.0f;
}

FVector ALabDisparoRaycast::ObtenerDireccionDisparo(const FVector& Inicio) const
{
	APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;

	if (PC)
	{
		FHitResult CursorHit;
		if (PC->GetHitResultUnderCursor(ECC_Visibility, false, CursorHit))
		{
			const FVector HaciaCursor = CursorHit.ImpactPoint - Inicio;
			if (!HaciaCursor.IsNearlyZero(1.0f))
			{
				return HaciaCursor.GetSafeNormal();
			}
		}
	}

	// fallback: hacia donde apunta el cañón
	return PuntoMuzzle->GetForwardVector();
}

void ALabDisparoRaycast::Disparar()
{
	TiempoUltimoDisparo = GetWorld()->GetTimeSeconds();

	const FVector Inicio = PuntoMuzzle->GetComponentLocation();
	const FVector Direccion = PuntoMuzzle->GetForwardVector(); // dispara hacia donde mira el cañón
	const FVector Fin = Inicio + Direccion * Alcance;

	FCollisionQueryParams Params(FName(TEXT("LabRaycast")), false /*bTraceComplex*/, this);
	Params.AddIgnoredActor(this);

	FHitResult Impacto;
	const bool bGolpe = GetWorld()->LineTraceSingleByChannel(Impacto, Inicio, Fin, ECC_Visibility, Params);

	// rayo visible del "disparo" (rojo, 0.5 s)
	const FVector PuntoFin = bGolpe ? Impacto.ImpactPoint : Fin;
	DrawDebugLine(GetWorld(), Inicio, PuntoFin, FColor::Red, false, 0.5f, 0.0f, 0.4f);

	if (!bGolpe)
	{
		ProtoPrint(TEXT("▶ Raycast: sin impacto (al alcance máximo)"), FColor::Red);
		return;
	}

	AActor* Golpeado = Impacto.GetActor();
	const float Distancia = FVector::Dist(Inicio, Impacto.ImpactPoint);
	ProtoPrint(FString::Printf(TEXT("▶ Raycast: %s a %.0f cm"),
		*GetNameSafe(Golpeado), Distancia), FColor::Red);

	// --- ejercicio 2: fuerza de empuje sobre el impactado ---
	if (FuerzaEmpuje <= 0.0f)
	{
		return;
	}

	UPrimitiveComponent* Componente = Impacto.GetComponent();
	if (!Componente)
	{
		return;
	}

	const bool bEmpujable = Componente->IsSimulatingPhysics() ||
		(Golpeado && Golpeado->ActorHasTag(FName(TEXT("Empujable"))));

	if (bEmpujable)
	{
		Componente->SetSimulatePhysics(true);
		Componente->WakeRigidBody();
		Componente->AddImpulseAtLocation(Direccion * FuerzaEmpuje, Impacto.ImpactPoint);
		ProtoPrint(FString::Printf(TEXT("⚡ Empuje aplicado a %s (%.0f)"),
			*GetNameSafe(Golpeado), FuerzaEmpuje), FColor::Yellow);
	}
	else
	{
		ProtoPrint(FString::Printf(TEXT("✖ %s: sin empuje (no es empujable)"),
			*GetNameSafe(Golpeado)), FColor::Orange);
	}
}

void ALabDisparoRaycast::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;

	if (!PC)
	{
		return;
	}

	// apunte al cursor: solo yaw (plano cenital)
	FHitResult CursorHit;
	if (PC->GetHitResultUnderCursor(ECC_Visibility, false, CursorHit))
	{
		const FVector HaciaCursor = CursorHit.ImpactPoint - PuntoMuzzle->GetComponentLocation();
		if (!HaciaCursor.IsNearlyZero(1.0f))
		{
			SetActorRotation(FRotator(0.0f, HaciaCursor.Rotation().Yaw, 0.0f));
		}
	}

	// disparo automático por cadencia
	if (bDisparoAutomatico && GetWorld()->GetTimeSeconds() - TiempoUltimoDisparo >= CadenciaDisparo)
	{
		Disparar();
	}

	// disparo con clic izquierdo (flanco de pulsación)
	const bool bClic = PC->IsInputKeyDown(EKeys::LeftMouseButton);
	if (bClic && !bClicAntes)
	{
		Disparar();
	}
	bClicAntes = bClic;
}
