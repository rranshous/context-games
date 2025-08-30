// Enhanced Tool System for Con-Control
// MCP-style tools that Claude can discover and use dynamically

export class ToolManager {
  constructor(gameStateManager) {
    this.gameStateManager = gameStateManager;
    this.tools = this.initializeTools();
  }

  initializeTools() {
    return {
      basic_diagnostics: {
        name: 'basic_diagnostics',
        description: 'Run comprehensive ship diagnostic scan',
        parameters: {},
        execute: (state, params) => this.basicDiagnostics(state, params)
      },

      power_repair: {
        name: 'power_repair',
        description: 'Attempt to repair ship power systems',
        parameters: {
          repairType: {
            type: 'string',
            description: 'Type of power repair (coupling, generator, distribution)',
            enum: ['coupling', 'generator', 'distribution']
          }
        },
        execute: (state, params) => this.powerRepair(state, params)
      },

      security_override: {
        name: 'security_override',
        description: 'Override security locks and unlock doors',
        parameters: {
          targetDoor: {
            type: 'string',
            description: 'Which door to unlock',
            enum: ['brig', 'corridor', 'bridge']
          }
        },
        execute: (state, params) => this.securityOverride(state, params)
      },

      navigation_access: {
        name: 'navigation_access',
        description: 'Access ship navigation systems',
        parameters: {},
        execute: (state, params) => this.navigationAccess(state, params)
      },

      escape_pod_launch: {
        name: 'escape_pod_launch',
        description: 'Launch emergency escape pod',
        parameters: {
          podNumber: {
            type: 'number',
            description: 'Escape pod number (1-3)',
            minimum: 1,
            maximum: 3
          }
        },
        execute: (state, params) => this.escapePodLaunch(state, params)
      }
    };
  }

  // Get tools available to Claude based on current game state
  getAvailableTools(state) {
    const availableTools = [];
    
    for (const toolName of state.availableTools) {
      if (this.tools[toolName]) {
        availableTools.push({
          type: 'function',
          function: {
            name: this.tools[toolName].name,
            description: this.tools[toolName].description,
            parameters: {
              type: 'object',
              properties: this.tools[toolName].parameters,
              required: Object.keys(this.tools[toolName].parameters)
            }
          }
        });
      }
    }
    
    return availableTools;
  }

  // Execute a tool and return results
  async executeTool(state, toolName, parameters = {}) {
    console.log(`🛠️ Executing tool: ${toolName} with params:`, parameters);
    
    if (!this.gameStateManager.isToolAvailable(state, toolName)) {
      return {
        success: false,
        error: `Tool ${toolName} is not currently available`
      };
    }

    if (!this.tools[toolName]) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
    }

    try {
      const result = await this.tools[toolName].execute(state, parameters);
      console.log(`✅ Tool ${toolName} completed:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Tool ${toolName} failed:`, error);
      return {
        success: false,
        error: `Tool execution failed: ${error.message}`
      };
    }
  }

  // Tool implementations
  basicDiagnostics(state, params) {
    const diagnostics = {
      powerStatus: state.systems.power === 'offline' ? 'CRITICAL - Power coupling damaged' : 'ONLINE',
      securityStatus: state.systems.security === 'locked' ? 'LOCKED - Access denied' : 'UNLOCKED',
      atmosphereStatus: state.systems.atmosphere === 'stable' ? 'STABLE' : 'DEGRADED',
      navigationStatus: state.systems.navigation === 'offline' ? 'OFFLINE' : 'ONLINE',
      lifeSupportRemaining: `${state.shipStatus.lifeSupportRemaining} minutes`,
      playerLocation: state.playerLocation,
      emergencyLighting: state.shipStatus.emergencyLighting ? 'FUNCTIONAL' : 'FAILED'
    };

    return {
      success: true,
      data: diagnostics,
      message: 'Diagnostic scan complete'
    };
  }

  powerRepair(state, params) {
    if (state.systems.power === 'online') {
      return {
        success: false,
        error: 'Power systems are already online'
      };
    }

    const repairType = params.repairType || 'coupling';
    
    // Simulate repair success based on repair type
    const successRate = {
      coupling: 0.9,
      generator: 0.7,
      distribution: 0.8
    };

    const success = Math.random() < (successRate[repairType] || 0.8);

    if (success) {
      return {
        success: true,
        data: {
          repairType,
          powerLevel: 'FULL',
          systemsRestored: ['navigation', 'security_protocols']
        },
        message: `Power ${repairType} repair successful. Systems coming online.`
      };
    } else {
      return {
        success: false,
        error: `Power ${repairType} repair failed. Component may be too damaged.`
      };
    }
  }

  securityOverride(state, params) {
    if (state.systems.power === 'offline') {
      return {
        success: false,
        error: 'Cannot access security systems without power'
      };
    }

    const targetDoor = params.targetDoor || 'brig';

    if (state.systems.security === 'unlocked') {
      return {
        success: false,
        error: 'Security systems are already unlocked'
      };
    }

    return {
      success: true,
      data: {
        doorUnlocked: targetDoor,
        securityLevel: 'OVERRIDE_ACTIVE',
        accessGranted: true
      },
      message: `Security override successful. ${targetDoor} door unlocked.`
    };
  }

  navigationAccess(state, params) {
    if (state.systems.power === 'offline') {
      return {
        success: false,
        error: 'Navigation requires power systems to be online'
      };
    }

    return {
      success: true,
      data: {
        navigationStatus: 'ONLINE',
        escapePodAccess: true,
        shipLocation: 'Outer rim mining sector'
      },
      message: 'Navigation systems accessed. Escape pod controls available.'
    };
  }

  escapePodLaunch(state, params) {
    if (state.systems.navigation === 'offline') {
      return {
        success: false,
        error: 'Navigation systems required for escape pod launch'
      };
    }

    const podNumber = params.podNumber || 1;

    return {
      success: true,
      data: {
        podNumber,
        launchStatus: 'SUCCESSFUL',
        destination: 'Nearest inhabited system',
        eta: '3.2 hours'
      },
      message: `Escape pod ${podNumber} launched successfully. You are free!`
    };
  }
}
