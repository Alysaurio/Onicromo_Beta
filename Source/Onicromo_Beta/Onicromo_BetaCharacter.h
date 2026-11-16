// Copyright Epic Games, Inc. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Onicromo_BetaCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;

/**
 * A controllable top-down perspective character with WASD movement and Shift-to-run
 */
UCLASS()
class AOnicromo_BetaCharacter : public ACharacter
{
	GENERATED_BODY()

private:
	/** Top down camera */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<UCameraComponent> TopDownCameraComponent;

	/** Camera boom positioning the camera above the character */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Components", meta = (AllowPrivateAccess = "true"))
	TObjectPtr<USpringArmComponent> CameraBoom;

	/** Current movement state: true when Shift is held (running) */
	bool bIsRunning;

public:
	/** Constructor */
	AOnicromo_BetaCharacter();

	/** Initialization */
	virtual void BeginPlay() override;

	/** Update */
	virtual void Tick(float DeltaSeconds) override;

	/** Input setup — binds WASD to movement and Shift to running */
	virtual void SetupPlayerInputComponent(class UInputComponent* PlayerInputComponent) override;

	/** Movement input handlers (W/S and A/D) */
	void MoveForward(float Value);
	void MoveRight(float Value);

	/** Run toggle (Shift pressed/released) */
	void StartRun();
	void StopRun();

	/** Speed settings (exposed to BP for tuning) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
	float WalkSpeed;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
	float RunSpeed;

	/** Damage handling: drains the Blueprint member variable "Vida" (float) and destroys the pawn when it reaches zero */
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, class AController* EventInstigator, AActor* DamageCauser) override;

	/** Returns the camera component **/
	UFUNCTION(BlueprintCallable, Category = "Components")
	UCameraComponent* GetTopDownCameraComponent() const { return TopDownCameraComponent.Get(); }

	/** Returns the Camera Boom component **/
	UFUNCTION(BlueprintCallable, Category = "Components")
	USpringArmComponent* GetCameraBoom() const { return CameraBoom.Get(); }

	/** Returns whether the character is currently running **/
	UFUNCTION(BlueprintCallable, Category = "Movement")
	bool IsRunning() const { return bIsRunning; }
};
