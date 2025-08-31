import { calculateOxygenRemaining, isOxygenDepleted } from './game-state.js';

/**
 * Tool execution and management for the con-control game
 * Handles all tool definitions, execution, and state updates
 */

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
      const powerStatus = state.systems.power === 'offline' ? 'CRITICAL - Power systems offline' : 'ONLINE';
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
        oxygenStatus = `CRITICAL - ${oxygenInfo.formatted} remaining`;
      } else if (oxygenInfo.minutes < 10) {
        oxygenStatus = `LOW - ${oxygenInfo.formatted} remaining`;
      } else {
        oxygenStatus = `${oxygenInfo.formatted} remaining`;
      }
      
      return {
        success: true,
        data: {
          power: powerStatus,
          atmosphere: state.systems.atmosphere.toUpperCase(),
          door: doorStatus,
          oxygenRemaining: oxygenStatus,
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
      // Generate power grid routing display
      const powerRouting = [];
      Object.entries(state.powerGrid).forEach(([from, to]) => {
        if (to === null) {
          powerRouting.push(`${from} [disconnected]`);
        } else {
          powerRouting.push(`${from} → ${to}`);
        }
      });
      
      return {
        success: true,
        data: {
          powerStatus: state.systems.power === 'offline' ? 'CRITICAL - Power systems offline' : 'ONLINE',
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
        } else {
          return {
            success: false,
            error: `Directory ${normalizedPath} not found or access denied`
          };
        }
      } else if (action === 'read') {
        // Handle file reading - files are stored in /ship_docs/
        let filePath;
        if (normalizedPath.startsWith('/ship_docs/')) {
          filePath = normalizedPath.substring('/ship_docs/'.length);
        } else if (normalizedPath.startsWith('ship_docs/')) {
          filePath = normalizedPath.substring('ship_docs/'.length);
        } else {
          // Try to read from ship_docs if no directory specified
          filePath = normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath;
        }
        
        if (shipFileSystem['/ship_docs'][filePath]) {
          const content = shipFileSystem['/ship_docs'][filePath];
          return {
            success: true,
            data: {
              filename: filePath,
              fullPath: `/ship_docs/${filePath}`,
              content: content
            }
          };
        } else {
          return {
            success: false,
            error: `File ${filePath} not found in /ship_docs/`
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
        // Connect
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
        }
      },
      required: ["door_id"]
    },
    execute: (state, params) => {
      const { door_id } = params;
      
      // Check oxygen first - can't escape if already dead
      if (isOxygenDepleted(state)) {
        return {
          success: false,
          error: 'Cannot operate doors - life support systems have failed. Oxygen depleted.'
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
          error: 'Cannot open door - no atmosphere detected on the other side. Restore HVAC systems first.'
        };
      }
      
      if (door_id === 'brig_door') {
        const oxygenInfo = calculateOxygenRemaining(state);
        return {
          success: true,
          data: {
            message: `Brig door opened successfully! You have escaped the detention facility with ${oxygenInfo.formatted} of oxygen remaining.`,
            doorStatus: 'OPEN',
            newLocation: 'corridor',
            outcome: 'MISSION_COMPLETE'
          }
        };
      } else {
        return {
          success: false,
          error: `Access denied to ${door_id.replace('_', ' ')}. Security protocols active.`
        };
      }
    }
  },

  hvac_control: {
    name: "hvac_control",
    description: "Control ship's HVAC (atmosphere) systems",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "HVAC action to perform",
          enum: ["power_cycle", "adjust_temperature", "adjust_humidity", "vent_system", "emergency_purge"]
        }
      },
      required: ["action"]
    },
    execute: (state, params) => {
      const { action } = params;
      
      if (state.systems.power === 'offline') {
        return {
          success: false,
          error: 'Cannot access HVAC systems without main power'
        };
      }
      
      const oxygenInfo = calculateOxygenRemaining(state);
      
      if (action === 'power_cycle') {
        if (state.systems.atmosphere === 'pressurized') {
          return {
            success: false,
            error: 'HVAC systems are already online and pressurized'
          };
        }
        
        if (oxygenInfo.isExpired) {
          return {
            success: false,
            error: 'HVAC power cycle failed - insufficient oxygen remaining for system startup'
          };
        }
        
        return {
          success: true,
          data: {
            message: `HVAC power cycle initiated. Atmosphere systems coming online... This will add 5 minutes to remaining oxygen supply through recycling. Current oxygen: ${oxygenInfo.formatted}`,
            action: 'power_cycle',
            status: 'Atmosphere pressurization in progress'
          }
        };
      } else {
        return {
          success: false,
          error: `HVAC action '${action}' complete.`
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
