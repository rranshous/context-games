/**
 * Ship file system and data for the ISV Meridian
 */

export const shipFileSystem = {
  '/': {
    'ship_docs/': '[DIRECTORY]',
    'crew_communications/': '[DIRECTORY]'
  },
  '/ship_docs': {
    'meridian_pr_release.md': `# FOR IMMEDIATE RELEASE

**Stellar Dynamics Corporation Unveils Revolutionary ISV Meridian: The Future of Deep Space Operations**

*Advanced vessel combines cutting-edge technology with unparalleled safety features for extended mission profiles*

**NEW GENEVA SPACEPORT** - Stellar Dynamics Corporation (SDC) today announced the completion and deployment of the ISV Meridian, a next-generation Interstellar Service Vehicle designed to redefine deep space logistics and personnel transport. This magnificent vessel represents the pinnacle of modern spacecraft engineering, featuring breakthrough innovations that will transform how humanity approaches long-duration space operations.

"The Meridian isn't just a ship - it's a testament to human ingenuity and our commitment to pushing the boundaries of what's possible," said Marketing Director Jennifer Walsh-Chen. "Every system on this vessel has been designed with our crew's safety and mission success as the top priority."

## Revolutionary Power Management

The Meridian features SDC's proprietary **TrinaryFlow Power Distribution System™**, which intelligently routes energy through three independent grids for maximum reliability. Unlike traditional dual-redundancy systems, TrinaryFlow creates a web of interconnected pathways that can adapt to any failure scenario.

"What makes TrinaryFlow special is its innovative routing through unconventional ship sections," explained Chief Marketing Engineer Brad Morrison. "By threading power conduits through cargo bay junctions and maintenance corridors, we've created multiple backup pathways that most engineers wouldn't even think to use. It's genius-level redundancy!"

The system's crown jewel is the **Smart Junction Control Matrix**, which automatically detects power fluctuations and reroutes energy faster than any human operator could respond. Three color-coded grids (Alpha-Red for primary grid, Beta-Yellow for secondary, and Gamma-Green for emergency) connect via junction nodes to provide maintenance crews with intuitive access points throughout the ship to keep power flowing up to the main grid for maximum efficiency!

## Life Support Excellence  

Environmental controls aboard the Meridian utilize SDC's **AtmosphereGuardian 3000™** technology, featuring molecular-level atmosphere processing and real-time contamination detection. The system's distributed sensor network ensures perfect air quality in every compartment, from the expansive cargo holds to the intimate crew quarters.

"Safety is paramount," notes Safety Compliance Officer Maria Santos-Rodriguez. "That's why we've installed triple-sealed emergency bulkheads with independent pressure monitoring. If there's ever a breach, AtmosphereGuardian can isolate and repressurize any section of the ship within minutes."

## Security & Personnel Management

The Meridian incorporates military-grade security protocols through the **SecureSpace Personnel Management Suite™**. Advanced biometric scanners and behavioral analysis algorithms ensure only authorized personnel can access sensitive areas. The ship's detention facilities meet all Interstellar Maritime Authority standards while maintaining humane conditions for temporary custody situations.

"Our detention brig isn't just secure - it's smart," explains Security Systems Analyst Tom Richardson. "Environmental controls, communication systems, and emergency protocols are all integrated to ensure the safety and dignity of any individuals in temporary custody."

## Technical Specifications
- Length: 847 meters
- Crew Complement: 12-48 personnel (mission dependent)  
- Power Output: 2.4 Terawatt distributed capacity
- Life Support: 90-day independent operation capability
- AI Systems: IRIS-class autonomous operation support`,

    'trinaryflow_manual.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'power_grid_schematics.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'junction_matrix_guide.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'maintenance_procedures.txt': '[CORRUPTED FILE - UNABLE TO READ]',
    'emergency_protocols.md': '[CORRUPTED FILE - UNABLE TO READ]',
    'system_diagnostics_log.txt': '[CORRUPTED FILE - UNABLE TO READ]'
  },
  '/crew_communications': {
    'emails/': '[DIRECTORY]'
  },
  '/crew_communications/emails': {
    'atmospheric_complaints_chain_001.txt': `FROM: Captain Elena Vasquez <captain.vasquez@isv-meridian.sdc>
TO: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
SUBJECT: Atmospheric Controls - Urgent Adjustment Needed
DATE: 2147-03-15 08:45:22 UTC

Marcus,

I've been monitoring the atmospheric readings in the command center and they're simply unacceptable. The temperature has been fluctuating wildly - it was 24.8°C this morning and now it's dropped to 21.2°C. My coffee is getting cold before I can finish it!

Please have the atmospheric tech look into this immediately. I prefer the temperature to be maintained at a steady 22.5°C. That's the Goldilocks zone for optimal concentration and comfort.

Also, while you're at it, the humidity levels have been creeping up. I don't want to feel like I'm breathing underwater. Keep it around 55-60%.

Regards,
Captain Vasquez`,

    'atmospheric_complaints_chain_002.txt': `FROM: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
TO: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
SUBJECT: Re: Atmospheric Controls - Urgent Adjustment Needed
DATE: 2147-03-15 09:12:17 UTC

Sarah,

Captain's on the warpath again about the atmospheric controls. She wants:

- Temperature: 22.5°C (steady, no fluctuations)
- Humidity: 55-60%

Current readings show we're at 21.2°C and 68% humidity. That's way off target.

Please adjust the systems accordingly. Let's avoid another captain's log entry about "unacceptable environmental conditions."

Marcus`,

    'atmospheric_complaints_chain_003.txt': `FROM: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
TO: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
SUBJECT: Re: Atmospheric Controls - Urgent Adjustment Needed
DATE: 2147-03-15 09:45:33 UTC

Chief,

I've made the initial adjustments:
- Set temperature target to 22.5°C
- Set humidity target to 58%

But I noticed the pressure readings are also off. We're currently at 0.95 atm, which is below optimal. The captain mentioned in our last maintenance briefing that she prefers pressure around 1.02 atm for that "just right" feeling.

Should I adjust that as well?

Sarah`,

    'atmospheric_complaints_chain_004.txt': `FROM: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
TO: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
SUBJECT: Re: Atmospheric Controls - Urgent Adjustment Needed
DATE: 2147-03-15 10:02:41 UTC

Sarah,

Good catch on the pressure. Yes, adjust it to 1.02 atm as the captain prefers.

Also, double-check that we're not introducing any contaminants. The captain's very particular about air quality.

Marcus`,

    'atmospheric_complaints_chain_005.txt': `FROM: Atmospheric Technician Sarah Chen <chief.engineer.hale@isv-meridian.sdc>
TO: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
SUBJECT: Atmospheric System Calibration Complete
DATE: 2147-03-15 10:28:19 UTC

Chief,

All adjustments made:
- Temperature: 22.5°C ✓
- Humidity: 58% ✓  
- Pressure: 1.02 atm ✓

Air quality sensors show no contaminants. Systems are stabilizing now.

The captain should be much happier with these settings.

Sarah`,

    'atmospheric_complaints_chain_006.txt': `FROM: Captain Elena Vasquez <captain.vasquez@isv-meridian.sdc>
TO: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
SUBJECT: Re: Atmospheric Controls - Much Better
DATE: 2147-03-15 11:15:07 UTC

Marcus,

Thank you for the prompt attention to the atmospheric controls. The conditions are much more comfortable now. Please ensure these settings are maintained as our standard configuration:

- Temperature: 22.5°C
- Humidity: 58%
- Pressure: 1.02 atm

This is exactly what I was looking for. Excellent work.

Captain Vasquez`
  }
};
