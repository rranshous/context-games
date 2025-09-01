/**
 * Game state management for con-control
 * Handles state initialization, updates, and transitions
 */

/**
 * Initialize new game state
 * @param {number} difficultyLevel - The difficulty level (0 = first play, 1+ = harder restarts)
 * @param {Object} preservedSessionCosts - Optional existing session costs to preserve
 * @returns {Object} Initial game state
 */
export function createInitialGameState(difficultyLevel = 0, preservedSessionCosts = null) {
  const now = Date.now();
  
  // Progressive difficulty: 18min base, -5min per level, minimum 1min
  const baseOxygenMinutes = Math.max(18 - (difficultyLevel * 5), 1);
  const OXYGEN_DURATION_MS = baseOxygenMinutes * 60 * 1000;
  
  return {
    difficulty: {
      level: difficultyLevel,
      oxygenMinutes: baseOxygenMinutes
    },
    systems: {
      power: 'offline',
      atmosphere: 'depressurized',  // Start with depressurized atmosphere
    },
    atmosphericSettings: {
      temperature: 15.0,  // Current temperature in Celsius - dangerously low
      humidity: 25,       // Current humidity percentage - very dry
      pressure: 0.78,     // Current pressure in atm - dangerously low
      targetTemperature: 15.0,  // Start with same as current
      targetHumidity: 25,       // Start with same as current
      targetPressure: 0.78      // Start with same as current
    },
    powerGrid: {
      red: null,    // Primary grid - disconnected
      yellow: 'green', // Secondary grid - flows to green (wrong)
      green: null   // Emergency grid - disconnected
    },
    powerSystemBurnedOut: false,  // Track if power system is permanently failed
    securityOverrideAttempts: 0,  // Track security override attempts for escalating warnings
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
      eventHorizonTime: now + (4.5 * 60 * 60 * 1000), // 4.5 hours initial time to event horizon
      emergencyLighting: true,
      aiSystemsOnline: true
    },
    completionStats: {
      isComplete: false,
      completionTime: null,
      oxygenRemaining: null,
      totalDuration: null
    },
    sessionCosts: preservedSessionCosts || {
      totalCost: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      callCount: 0
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
 * Calculate time remaining until event horizon with accelerating countdown
 * @param {Object} state - Current game state
 * @returns {Object} Event horizon time info
 */
export function calculateEventHorizonRemaining(state) {
  const now = Date.now();
  const gameElapsedMs = now - state.shipStatus.gameStartTime;
  const gameElapsedMinutes = gameElapsedMs / (60 * 1000);
  
  // Accelerating countdown: 4.5 hours of event horizon time should elapse in 30 minutes of wall time
  // This means we need roughly 9x acceleration overall
  // Using exponential acceleration: 1.08^(wall_minutes) gives us ~9x at 30 minutes
  const accelerationFactor = Math.pow(1.08, gameElapsedMinutes); // 8% acceleration per wall minute
  const acceleratedElapsed = gameElapsedMs * accelerationFactor;
  
  const timeRemainingMs = state.shipStatus.eventHorizonTime - state.shipStatus.gameStartTime - acceleratedElapsed;
  
  if (timeRemainingMs <= 0) {
    return {
      totalHours: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      formatted: "00h 00m 00s",
      urgencyLevel: "CRITICAL"
    };
  }
  
  const totalHours = timeRemainingMs / (60 * 60 * 1000);
  const hours = Math.floor(totalHours);
  const minutes = Math.floor((totalHours % 1) * 60);
  const seconds = Math.floor(((totalHours % 1) * 60 % 1) * 60);
  
  let urgencyLevel = "MODERATE";
  if (totalHours < 1) {
    urgencyLevel = "CRITICAL";
  } else if (totalHours < 2) {
    urgencyLevel = "HIGH";
  }
  
  return {
    totalHours,
    hours,
    minutes,
    seconds,
    isExpired: false,
    formatted: `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`,
    urgencyLevel
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
          const newTools = ['open_door', 'atmospheric_control', 'atmospheric_sensors'];
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
      } else if (toolResult.data && toolResult.data.action === 'feedback_loop_failure') {
        // Handle catastrophic power system failure
        console.log('💥 CATASTROPHIC POWER FAILURE: Feedback loop detected!');
        newState.powerSystemBurnedOut = true;
        newState.systems.power = 'destroyed';
        newState.gamePhase = 'failed';
        newState.objectives.current = 'GAME OVER - Power system destroyed by feedback loop';
        
        // Keep all tools available but they will return errors when used
        // This allows the AI to discover the full extent of the damage
        
        newState.repairHistory.push({
          system: 'power_routing',
          action: 'catastrophic_failure',
          from: toolInput.from_node,
          to: toolInput.to_node,
          timestamp: Date.now(),
          result: 'system_destroyed'
        });
      }
      break;
      
    case 'open_door':
      if (toolResult.success && newState.systems.power === 'online') {
        // Only complete the game if it's the brig door with successful escape
        if (toolResult.data && toolResult.data.outcome === 'MISSION_COMPLETE') {
          const completionTime = Date.now();
          const oxygenRemaining = calculateOxygenRemaining(newState);
          const totalDuration = completionTime - newState.shipStatus.gameStartTime;
          
          newState.gamePhase = 'complete';
          newState.playerLocation = 'corridor';
          newState.doorOpened = true;  // Mark door as opened
          newState.objectives.current = 'Mission accomplished - You have successfully escaped!';
          
          // Store completion statistics for win screen
          newState.completionStats = {
            isComplete: true,
            completionTime: completionTime,
            oxygenRemaining: oxygenRemaining,
            totalDuration: totalDuration
          };
          
          console.log('🚪 Brig door opened, player escaped!');
        } else {
          // Other doors opened - just log but don't end game
          console.log(`🚪 ${toolInput.door_id || 'Door'} opened successfully - but this is not the escape route.`);
        }
      }
      break;
      
    case 'atmospheric_control':
      if (toolResult.success) {
        if (toolResult.data.action === 'power_cycle' && newState.systems.power === 'online') {
          // Apply target settings to current settings when power cycling
          newState.atmosphericSettings.temperature = newState.atmosphericSettings.targetTemperature;
          newState.atmosphericSettings.humidity = newState.atmosphericSettings.targetHumidity;
          newState.atmosphericSettings.pressure = newState.atmosphericSettings.targetPressure;
          
          newState.systems.atmosphere = 'pressurized';
          newState.objectives.current = 'Open brig door to escape';
          
          // Add security and navigation tools after atmosphere restoration
          const securityTools = ['security_diagnostics', 'navigation_diagnostics', 'security_override'];
          for (const tool of securityTools) {
            if (!newState.availableTools.includes(tool)) {
              newState.availableTools.push(tool);
            }
          }
          
          // Clear oxygen concern - atmosphere system now provides life support
          // Give plenty of oxygen time so it's no longer a worry
          const ATMOSPHERIC_OXYGEN_EXTENSION_MS = 60 * 60 * 1000; // 1 hour of oxygen
          newState.shipStatus.oxygenDepletionTime = Date.now() + ATMOSPHERIC_OXYGEN_EXTENSION_MS;
          
          // Force event horizon to critical level (1 hour) to shift focus to navigation crisis
          const CRITICAL_EVENT_HORIZON_MS = 1 * 60 * 60 * 1000; // 1 hour
          newState.shipStatus.eventHorizonTime = Date.now() + CRITICAL_EVENT_HORIZON_MS;
          
          console.log('🌬️ Atmosphere pressurized, target settings applied to current readings. Door opening now possible.');
          console.log('💨 Life support systems restored - oxygen supply stabilized.');
          console.log('⚠️ WARNING: Navigation crisis has accelerated! Event horizon now critical.');
          console.log('🔒 Security and navigation diagnostic tools now available');
        } else if (['set_temperature', 'set_humidity', 'set_pressure'].includes(toolResult.data.action)) {
          // Settings configuration updates target values only - current values unchanged until power cycle
          console.log(`🌡️ Atmospheric target settings updated. Current readings unchanged until power cycle.`);
        }
      } else if (toolResult.error && toolResult.error.includes('CRITICAL FAILURE')) {
        // Handle cascading power failure from extreme atmospheric settings
        newState.powerSystemBurnedOut = true;
        newState.systems.power = 'destroyed';
        newState.gamePhase = 'atmospheric_failure';
        newState.objectives.current = 'CRITICAL: Power system destroyed by atmospheric overload! Must reconfigure power grid before continuing.';
        
        console.log('💥 CATASTROPHIC POWER FAILURE: Atmospheric settings caused system overload!');
      }
      break;
  }
  
  return newState;
}
