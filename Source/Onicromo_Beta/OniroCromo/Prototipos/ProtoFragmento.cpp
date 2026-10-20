// Copyright Epic Games, Inc. All Rights Reserved.

#include "ProtoFragmento.h"
#include "ProtoUtils.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"

AProtoFragmento::AProtoFragmento()
{
	PrimaryActorTick.bCanEverTick = true;

	// malla-raíz: cubo del motor como fragmento del cromo
	Malla = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Malla"));
	RootComponent = Malla;
	Malla->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));
	Malla->SetRelativeScale3D(FVector(0.6f, 0.6f, 0.6f));
	Malla->SetCollisionProfileName(TEXT("NoCollision"));

	// esfera de detección: overlap puro alrededor del fragmento
	Deteccion = CreateDefaultSubobject<USphereComponent>(TEXT("Deteccion"));
	Deteccion->SetupAttachment(RootComponent);
	Deteccion->SetSphereRadius(90.0f);
	Deteccion->SetCollisionProfileName(TEXT("OverlapAll"));
	Deteccion->SetGenerateOverlapEvents(true);
}

void AProtoFragmento::NotifyActorBeginOverlap(AActor* OtherActor)
{
	Super::NotifyActorBeginOverlap(OtherActor);

	// solo el pawn controlado por el jugador puede recogerlo
	if (bLlevado)
	{
		return;
	}

	APawn* Jugador = Cast<APawn>(OtherActor);

	if (Jugador && Jugador->IsPlayerControlled())
	{
		Recoger(Jugador);
	}
}

void AProtoFragmento::Recoger(APawn* Jugador)
{
	bLlevado = true;
	Portador = Jugador;

	// deja de detectar mientras está en mano
	Deteccion->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	// se pega a la raíz del jugador y queda "en mano" (sobre la cabeza, visible en cenital)
	AttachToComponent(Jugador->GetRootComponent(), FAttachmentTransformRules::KeepWorldTransform);
	SetActorRelativeLocation(FVector(0.0f, 0.0f, 130.0f));

	ProtoPrint(TEXT("✦ Fragmento en mano (1/1). Pulsa E para soltarlo. ¡No lo sueltes!"), FColor::Yellow);
}

void AProtoFragmento::Soltar()
{
	bLlevado = false;
	Portador.Reset();

	// se queda donde está, en el suelo, y vuelve a detectar
	DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
	Deteccion->SetCollisionEnabled(ECollisionEnabled::QueryOnly);

	ProtoPrint(TEXT("✦ Fragmento soltado en el suelo"), FColor::Yellow);
}

void AProtoFragmento::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (!bLlevado)
	{
		return;
	}

	APawn* Jugador = Portador.Get();

	if (!Jugador)
	{
		// el portador desapareció: soltado forzoso
		Soltar();
		return;
	}

	// detector de flanco de la tecla E (soltar)
	APlayerController* Controlador = Cast<APlayerController>(Jugador->GetController());
	const bool bTeclaAhora = Controlador && Controlador->IsInputKeyDown(EKeys::E);

	if (bTeclaAhora && !bTeclaEAntes)
	{
		Soltar();
	}

	bTeclaEAntes = bTeclaAhora;
}
