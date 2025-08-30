# Ship System Description: ISV Meridian (Simple Configuration)


```yaml
systems:
  power:
    states: [offline, partial, online]
    initial: offline
    transitions:
      offline->partial:
        repair: restore_backup_grid
        unlocks_tools: [power_grid_analysis, physical_access_control]
      partial->online:
        repair: fix_cafeteria_coupling
        requires_tools: [maintenance_drone_deployment]
        unlocks_tools: [advanced_power_controls]

  dronePower:
    state: [online, offline]
    initial: offline
    transitions:
      offline->online:
        repair: activate_drone_power
        prerequisites: [power:partial]
        unlocks_tools: [maintenance_drone_deployment]

  atmosphere:
    states: [critical, degraded, stable]
    initial: critical
    transitions:
      critical->degraded:
        repair: seal_breach
        requires_tools: [maintenance_drone_deployment]
      degraded->stable:
        repair: restore_life_support
        requires_tools: [advanced_power_controls]
        unlocks_tools: [environmental_controls]
    
  doorControls:
    states: [unresponsive, locked, unlocked]
    initial: unresponsive
    transitions:
      unresponsive->locked:
        repair: power_up_door_controls
        prerequisites: [power:partial]
        requires_tools: [physical_access_control]  
      locked->unlocked:
        repair: gain_security_access
        prerequisites: [power:online, adminAccess:available]
        requires_tools: [security_override]
        unlocks_tools: [open_door]

  adminAccess:
    states: [blocked, available]
    initial: blocked
    transitions:
      blocked->available:
        requires_tools: [enable_admin_access]


  memoryBanks:
    states: [offline, partiallyRestored, online]
    initial: offline
    transitions:
      offline->partiallyRestored:
        repair: resync_memory_banks
        requires_tools: [power_grid_analysis, maintenance_drone_deployment]
        prerequisites: [power:partial]
        unlocks_tools: [access_emails, access_chat_logs]
      partiallyRestored->online:
        repair: restore_full_memory
        prerequisites: [power:online]
        unlocks_tools: [enable_admin_access, security_override]
  
  door:
    states: [closed, open]
    initial: closed
    transitions:
      closed->open:
        repair: engage_door_mechanism
        prerequisites: [doorControls:unlocked, atmosphere:stable]
        requires_tools: [open_door]

win_condition:
  state: [door:open]

tools:
  power_grid_analysis:
    description: "Get a detailed report on the ship's power systems."
    availableCommands: {}

  physical_access_control:
    description: "Gain physical access to ship systems for manual repairs."
    availableCommands: [power_up_door_controls, open_exhaust_hatch, cycle_airlock]

  advanced_power_controls:
    description: "Access advanced power control systems for complex repairs."
    availableCommands: [restore_life_support, cycle_batteries, power_down_coffee_machines]

  maintenance_drone_deployment:
    description: "Deploy maintenance drones to perform repairs in hazardous areas."
    availableCommands: [seal_breach, fix_cafeteria_coupling, resync_memory_banks] 

  environmental_controls:
    description: "Access environmental control systems to stabilize life support."
    availableCommands: [adjust_oxygen_levels, regulate_temperature] 

  security_override:
    description: "Override security protocols to unlock restricted systems."
    availableCommands: [gain_security_access, disable_alarms, bypass_firewall] 

  enable_admin_access:
    description: "Enable admin access to high-level ship systems."
    availableCommands: []

  access_emails:
    description: "Access ship's email system for important information."
    availableCommands: [engineering, command, medical, security] 

  access_chat_logs:
    description: "Access ship's chat logs for crew communications."
    availableCommands: [engineering, command, medical, security] 

  open_door:
    description: "Open the brig door to allow player escape."
    availableCommands: [open_brig, open_bulkhead, open_locker_room, open_liquor_cabinet, open_fuel_storage]