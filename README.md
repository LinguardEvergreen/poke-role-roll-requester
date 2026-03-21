# Poké Role - Roll Requester

A **FoundryVTT v13** module that gives the Game Master the ability to request combined rolls from players directly via the token context menu.

## Features

- **Token context menu**: Right-clicking a token reveals a new **"Request Roll"** button (visible to GM only).
- **Request dialog**: The GM can:
  - Write a descriptive message for the player (e.g. "Roll to dodge the falling rocks!")
  - Select any combination of **attributes** (Physical/Mental and Social) and **skills**
  - Set the **required successes** and choose whether to apply the **pain penalty**
- **Chat message**: The request appears as a whispered message to the player who owns the character, containing:
  - The GM's message
  - A button labelled "**Roll on [Selected Attributes + Skills]**" (e.g. "Roll on Dexterity + Alert")
- **Automatic roll**: Clicking the button automatically performs the combined roll using the Poké Role system mechanics (d6 pool, successes on 4+, pain penalty).

## Requirements

- **FoundryVTT**: v13 (verified on Build 351)
- **System**: [Poké Role System](https://github.com/RiccardoMont1/Pok-Role-Module) v0.16.0+

## Installation

### Method 1 - Manifest URL
1. In FoundryVTT, go to **Settings → Manage Modules → Install Module**
2. Paste the manifest URL:
   ```
   https://github.com/LinguardEvergreen/poke-role-roll-requester/releases/latest/download/module.json
   ```
3. Click **Install**

### Method 2 - Manual
1. Download the latest release from [GitHub Releases](https://github.com/LinguardEvergreen/poke-role-roll-requester/releases)
2. Extract the folder into `Data/modules/`
3. Restart FoundryVTT

## Usage

1. **Enable the module** in your world settings
2. As GM, **right-click** a token on the scene
3. Click **"Request Roll"** in the context menu
4. In the dialog:
   - Write a descriptive message (optional)
   - Select the desired attributes and/or skills
   - Set the required successes
   - Choose whether to apply the pain penalty
5. Click **"Send Request"**
6. The player who owns the character will see the message in chat with a button to perform the roll

## Available Traits

### Physical / Mental Attributes
Strength, Dexterity, Vitality, Special, Insight

### Social Attributes
Tough, Beauty, Cool, Cute, Clever, Allure

### Skills
Alert, Athletic, Brawl, Channel, Clash, Crafts, Empathy, Etiquette, Evasion, Intimidate, Lore, Medicine, Nature, Perform, Science, Stealth, Throw, Weapons

## Roll Mechanics

The module uses the same mechanics as the **Combined Roll** from the Poké Role system:
- **Dice pool**: sum of all selected attribute/skill values → Nd6
- **Success**: each die showing 4 or higher counts as a success
- **Pain penalty**: 0 if HP > half max, 1 if HP ≤ half max, 2 if HP ≤ 1
- **Result**: Net successes (raw − removed) compared against required successes → HIT or MISS

## Supported Languages

- English 🇬🇧
- Italiano 🇮🇹

## License

This module is distributed as free software for use with FoundryVTT and the Poké Role system.
