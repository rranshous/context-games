# HVAC System Enhancement

## Changes Made

### 1. Added HVAC Training Email Chain
Added new email thread in `/crew_communications/emails/` teaching about atmospheric power cycling:

- `hvac_cycling_training_001.txt` - Sarah (newbie) asks why settings aren't taking effect
- `hvac_cycling_training_002.txt` - Alex (experienced) explains power cycle requirement  
- `hvac_cycling_training_003.txt` - Sarah confirms power cycle worked
- `hvac_cycling_training_004.txt` - Alex explains safety reasoning behind design

### 2. Enhanced Atmospheric Sensors Tool
Modified `atmospheric_sensors` tool behavior:

**Before Power Cycle:**
- Shows current readings (actual environment)
- Shows "Not Set" for configured values
- Message indicates power cycle required

**After Power Cycle:**
- Shows current readings (actual environment) 
- Shows configured target values
- Standard success message

### 3. Updated Door Error Message
Changed door error from MC-specific language:
- **Old:** "Cannot open door - no atmosphere detected on the other side"
- **New:** "Cannot open door - atmospheric levels are outside configured thresholds"

## Technical Implementation

### Files Modified:
- `backend/ship-data.js` - Added HVAC training email chain
- `backend/tool-manager.js` - Enhanced atmospheric sensors + updated door error

### Key Logic:
- Atmospheric sensors now check `state.systems.atmosphere === 'pressurized'` to determine if configured settings should be shown
- **Setting atmospheric values only updates target settings, not current readings**
- **Power cycle applies target settings to current readings and pressurizes the system**
- Door error message is now more generic and system-focused rather than MC-specific

## Game Flow Impact
Players will now discover through emails that:
1. Setting atmospheric values doesn't immediately change the environment
2. A power cycle is required to activate new configurations  
3. This is a safety feature, not a bug
4. The atmospheric sensors will reflect this behavior accurately

**Current vs Target Logic:**
- Current readings remain unchanged when setting values
- Target settings are updated when configuring values
- Power cycle copies target settings to current readings
- Only then does the environment actually change
