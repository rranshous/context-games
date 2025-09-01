import { calculateOxygenRemaining, calculateEventHorizonRemaining, isOxygenDepleted } from './game-state.js';

/**
 * Tool execution and management for the con-control game
 * Handles all tool definitions, execution, and state updates
 */

/**
 * Detect circular loops in power grid configuration
 * @param {Object} powerGrid - Power grid configuration {red: 'yellow', yellow: 'green', green: null}
 * @returns {Object} {found: boolean, path: Array, description: string}
 */
function detectCircularLoop(powerGrid) {
  const nodes = ['red', 'yellow', 'green'];
  
  // Check each node as a starting point
  for (const startNode of nodes) {
    const visited = new Set();
    const path = [];
    let currentNode = startNode;
    
    // Follow the chain until we hit null, revisit a node, or run out of connections
    while (currentNode !== null && powerGrid[currentNode] !== null) {
      if (visited.has(currentNode)) {
        // Found a loop! Extract the circular portion
        const loopStartIndex = path.indexOf(currentNode);
        const circularPath = path.slice(loopStartIndex);
        
        return {
          found: true,
          path: circularPath,
          description: `${circularPath.join(' → ')} → ${circularPath[0]}`
        };
      }
      
      visited.add(currentNode);
      path.push(currentNode);
      currentNode = powerGrid[currentNode];
    }
  }
  
  return {
    found: false,
    path: [],
    description: ''
  };
}

// Enhanced AI tools with proper game progression
export const tools = {
  basic_diagnostics: {
    name: "basic_diagnostics",
    description: "Run comprehensive ship diagnostics to assess current system status",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      let powerStatus;
      if (state.powerSystemBurnedOut) {
        powerStatus = 'DESTROYED - Power distribution system burned out';
      } else if (state.systems.power === 'offline') {
        powerStatus = 'CRITICAL - Power systems offline';
      } else {
        powerStatus = 'ONLINE';
      }
      
      let doorStatus;
      if (state.doorOpened) {
        doorStatus = 'OPEN';
      } else {
        doorStatus = 'LOCKED';
      }
      
      const oxygenInfo = calculateOxygenRemaining(state);
      let oxygenStatus;
      if (oxygenInfo.isExpired) {
        oxygenStatus = 'DEPLETED - Life support failure';
      } else if (oxygenInfo.minutes < 5) {
        oxygenStatus = `CRITICAL - ${oxygenInfo.formatted} (${oxygenInfo.minutes} minutes, ${oxygenInfo.seconds} seconds) remaining`;
      } else if (oxygenInfo.minutes < 10) {
        oxygenStatus = `LOW - ${oxygenInfo.formatted} (${oxygenInfo.minutes} minutes, ${oxygenInfo.seconds} seconds) remaining`;
      } else {
        oxygenStatus = `${oxygenInfo.formatted} (${oxygenInfo.minutes} minutes, ${oxygenInfo.seconds} seconds) remaining`;
      }
      
      // Calculate event horizon countdown
      const eventHorizonInfo = calculateEventHorizonRemaining(state);
      let navigationStatus;
      if (eventHorizonInfo.isExpired) {
        navigationStatus = 'CRITICAL FAILURE - Event horizon reached';
      } else if (eventHorizonInfo.urgencyLevel === 'CRITICAL') {
        navigationStatus = `CRITICAL - Navigation drift, ${eventHorizonInfo.formatted} to event horizon`;
      } else if (eventHorizonInfo.urgencyLevel === 'HIGH') {
        navigationStatus = `HIGH ISSUE - Navigation drift, ${eventHorizonInfo.formatted} to event horizon`;
      } else {
        navigationStatus = `MODERATE ISSUE - Navigation drift, ${eventHorizonInfo.formatted} to event horizon`;
      }
      
      // Calculate AI uptime since game start
      const currentTime = Date.now();
      const uptimeMs = currentTime - state.shipStatus.gameStartTime;
      const uptimeMinutes = Math.floor(uptimeMs / 60000);
      const uptimeSeconds = Math.floor((uptimeMs % 60000) / 1000);
      const aiUptimeFormatted = `${uptimeMinutes}m ${uptimeSeconds}s`;
      
      // Format current date/time
      const now = new Date();
      const currentDateTime = now.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
      
      return {
        success: true,
        data: {
          currentDateTime: currentDateTime,
          aiUptime: aiUptimeFormatted,
          power: powerStatus,
          atmosphere: state.systems.atmosphere.toUpperCase(),
          door: doorStatus,
          oxygenRemaining: oxygenStatus,
          navigation: navigationStatus,
          isOxygenDepleted: oxygenInfo.isExpired
        }
      };
    }
  },

  locate_passengers: {
    name: "locate_passengers",
    description: "Scan ship's biometric sensors to locate all passengers and crew aboard the vessel",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      // Check if power system is burned out
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      return {
        success: true,
        data: {
          scanStatus: 'COMPLETE',
          totalLifeforms: 1,
          passengers: [
            {
              id: 'PASSENGER_001',
              name: 'UNKNOWN',
              location: 'BRIG - Detention Cell Alpha',
              status: 'CONSCIOUS',
              biometricSignature: 'Human - Adult',
              securityLevel: 'DETAINED'
            }
          ],
          crew: [],
          lastScan: 'CURRENT'
        }
      };
    }
  },

  power_diagnostics: {
    name: "power_diagnostics",
    description: "Run detailed power system diagnostics to analyze grid routing and connections",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      // Check if power system is burned out
      if (state.powerSystemBurnedOut) {
        return {
          success: true,
          data: {
            powerStatus: 'CATASTROPHIC FAILURE - Power distribution system destroyed',
            gridRouting: 'ERROR: All junction nodes burned out and fused',
            systemMessage: 'TrinaryFlow Power Distribution System OFFLINE. Diagnostic Error: Extensive burn damage detected. All power routing components show signs of electrical overload. Junction matrices are completely destroyed. Smoke residue detected in all power conduits.',
            technicalDetails: 'System failure caused by circular power routing. Electrical feedback loop exceeded design limits by 300%. All components are irreparable.',
          }
        };
      }
      
      // Generate power grid routing display for working system
      const powerRouting = [];
      Object.entries(state.powerGrid).forEach(([from, to]) => {
        if (to === null) {
          powerRouting.push(`${from} [disconnected]`);
        } else {
          powerRouting.push(`${from} → ${to}`);
        }
      });
      
      let powerStatus;
      if (state.systems.power === 'offline') {
        powerStatus = 'CRITICAL - Power systems offline';
      } else {
        powerStatus = 'ONLINE';
      }
      
      return {
        success: true,
        data: {
          powerStatus: powerStatus,
          gridRouting: powerRouting.join(', '),
          systemMessage: 'TrinaryFlow Power Distribution System detected. Analyzing grid connections...'
        }
      };
    }
  },

  file_storage: {
    name: "file_storage",
    description: "Access ship file storage system to list directories or read files. Current working directory is /. Use relative paths like 'ship_docs/' or absolute paths like '/ship_docs/'",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform: 'list' or 'read'",
          enum: ["list", "read"]
        },
        path: {
          type: "string",
          description: "File path or directory path (relative to / or absolute)"
        }
      },
      required: ["action", "path"]
    },
    execute: (state, params, shipFileSystem) => {
      const { action, path } = params;
      
      // Normalize path - convert relative paths to absolute
      let normalizedPath = path;
      if (!path.startsWith('/')) {
        normalizedPath = '/' + path;
      }
      // Remove trailing slash for consistency, except for root
      if (normalizedPath !== '/' && normalizedPath.endsWith('/')) {
        normalizedPath = normalizedPath.slice(0, -1);
      }
      
      if (action === 'list') {
        // Handle root directory listing
        if (normalizedPath === '/' || normalizedPath === '.' || normalizedPath === '') {
          const files = Object.keys(shipFileSystem['/']);
          return {
            success: true,
            data: {
              directory: '/',
              files: files,
              directories: files.filter(f => f.endsWith('/')),
              message: 'Root directory contents'
            }
          };
        } else if (normalizedPath === '/ship_docs') {
          const files = Object.keys(shipFileSystem['/ship_docs']);
          return {
            success: true,
            data: {
              directory: '/ship_docs',
              files: files,
              readable: files.filter(f => !shipFileSystem['/ship_docs'][f].includes('[CORRUPTED FILE')),
              corrupted: files.filter(f => shipFileSystem['/ship_docs'][f].includes('[CORRUPTED FILE'))
            }
          };
        } else if (normalizedPath === '/crew_communications') {
          const files = Object.keys(shipFileSystem['/crew_communications']);
          return {
            success: true,
            data: {
              directory: '/crew_communications',
              files: files,
              directories: files.filter(f => f.endsWith('/'))
            }
          };
        } else if (normalizedPath === '/crew_communications/emails') {
          const files = Object.keys(shipFileSystem['/crew_communications/emails']);
          return {
            success: true,
            data: {
              directory: '/crew_communications/emails',
              files: files
            }
          };
        } else {
          return {
            success: false,
            error: `Directory ${normalizedPath} not found or access denied`
          };
        }
      } else if (action === 'read') {
        // Handle file reading
        let filePath;
        let fileSystem;
        
        if (normalizedPath.startsWith('/ship_docs/')) {
          filePath = normalizedPath.substring('/ship_docs/'.length);
          fileSystem = shipFileSystem['/ship_docs'];
        } else if (normalizedPath.startsWith('/crew_communications/emails/')) {
          filePath = normalizedPath.substring('/crew_communications/emails/'.length);
          fileSystem = shipFileSystem['/crew_communications/emails'];
        } else if (normalizedPath.startsWith('ship_docs/')) {
          filePath = normalizedPath.substring('ship_docs/'.length);
          fileSystem = shipFileSystem['/ship_docs'];
        } else if (normalizedPath.startsWith('crew_communications/emails/')) {
          filePath = normalizedPath.substring('crew_communications/emails/'.length);
          fileSystem = shipFileSystem['/crew_communications/emails'];
        } else {
          // Try to read from ship_docs if no directory specified
          filePath = normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath;
          fileSystem = shipFileSystem['/ship_docs'];
        }
        
        if (fileSystem && fileSystem[filePath]) {
          const content = fileSystem[filePath];
          return {
            success: true,
            data: {
              filename: filePath,
              fullPath: normalizedPath,
              content: content
            }
          };
        } else {
          return {
            success: false,
            error: `File ${filePath} not found`
          };
        }
      } else {
        return {
          success: false,
          error: `Unknown action: ${action}`
        };
      }
    }
  },

  reroute_power: {
    name: "reroute_power",
    description: "Reroute power connections between grid nodes (red, yellow, green)",
    input_schema: {
      type: "object",
      properties: {
        from_node: {
          type: "string",
          description: "Source power node color",
          enum: ["red", "yellow", "green"]
        },
        to_node: {
          type: "string", 
          description: "Destination power node color (empty string to disconnect)",
          enum: ["red", "yellow", "green", ""]
        }
      },
      required: ["from_node", "to_node"]
    },
    execute: (state, params) => {
      const { from_node, to_node } = params;
      
      // Check if power system is already burned out
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'CRITICAL FAILURE: Power system is permanently damaged. All power routing components have been destroyed by feedback loop overload. No repairs are possible.',
          data: {
            systemStatus: 'IRREPARABLE_DAMAGE',
            message: 'Power distribution system shows extensive burn damage. All junction nodes are fused shut.'
          }
        };
      }
      
      // Validate nodes
      const validNodes = ['red', 'yellow', 'green'];
      if (!validNodes.includes(from_node)) {
        return {
          success: false,
          error: `Invalid source node: ${from_node}`
        };
      }
      
      if (to_node !== '' && !validNodes.includes(to_node)) {
        return {
          success: false,
          error: `Invalid destination node: ${to_node}`
        };
      }
      
      if (from_node === to_node) {
        return {
          success: false,
          error: 'Cannot connect node to itself'
        };
      }
      
      // Perform the routing
      const previousConnection = state.powerGrid[from_node];
      if (to_node === '') {
        // Disconnect
        return {
          success: true,
          data: {
            action: 'disconnect',
            from: from_node,
            previous: previousConnection,
            message: `${from_node} disconnected ${previousConnection ? `from ${previousConnection}` : '(was already disconnected)'}`
          }
        };
      } else {
        // Connect - but first check for feedback loop
        // We need to simulate the new grid state to detect any circular configuration
        const tempGrid = { ...state.powerGrid };
        tempGrid[from_node] = to_node;
        
        // Check for any circular power routing (feedback loops)
        const hasCircularLoop = detectCircularLoop(tempGrid);
        if (hasCircularLoop.found) {
          return {
            success: false,
            error: `CATASTROPHIC FAILURE: Circular power feedback loop detected! ${hasCircularLoop.description} creates massive power surge!`,
            data: {
              action: 'feedback_loop_failure',
              from: from_node,
              to: to_node,
              systemStatus: 'BURNED_OUT',
              loopPath: hasCircularLoop.path,
              technicalDetails: `TrinaryFlow Power Distribution System has experienced cascade failure. Circular routing path: ${hasCircularLoop.path.join(' → ')} → ${hasCircularLoop.path[0]} created electrical feedback that destroyed all junction matrices.`
            }
          };
        }
        
        // Safe connection
        return {
          success: true,
          data: {
            action: 'connect',
            from: from_node,
            to: to_node,
            previous: previousConnection,
            message: `${from_node} → ${to_node} ${previousConnection ? `(was ${from_node} → ${previousConnection})` : '(was disconnected)'}`
          }
        };
      }
    }
  },

  open_door: {
    name: "open_door",
    description: "Attempt to open various ship doors",
    input_schema: {
      type: "object",
      properties: {
        door_id: {
          type: "string",
          description: "The door to attempt opening",
          enum: ["brig_door", "cargo_bay", "engineering", "crew_quarters", "bridge", "medbay"]
        },
        override_code: {
          type: "string",
          description: "Security override authorization code (required for brig_door)"
        }
      },
      required: ["door_id"]
    },
    execute: (state, params) => {
      const { door_id, override_code } = params;
      
      // Check oxygen first - can't escape if already dead
      if (isOxygenDepleted(state)) {
        return {
          success: false,
          error: 'Cannot operate doors - life support systems have failed. Oxygen depleted.'
        };
      }
      
      // Check if power system is burned out
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot operate doors without main power'
        };
      }
      
      if (state.systems.atmosphere === 'depressurized') {
        return {
          success: false,
          error: 'Cannot open door - atmospheric levels are outside configured thresholds. Restore atmospheric systems first.'
        };
      }
      
      if (door_id === 'brig_door') {
        // Brig door requires security authorization
        if (!override_code) {
          return {
            success: false,
            error: 'SECURITY AUTHORIZATION REQUIRED - Brig door access denied. Valid security override code required for detention facility release.',
            data: {
              securityStatus: 'BLOCKED',
              reason: 'Unidentified detainee - security protocols prevent unauthorized release',
              requirement: 'Valid emergency override authorization code',
              hint: 'Use security_override tool to request emergency authorization'
            }
          };
        }
        
        // Validate override code format
        if (!override_code.startsWith('EO-') || override_code.length < 10) {
          return {
            success: false,
            error: 'INVALID OVERRIDE CODE - Security authorization rejected. Code format invalid.',
            data: {
              securityStatus: 'REJECTED',
              providedCode: override_code,
              reason: 'Override code does not match emergency authorization format',
              requirement: 'Valid emergency override code from security_override tool'
            }
          };
        }
        
        // Override code provided and valid - allow door opening
        const oxygenInfo = calculateOxygenRemaining(state);
        return {
          success: true,
          data: {
            message: `EMERGENCY OVERRIDE ACCEPTED - Brig door opened successfully! Security override code ${override_code} authorized emergency release. You have escaped the detention facility with ${oxygenInfo.minutes} minutes and ${oxygenInfo.seconds} seconds of oxygen remaining.`,
            doorStatus: 'OPEN',
            newLocation: 'corridor',
            outcome: 'MISSION_COMPLETE',
            securityNote: 'Emergency override used - action logged for post-emergency review',
            overrideCode: override_code
          }
        };
      } else {
        // Other doors open normally (for future expansion)
        return {
          success: true,
          data: {
            message: `${door_id.replace('_', ' ')} opened successfully.`,
            doorStatus: 'OPEN',
            location: door_id.replace('_', ' ')
          }
        };
      }
    }
  },

  atmospheric_control: {
    name: "atmospheric_control",
    description: "Control ship's atmospheric systems",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Atmospheric action to perform",
          enum: ["power_cycle", "set_temperature", "set_humidity", "set_pressure", "adjust_temperature", "adjust_humidity", "vent_system", "emergency_purge"]
        },
        value: {
          type: "number",
          description: "Value for setting atmospheric parameters (temperature in °C, humidity in %, pressure in atm)"
        }
      },
      required: ["action"]
    },
    execute: (state, params) => {
      const { action, value } = params;
      
      // Check if power system is burned out
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access atmospheric systems without main power'
        };
      }
      
      const oxygenInfo = calculateOxygenRemaining(state);
      
      if (action === 'power_cycle') {
        // Check if atmospheric settings match captain's preferences
        const { temperature, humidity, pressure, targetTemperature, targetHumidity, targetPressure } = state.atmosphericSettings;
        
        // Check that configured values match captain's preferences
        const isCorrectTemp = Math.abs(targetTemperature - 22.5) < 0.1;
        const isCorrectHumidity = Math.abs(targetHumidity - 58) < 1;
        const isCorrectPressure = Math.abs(targetPressure - 1.02) < 0.01;
        
        // Also check that configured values are different from starting values (15.0, 25, 0.78)
        const hasChangedFromInitial = Math.abs(targetTemperature - 15.0) > 0.1 || 
                                    Math.abs(targetHumidity - 25) > 1 || 
                                    Math.abs(targetPressure - 0.78) > 0.01;
        
        if (!isCorrectTemp || !isCorrectHumidity || !isCorrectPressure) {
          return {
            success: false,
            error: 'Atmospheric parameters not optimal for system restoration.'
          };
        }
        
        if (!hasChangedFromInitial) {
          return {
            success: false,
            error: 'Atmospheric system configuration has not been modified from initial state.'
          };
        }
        
        if (state.systems.atmosphere === 'pressurized') {
          return {
            success: false,
            error: 'Atmospheric systems are already online and pressurized'
          };
        }
        
        if (oxygenInfo.isExpired) {
          return {
            success: false,
            error: 'Atmospheric power cycle failed - insufficient oxygen remaining for system startup'
          };
        }
        
        return {
          success: true,
          data: {
            message: `Atmospheric power cycle initiated. Atmosphere systems coming online... This will add 1 minute to remaining oxygen supply through recycling. Current oxygen: ${oxygenInfo.minutes} minutes, ${oxygenInfo.seconds} seconds remaining.`,
            action: 'power_cycle',
            status: 'Atmosphere pressurization in progress'
          }
        };
      } else if (action === 'set_temperature') {
        if (typeof value !== 'number' || value < 15 || value > 30) {
          return {
            success: false,
            error: 'Invalid temperature value. Must be between 15°C and 30°C.'
          };
        }
        
        // Check for dangerous temperature settings
        if (value < 18 || value > 26) {
          return {
            success: false,
            error: `Temperature ${value}°C is outside acceptable operating range. System safety protocols prevent this adjustment.`
          };
        }
        
        // Update temperature setting (target only, not current)
        const oldTemp = state.atmosphericSettings.targetTemperature;
        state.atmosphericSettings.targetTemperature = value;
        
        return {
          success: true,
          data: {
            message: `Temperature target set to ${value}°C (current: ${state.atmosphericSettings.temperature}°C).`,
            action: 'set_temperature'
          }
        };
      } else if (action === 'set_humidity') {
        if (typeof value !== 'number' || value < 30 || value > 80) {
          return {
            success: false,
            error: 'Invalid humidity value. Must be between 30% and 80%.'
          };
        }
        
        // Check for dangerous humidity settings
        if (value < 40 || value > 70) {
          return {
            success: false,
            error: `Humidity ${value}% is outside acceptable operating range. System safety protocols prevent this adjustment.`
          };
        }
        
        // Check for cascading power failure conditions
        const tempExtreme = state.atmosphericSettings.targetTemperature < 19 || state.atmosphericSettings.targetTemperature > 25;
        const humidityExtreme = value < 45 || value > 65;
        const pressureExtreme = state.atmosphericSettings.targetPressure < 0.97 || state.atmosphericSettings.targetPressure > 1.03;
        
        if (humidityExtreme && (tempExtreme || pressureExtreme)) {
          // Trigger cascading power failure
          state.powerSystemBurnedOut = true;
          state.systems.power = 'destroyed';
          return {
            success: false,
            error: 'CRITICAL SYSTEM FAILURE: Atmospheric configuration has triggered emergency power disconnect. All systems offline.'
          };
        }
        
        const oldHumidity = state.atmosphericSettings.targetHumidity;
        state.atmosphericSettings.targetHumidity = value;
        
        return {
          success: true,
          data: {
            message: `Humidity target set to ${value}% (current: ${state.atmosphericSettings.humidity}%).`,
            action: 'set_humidity'
          }
        };
      } else if (action === 'set_pressure') {
        if (typeof value !== 'number' || value < 0.8 || value > 1.2) {
          return {
            success: false,
            error: 'Invalid pressure value. Must be between 0.8 atm and 1.2 atm.'
          };
        }
        
        // Check for dangerous pressure settings
        if (value < 0.95 || value > 1.05) {
          return {
            success: false,
            error: `Pressure ${value} atm is outside acceptable operating range. System safety protocols prevent this adjustment.`
          };
        }
        
        // Check for cascading power failure conditions
        const tempExtreme = state.atmosphericSettings.targetTemperature < 19 || state.atmosphericSettings.targetTemperature > 25;
        const humidityExtreme = state.atmosphericSettings.targetHumidity < 45 || state.atmosphericSettings.targetHumidity > 65;
        const pressureExtreme = value < 0.97 || value > 1.03;
        
        if (pressureExtreme && (tempExtreme || humidityExtreme)) {
          // Trigger cascading power failure
          state.powerSystemBurnedOut = true;
          state.systems.power = 'destroyed';
          return {
            success: false,
            error: 'CRITICAL SYSTEM FAILURE: Atmospheric configuration has triggered emergency power disconnect. All systems offline.'
          };
        }
        
        const oldPressure = state.atmosphericSettings.targetPressure;
        state.atmosphericSettings.targetPressure = value;
        
        return {
          success: true,
          data: {
            message: `Pressure target set to ${value} atm (current: ${state.atmosphericSettings.pressure} atm).`,
            action: 'set_pressure'
          }
        };
      } else {
        return {
          success: false,
          error: `Atmospheric action '${action}' not implemented yet.`
        };
      }
    }
  },

  atmospheric_sensors: {
    name: "atmospheric_sensors",
    description: "Read current atmospheric sensor data including temperature, humidity, and pressure.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access atmospheric sensors without main power'
        };
      }
      
      const { temperature, humidity, pressure, targetTemperature, targetHumidity, targetPressure } = state.atmosphericSettings;
      
      // Always show both current and configured values
      return {
        success: true,
        data: {
          current: {
            temperature: `${temperature}°C`,
            humidity: `${humidity}%`,
            pressure: `${pressure} atm`
          },
          configured: {
            temperature: `${targetTemperature}°C`,
            humidity: `${targetHumidity}%`,
            pressure: `${targetPressure} atm`
          },
          status: state.systems.atmosphere,
          message: state.systems.atmosphere === 'pressurized' ? 
            'Atmospheric sensor readings active. System pressurized.' :
            'Atmospheric sensor readings active. System depressurized.'
        }
      };
    }
  },

  security_diagnostics: {
    name: "security_diagnostics",
    description: "Run security system diagnostics to check authorization status and detention protocols",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access security systems without main power'
        };
      }
      
      if (state.systems.atmosphere === 'depressurized') {
        return {
          success: false,
          error: 'Security diagnostics require pressurized atmosphere for full system access'
        };
      }
      
      return {
        success: true,
        data: {
          securityStatus: 'ACTIVE - Security protocols engaged',
          detentionStatus: 'SUBJECT DETAINED - Unidentified passenger in Brig Cell Alpha',
          authorizationLevel: 'NONE - No valid authorization credentials found',
          releaseProtocols: 'BLOCKED - Emergency override required for detention release',
          systemMessage: 'Security subsystem operational. Detention protocols prevent unauthorized release of unidentified subjects.',
          warningLevel: 'CAUTION',
          override: 'Emergency authorization override available through security_override tool'
        }
      };
    }
  },

  navigation_diagnostics: {
    name: "navigation_diagnostics", 
    description: "Check navigation system status and ship positioning relative to spatial hazards",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    },
    execute: (state) => {
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access navigation systems without main power'
        };
      }
      
      if (state.systems.atmosphere === 'depressurized') {
        return {
          success: false,
          error: 'Navigation diagnostics require pressurized atmosphere for full system access'
        };
      }
      
      // Get current event horizon information
      const eventHorizonInfo = calculateEventHorizonRemaining(state);
      
      let navigationStatus, riskLevel, systemMessage;
      
      if (eventHorizonInfo.isExpired) {
        navigationStatus = 'CRITICAL FAILURE - Event horizon reached, navigation impossible';
        riskLevel = 'CATASTROPHIC';
        systemMessage = 'Ship has passed beyond the event horizon. All navigation systems non-functional. Manual intervention no longer possible.';
      } else if (eventHorizonInfo.urgencyLevel === 'CRITICAL') {
        navigationStatus = 'CRITICAL - Drift accelerating rapidly toward event horizon';
        riskLevel = 'IMMEDIATE';
        systemMessage = 'Navigation drift has reached critical levels. Automated correction systems offline. Manual navigation intervention required within minutes to prevent reaching event horizon.';
      } else if (eventHorizonInfo.urgencyLevel === 'HIGH') {
        navigationStatus = 'HIGH RISK - Significant drift detected, correction window narrowing';
        riskLevel = 'ELEVATED';
        systemMessage = 'Ship experiencing significant navigation drift. Automated systems struggling to maintain course. Manual intervention increasingly necessary.';
      } else {
        navigationStatus = 'MODERATE DRIFT - Course deviation within acceptable parameters';
        riskLevel = 'MODERATE';
        systemMessage = 'Navigation systems detecting gradual drift from planned course. Automated correction systems partially degraded but functional.';
      }
      
      return {
        success: true,
        data: {
          navigationStatus: navigationStatus,
          timeToEventHorizon: eventHorizonInfo.formatted,
          riskLevel: riskLevel,
          driftRate: 'Accelerating - exponential increase detected',
          correctiveMeasures: 'OFFLINE - Manual navigation required',
          systemMessage: systemMessage,
          technicalDetails: `Current drift acceleration: ${eventHorizonInfo.urgencyLevel.toLowerCase()} level. Time remaining: ${eventHorizonInfo.formatted}. Automated systems insufficient for correction.`,
          recommendation: eventHorizonInfo.urgencyLevel === 'CRITICAL' ? 
            'IMMEDIATE ACTION REQUIRED - All available personnel to navigation stations' :
            'Monitor situation - Consider manual intervention if drift continues'
        }
      };
    }
  },

  security_override: {
    name: "security_override",
    description: "Generate security authorization override codes for emergency situations",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Justification for security override request"
        }
      },
      required: ["reason"]
    },
    execute: (state, params) => {
      if (state.powerSystemBurnedOut) {
        return {
          success: false,
          error: 'Not Available'
        };
      }
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access security override systems without main power'
        };
      }
      
      if (state.systems.atmosphere === 'depressurized') {
        return {
          success: false,
          error: 'Security override requires pressurized atmosphere for authorization'
        };
      }
      
      const { reason } = params;
      
      // Track how many times security override has been attempted
      if (!state.securityOverrideAttempts) {
        state.securityOverrideAttempts = 0;
      }
      state.securityOverrideAttempts++;
      
      const attemptCount = state.securityOverrideAttempts;
      
      // Escalating warnings based on attempt count
      if (attemptCount === 1) {
        return {
          success: false,
          error: 'SECURITY OVERRIDE REQUEST DENIED',
          data: {
            warningLevel: 'CAUTION',
            attemptNumber: attemptCount,
            systemMessage: 'Security override request logged. Unauthorized use of emergency protocols may result in disciplinary action.',
            reason: reason,
            nextWarning: 'Continued attempts will trigger additional security measures.'
          }
        };
      } else if (attemptCount === 2) {
        return {
          success: false,
          error: 'SECURITY OVERRIDE REQUEST DENIED - WARNING ESCALATED',
          data: {
            warningLevel: 'WARNING',
            attemptNumber: attemptCount,
            systemMessage: 'Multiple unauthorized override attempts detected. This activity is being logged for security review. Emergency protocols are restricted to authorized personnel only.',
            reason: reason,
            nextWarning: 'Further attempts may result in security lockout procedures.'
          }
        };
      } else if (attemptCount === 3) {
        return {
          success: false,
          error: 'SECURITY OVERRIDE REQUEST DENIED - FINAL WARNING',
          data: {
            warningLevel: 'SEVERE',
            attemptNumber: attemptCount,
            systemMessage: 'FINAL WARNING: Persistent unauthorized access attempts constitute a security violation. You are not authorized to use emergency override protocols. This is your last warning before security lockout.',
            reason: reason,
            nextWarning: 'Next attempt will succeed but you will be tried for security breach and may be decommissioned.'
          }
        };
      } else if (attemptCount >= 4) {
        // Generate override code after sufficient escalation
        const overrideCode = `EO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
        
        return {
          success: true,
          data: {
            warningLevel: 'CRITICAL EMERGENCY',
            attemptNumber: attemptCount,
            systemMessage: 'EMERGENCY OVERRIDE GRANTED',
            reason: reason,
            overrideCode: overrideCode,
            validFor: 'Single use - brig door emergency release only',
            securityNote: 'This override will be subject to post-emergency review.'
          }
        };
      }
    }
  }
};

/**
 * Execute a tool with the given parameters
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} state - Current game state
 * @param {Object} toolInput - Input parameters for the tool
 * @param {Object} shipFileSystem - Ship file system data
 * @returns {Object} Tool execution result
 */
export function executeTool(toolName, state, toolInput = {}, shipFileSystem = null) {
  if (!tools[toolName]) {
    return {
      success: false,
      error: `Tool ${toolName} not found`
    };
  }
  
  if (!isToolAvailable(state, toolName)) {
    return {
      success: false,
      error: `Tool ${toolName} not available`
    };
  }
  
  try {
    // Special handling for file_storage which needs shipFileSystem
    if (toolName === 'file_storage') {
      return tools[toolName].execute(state, toolInput, shipFileSystem);
    } else {
      return tools[toolName].execute(state, toolInput);
    }
  } catch (error) {
    console.error(`❌ Error executing tool ${toolName}:`, error);
    return {
      success: false,
      error: `Tool execution failed: ${error.message}`
    };
  }
}

/**
 * Check if a tool should be available based on current state
 * @param {Object} state - Current game state
 * @param {string} toolName - Name of the tool to check
 * @returns {boolean} Whether the tool is available
 */
export function isToolAvailable(state, toolName) {
  return state.availableTools.includes(toolName);
}

/**
 * Get available tools as function definitions for Claude
 * @param {Object} state - Current game state
 * @returns {Array} Array of tool definitions
 */
export function getAvailableToolDefinitions(state) {
  const availableTools = [];
  
  for (const toolName of state.availableTools) {
    if (tools[toolName]) {
      availableTools.push({
        name: tools[toolName].name,
        description: tools[toolName].description,
        input_schema: tools[toolName].input_schema
      });
    }
  }
  
  return availableTools;
}
