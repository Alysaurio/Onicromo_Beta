// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class Onicromo_Beta : ModuleRules
{
	public Onicromo_Beta(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"NavigationSystem",
			"StateTreeModule",
			"GameplayStateTreeModule",
			"Niagara",
			"UMG",
			"Slate"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });

		PublicIncludePaths.AddRange(new string[] {
			"Onicromo_Beta",
			"Onicromo_Beta/Variant_Strategy",
			"Onicromo_Beta/Variant_Strategy/UI",
			"Onicromo_Beta/Variant_TwinStick",
			"Onicromo_Beta/Variant_TwinStick/AI",
			"Onicromo_Beta/Variant_TwinStick/Gameplay",
			"Onicromo_Beta/Variant_TwinStick/UI"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
