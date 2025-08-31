/**
 * Game state management for con-control
 * Handles state initialization, updates, and transitions
 */

/**
 * Initialize new game state
 * @returns {Object} Initial game state
 */
export function createInitialGameState() {
  const now = Date.now();
  const OXYGEN_DURATION_MS = 18 * 60 * 1000; // 18 minutes in milliseconds
  
  return {
    systems: {
      power: 'offline',
      atmosphere: 'depressurized',  // Start with depressurized atmosphere
    },
    powerGrid: {
      red: null,    // Primary grid - disconnected
      yellow: 'green', // Secondary grid - flows to green (wrong)
      green: null   // Emergency grid - disconnected
    },
    availableTools: ['basic_diagnostics', 'locate_passengers', 'power_diagnostics', 'file_storage', 'reroute_power'],
    gamePhase: 'start',
    playerLocation: 'brig',
    doorOpened: false,  // Track if door has been opened
    objectives: {
      primary: 'Escape the detention facility',
      current: 'Live'
    },
    shipStatus: {
      gameStartTime: now,
      oxygenDepletionTime: now + OXYGEN_DURATION_MS, // When oxygen runs out
      emergencyLighting: true,
      aiSystemsOnline: true
    },
    repairHistory: [],
    conversationHistory: []
  };
}

/**
 * Calculate remaining oxygen time in minutes and seconds
 * @param {Object} state - Current game state
 * @returns {Object} Time remaining info
 */
export function calculateOxygenRemaining(state) {
  const now = Date.now();
  const timeRemainingMs = state.shipStatus.oxygenDepletionTime - now;
  
  if (timeRemainingMs <= 0) {
    return {
      totalSeconds: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      formatted: "00:00"
    };
  }
  
  const totalSeconds = Math.floor(timeRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return {
    totalSeconds,
    minutes,
    seconds,
    isExpired: false,
    formatted: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  };
}

/**
 * Check if the game should end due to oxygen depletion
 * @param {Object} state - Current game state
 * @returns {boolean} Whether oxygen has run out
 */
export function isOxygenDepleted(state) {
  return Date.now() >= state.shipStatus.oxygenDepletionTime;
}

/**
 * Update game state based on tool execution results
 * @param {Object} currentState - Current game state
 * @param {string} toolName - Name of the executed tool
 * @param {Object} toolResult - Result from tool execution
 * @param {Object} toolInput - Input parameters that were used
 * @returns {Object} Updated game state
 */
export function updateGameState(currentState, toolName, toolResult, toolInput = {}) {
  const newState = { ...currentState };
  
  switch (toolName) {
    case 'basic_diagnostics':
    case 'power_diagnostics':
    case 'file_storage':
      // These tools don't change state, just reveal information
      break;
      
    case 'reroute_power':
      if (toolResult.success) {
        const { from_node, to_node } = toolInput;
        
        // Update power grid connections
        if (to_node === '') {
          newState.powerGrid[from_node] = null;
        } else {
          newState.powerGrid[from_node] = to_node;
        }
        
        // Check if power routing is correct: green -> yellow -> red
        const isCorrectRouting = 
          newState.powerGrid.green === 'yellow' &&
          newState.powerGrid.yellow === 'red' &&
          newState.powerGrid.red === null;
          
        if (isCorrectRouting) {
          newState.systems.power = 'online';
          
          // Add new tools only if they're not already available
          const newTools = ['open_door', 'hvac_control'];
          for (const tool of newTools) {
            if (!newState.availableTools.includes(tool)) {
              newState.availableTools.push(tool);
            }
          }
          
          newState.objectives.current = 'Restore atmosphere systems to open brig door';
          console.log('🔋 Power routing correct! Emergency → Secondary → Primary flow established');
        } else {
          // Power still offline if routing is incorrect
          newState.systems.power = 'offline';
          console.log(`⚡ Power routing updated: ${Object.entries(newState.powerGrid).map(([k,v]) => v ? `${k}→${v}` : `${k}[disconnected]`).join(', ')}`);
        }
        
        newState.repairHistory.push({
          system: 'power_routing',
          action: toolResult.data.action,
          from: from_node,
          to: to_node,
          timestamp: Date.now(),
          result: 'successful'
        });
      }
      break;
      
    case 'open_door':
      if (toolResult.success && newState.systems.power === 'online') {
        newState.gamePhase = 'complete';
        newState.playerLocation = 'corridor';
        newState.doorOpened = true;  // Mark door as opened
        newState.objectives.current = 'Mission accomplished - You have successfully escaped!';
        console.log('🚪 Brig door opened, player escaped!');
      }
      break;
      
    case 'hvac_control':
      if (toolResult.success && newState.systems.power === 'online') {
        newState.systems.atmosphere = 'pressurized';
        newState.objectives.current = 'Open brig door to escape';
        
        // HVAC restoration gives additional oxygen time (simulate atmosphere recycling)
        const HVAC_BONUS_MS = 5 * 60 * 1000; // 5 extra minutes
        newState.shipStatus.oxygenDepletionTime += HVAC_BONUS_MS;
        
        console.log('🌬️ Atmosphere pressurized, door opening now possible. +5 minutes oxygen from recycling.');
      }
      break;
  }
  
  return newState;
}
