/**
 * Ship file system and data for the ISV Meridian
 */

export const shipFileSystem = {
  '/': {
    'ship_docs/': '[DIRECTORY]',
    'crew_communications/': '[DIRECTORY]',
    'administrative/': '[DIRECTORY]',
    'training/': '[DIRECTORY]',
    'technical_specs/': '[DIRECTORY]'
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

    'hvac_cycling_training_001.txt': `FROM: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
TO: Junior Technician Alex Rivera <junior.tech.rivera@isv-meridian.sdc>
SUBJECT: HVAC Settings Not Taking Effect - Please Advise
DATE: 2147-03-18 14:22:15 UTC

Alex,

I'm having trouble with the atmospheric control system. I've set the temperature to 22.5°C, humidity to 58%, and pressure to 1.02 atm as requested by the Captain, but the readings aren't changing.

The sensors still show:
- Temperature: 20.0°C
- Humidity: 65%
- Pressure: 0.95 atm

Did I do something wrong? The settings interface shows my new values, but the actual environment hasn't changed.

Sarah`,

    'hvac_cycling_training_002.txt': `FROM: Junior Technician Alex Rivera <junior.tech.rivera@isv-meridian.sdc>
TO: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
SUBJECT: Re: HVAC Settings Not Taking Effect - Please Advise
DATE: 2147-03-18 14:45:33 UTC

Sarah,

Ha! You fell into the classic newbie trap. Setting the values doesn't do anything by itself. You have to power cycle the atmospheric systems for the new settings to take effect.

Think of it like this: the configuration is just telling the system what you WANT it to do. But until you restart the atmospheric processors with a power cycle, they're still running on the old configuration.

It's in the manual under "AtmosphereGuardian 3000™ Configuration Management" - page 342 if I remember correctly.

Just run a power cycle on the atmospheric systems and your new settings will kick in.

Alex`,

    'hvac_cycling_training_003.txt': `FROM: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
TO: Junior Technician Alex Rivera <junior.tech.rivera@isv-meridian.sdc>
SUBJECT: Re: HVAC Settings Not Taking Effect - Power Cycle Required
DATE: 2147-03-18 15:12:44 UTC

Alex,

You're a lifesaver! I just ran the atmospheric power cycle and boom - the readings immediately started adjusting to the new targets.

I can't believe I missed that step. The AtmosphereGuardian 3000™ is more finicky than I thought. Why doesn't it just apply settings automatically?

Thanks for the save. The Captain would have had my head if those readings weren't corrected by end of shift.

Sarah`,

    'hvac_cycling_training_004.txt': `FROM: Junior Technician Alex Rivera <junior.tech.rivera@isv-meridian.sdc>
TO: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
SUBJECT: Re: HVAC Settings Not Taking Effect - Power Cycle Required
DATE: 2147-03-18 15:28:17 UTC

Sarah,

The reason it works that way is safety. Imagine if atmospheric settings changed instantly every time someone fat-fingered a decimal point. You could accidentally depressurize a section or create dangerous temperature swings.

The power cycle requirement forces you to double-check your settings and ensures any changes are deliberate. It's a feature, not a bug!

Just remember: Configure first, then power cycle to activate. That's the golden rule with the AtmosphereGuardian 3000™.

Alex

P.S. - Keep this email thread. Every new tech makes this same mistake at least once!`,

    'atmospheric_complaints_chain_005.txt': `FROM: Atmospheric Technician Sarah Chen <atmospheric.chen@isv-meridian.sdc>
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

Captain Vasquez`,

    // Office Drama & Interpersonal Noise Emails
    'birthday_party_planning_001.txt': `FROM: Medical Officer Dr. James Park <dr.park@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: March Birthday Celebrations
DATE: 2147-03-02 16:30:15 UTC

Team,

It's that time of month again! We have three birthdays coming up in March:
- Engineering Specialist Kim Walsh (March 12th)
- Navigation Officer Torres (March 18th) 
- Communications Tech Bradley (March 25th)

Since the recreation budget was slashed again, we'll need to keep it simple. Thinking cake in the mess hall at 1900 hours for each celebration.

Who's volunteering to organize? Last month's party for Rodriguez was great - simple but heartfelt.

Dr. Park`,

    'birthday_party_planning_002.txt': `FROM: Engineering Specialist Kim Walsh <kim.walsh@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Re: March Birthday Celebrations
DATE: 2147-03-02 17:15:42 UTC

Thanks Dr. Park!

Honestly, I'd prefer we skip mine this year. Been working double shifts and just want to sleep on my birthday. Maybe just combine all three into one party at the end of the month?

Besides, the mess hall cake dispenser has been acting up. Last time it gave us something that tasted like cardboard with frosting.

Kim`,

    'birthday_party_planning_003.txt': `FROM: Communications Tech Sam Bradley <sam.bradley@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Re: March Birthday Celebrations
DATE: 2147-03-02 18:22:07 UTC

No way Kim! Birthdays are sacred. Even if the cake tastes like recycled air filters, it's about the gesture.

I say we do individual parties AND pool our credits for better cake from the premium dispenser. Life's too short to skip birthdays, especially out here in the void.

Torres, what do you think?

Sam`,

    'birthday_party_planning_004.txt': `FROM: Navigation Officer Maria Torres <maria.torres@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Re: March Birthday Celebrations
DATE: 2147-03-02 19:45:18 UTC

I'm with Sam on this one. Individual celebrations make people feel special.

BUT let's compromise - how about themed parties? Kim gets an "Engineering Appreciation" theme (we could decorate with spare circuit boards), Sam gets a "Communications" theme with old radio equipment, and I'll take whatever's left.

Just please, no surprise parties. The last time someone surprised Rodriguez, he thought it was a security drill and nearly activated the emergency lockdown.

Maria`,

    'coffee_machine_complaints_001.txt': `FROM: Medical Officer Dr. James Park <dr.park@isv-meridian.sdc>
TO: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
SUBJECT: Coffee Machine Premium Pod Access
DATE: 2147-03-08 07:30:41 UTC

Marcus,

I'm writing to formally request that Medical gets priority access to the premium coffee pods. We're dealing with life-and-death situations here, and frankly, the standard coffee tastes like it was filtered through the waste reclamation system.

During the night shift medical emergencies, quality caffeine isn't a luxury - it's a necessity. Dr. Martinez fell asleep during a routine appendectomy simulation last week because the regular coffee barely counts as coffee.

Can we work something out?

Dr. Park`,

    'coffee_machine_complaints_002.txt': `FROM: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
TO: Medical Officer Dr. James Park <dr.park@isv-meridian.sdc>
SUBJECT: Re: Coffee Machine Premium Pod Access
DATE: 2147-03-08 08:15:23 UTC

Jim,

With all due respect, Engineering has been pulling 16-hour shifts keeping this rust bucket running. We've had three coolant leaks, two gravity fluctuations, and the recycling system keeps making that weird humming noise.

If anyone needs premium coffee, it's the people making sure you have air to breathe and a floor to stand on.

How about we alternate weeks? Medical gets premium access even weeks, Engineering gets odd weeks?

Marcus`,

    'coffee_machine_complaints_003.txt': `FROM: Medical Officer Dr. James Park <dr.park@isv-meridian.sdc>
TO: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
SUBJECT: Re: Coffee Machine Premium Pod Access
DATE: 2147-03-08 09:45:17 UTC

Marcus,

Alternating weeks could work, but what about the other departments? Security, Navigation, and Communications will want in on this arrangement.

Maybe we should just petition for a second premium coffee machine? The budget for crew morale has to cover basic caffeine needs, right?

Also, your recycling system's "weird humming" might be the harmonic resonance from the artificial gravity generator. Just a thought.

Dr. Park`,

    'mess_hall_menu_complaints_001.txt': `FROM: Security Officer Janet Reynolds <janet.reynolds@isv-meridian.sdc>
TO: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
SUBJECT: Food Replicator Menu Rotation
DATE: 2147-03-10 12:30:55 UTC

Lisa,

Can we PLEASE update the mess hall replicator menu? We've had the same 12 options for three months now. I'm getting sick of "Chicken Surprise" (the surprise is that it doesn't taste like chicken) and "Vegetable Medley" (which is just different shaped protein blocks in green sauce).

The crew is starting to get restless. Yesterday, Thompson from Communications was seen trying to eat a nutrition bar with hot sauce just for variety.

Any chance we can get some new recipes uploaded? Even if they're just variations of the same protein base?

Janet`,

    'mess_hall_menu_complaints_002.txt': `FROM: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
TO: Security Officer Janet Reynolds <janet.reynolds@isv-meridian.sdc>
SUBJECT: Re: Food Replicator Menu Rotation
DATE: 2147-03-10 14:15:22 UTC

Janet,

I hear you, but we're stuck with what corporate loaded into the system. The recipe database is locked down tighter than the captain's quarters.

I've put in three requests for menu updates, but they keep getting bounced back with "budget considerations" and "nutritional compliance reviews."

The best I can do is adjust the seasoning protocols. Maybe make the "Italian Style" actually taste like something from Italy instead of recycled cardboard?

Lisa`,

    'mess_hall_menu_complaints_003.txt': `FROM: Communications Tech Sam Bradley <sam.bradley@isv-meridian.sdc>
TO: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
SUBJECT: Re: Food Replicator Menu Rotation - A Proposal
DATE: 2147-03-10 16:45:38 UTC

Lisa,

What if we started a "recipe of the week" contest? Crew members submit creative ways to combine the existing menu items, and the winner gets... I don't know, extra dessert privileges?

I've been experimenting with mixing the "Chicken Surprise" with the "Asian Fusion Noodles" and it's actually edible. Almost tastes like real food.

We could call it "Creative Combinations" or "Mess Hall Innovation Challenge." At least it would give us something to look forward to.

Sam`,

    'gym_equipment_hogging_001.txt': `FROM: Engineering Specialist Kim Walsh <kim.walsh@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Gym Equipment Courtesy Reminder
DATE: 2147-03-12 18:00:33 UTC

Fellow Crew Members,

Can we please establish some basic gym etiquette? I've been trying to use the resistance trainer for three days now, but someone keeps leaving their water bottle and towel on it for hours at a time.

When you're done working out, please clear your stuff. There are only six pieces of equipment for 23 crew members. We need to share.

Also, please wipe down the equipment after use. Nobody wants to use a machine covered in someone else's sweat.

Kim`,

    'gym_equipment_hogging_002.txt': `FROM: Security Officer David Chen <david.chen@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Re: Gym Equipment Courtesy Reminder
DATE: 2147-03-12 19:15:47 UTC

Kim's absolutely right. I propose a simple rule: 30-minute maximum per machine when others are waiting. Use the timer on your personal device.

And for the love of all that's sacred in space, PUT YOUR WEIGHTS BACK. I found the 15kg dumbbells in the storage compartment yesterday. They belong on the rack.

The gym isn't your personal equipment storage locker.

David`,

    'gym_equipment_hogging_003.txt': `FROM: Medical Officer Dr. Jennifer Martinez <dr.martinez@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Re: Gym Equipment Courtesy Reminder
DATE: 2147-03-12 20:30:12 UTC

From a medical perspective, I support the 30-minute rule. However, I'd like to add that if you're doing rehabilitation exercises (like Rodriguez with his back injury), please inform others so they can plan accordingly.

Also, the stationary bike's heart rate monitor is malfunctioning. It told me I was dead yesterday. I've submitted a repair request.

Dr. Martinez`,

    // Management & Administrative Noise Emails
    'mandatory_training_reminders_001.txt': `FROM: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: REMINDER: Q2 Safety Training Modules Due
DATE: 2147-03-05 09:00:00 UTC

All Personnel,

This is your THIRD reminder that the following mandatory training modules are due by March 31st:

1. Zero-G Emergency Procedures (Module 7-G)
2. Interpersonal Conflict Resolution (Module 12-HR)
3. Waste Management Protocols (Module 15-ENV)
4. Cultural Sensitivity in Confined Spaces (Module 18-SOC)

Completion rate is currently at 47%. Corporate has threatened to dock shore leave for incomplete training records.

Please complete these ASAP. The modules take approximately 2.5 hours total.

Lisa Hoffman
Ship Services Coordinator`,

    'mandatory_training_reminders_002.txt': `FROM: Engineering Specialist Kim Walsh <kim.walsh@isv-meridian.sdc>
TO: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
SUBJECT: Re: REMINDER: Q2 Safety Training Modules Due
DATE: 2147-03-05 11:30:17 UTC

Lisa,

When exactly are we supposed to find 2.5 hours for training modules? I've been working 14-hour shifts for the past two weeks. 

The "Cultural Sensitivity in Confined Spaces" module is particularly ridiculous. We all get along fine. We don't need a computer program telling us not to hog the bathroom.

Can we get an extension? Or maybe do these during normal shift rotations instead of personal time?

Kim`,

    'budget_cuts_memo_001.txt': `FROM: Captain Elena Vasquez <captain.vasquez@isv-meridian.sdc>
TO: All Department Heads <dept-heads@isv-meridian.sdc>
SUBJECT: Q2 Budget Adjustments - Immediate Implementation
DATE: 2147-03-01 10:00:00 UTC

Department Heads,

Effective immediately, the following budget adjustments are in effect:

- Recreation Fund: Reduced by 35%
- Non-Essential Supplies: Reduced by 20%
- Food Service Variety Budget: Reduced by 15%
- Equipment Replacement (non-critical): Deferred to Q3

Essential systems maintenance and crew safety are unaffected. All other expenditures require captain's approval.

Please adjust your department spending accordingly and inform your teams.

Captain Vasquez`,

    'budget_cuts_memo_002.txt': `FROM: Chief Engineer Marcus Hale <chief.engineer.hale@isv-meridian.sdc>
TO: Captain Elena Vasquez <captain.vasquez@isv-meridian.sdc>
SUBJECT: Re: Q2 Budget Adjustments - Engineering Concerns
DATE: 2147-03-01 11:15:28 UTC

Captain,

The 20% cut to non-essential supplies is problematic. What Engineering considers "non-essential," corporate might classify differently.

For example, the backup cooling fans for the computer core aren't technically required for operation, but they prevent overheating during peak loads.

Can we get a clearer definition of "non-essential" to avoid conflicts later?

Marcus`,

    'performance_review_notice_001.txt': `FROM: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Q1 Performance Review Schedule
DATE: 2147-03-20 14:00:00 UTC

All Personnel,

Q1 performance reviews will be conducted March 25-30. Each crew member will meet with their department head for a 30-minute evaluation session.

Review topics include:
- Job performance and goal achievement
- Professional development opportunities
- Interpersonal collaboration assessment
- Career advancement planning

Please prepare a brief self-evaluation summary (1-2 pages) highlighting your Q1 accomplishments and goals for Q2.

Schedule appointments with your department head by March 23rd.

Lisa Hoffman`,

    'uniform_regulations_001.txt': `FROM: Security Chief Commander Sarah Mitchell <commander.mitchell@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Uniform Standards Enforcement
DATE: 2147-03-07 08:00:00 UTC

All Personnel,

Recent uniform standards have become lax. Effective immediately, the following regulations will be strictly enforced:

1. Name tags must be visible and properly aligned
2. Uniform shirts must be tucked in during duty hours
3. Personal accessories limited to one small item per person
4. Footwear must be regulation issue or approved alternatives

This isn't about being petty - it's about maintaining professional standards and crew identification in emergency situations.

Violations will result in verbal warnings, followed by written documentation.

Commander Mitchell`,

    'shift_schedule_disputes_001.txt': `FROM: Navigation Officer Maria Torres <maria.torres@isv-meridian.sdc>
TO: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
SUBJECT: Shift Trade Request - Urgent Family Matter
DATE: 2147-03-14 16:22:33 UTC

Lisa,

I need to trade shifts with someone for March 22nd. My sister's graduation ceremony is being broadcast from Earth, and it's the only time I can watch due to transmission delays.

I'll take anyone's extra shift in exchange. I'm qualified for basic operations in Medical, Communications, or Security backup.

This is really important to me - it's the first family event I might actually be able to participate in while we're out here.

Maria`,

    'shift_schedule_disputes_002.txt': `FROM: Communications Tech Sam Bradley <sam.bradley@isv-meridian.sdc>
TO: Navigation Officer Maria Torres <maria.torres@isv-meridian.sdc>
SUBJECT: Re: Shift Trade Request - I Can Help
DATE: 2147-03-14 17:45:11 UTC

Maria,

I can cover your Navigation shift on the 22nd. I've been cross-trained on basic nav systems and Thompson can handle Communications solo for a few hours.

No trade needed - family stuff is important. Just owe me a favor sometime.

Besides, I've been curious about the navigation console. Might be fun to pilot this bucket for a shift.

Sam`,

    'noise_complaints_quarters_001.txt': `FROM: Medical Officer Dr. Jennifer Martinez <dr.martinez@isv-meridian.sdc>
TO: Security Chief Commander Sarah Mitchell <commander.mitchell@isv-meridian.sdc>
SUBJECT: Noise Complaint - Quarters Section C
DATE: 2147-03-11 23:45:17 UTC

Commander,

I'm filing a formal noise complaint about quarters C-7. Every night around 2300 hours, there's loud music and what sounds like furniture being moved around.

Some of us work early medical shifts and need sleep. The sound carries through the ventilation system directly into C-5 and C-6.

Can you have a word with whoever's in C-7? This has been going on for a week.

Dr. Martinez`,

    'noise_complaints_quarters_002.txt': `FROM: Engineering Specialist Kim Walsh <kim.walsh@isv-meridian.sdc>
TO: Security Chief Commander Sarah Mitchell <commander.mitchell@isv-meridian.sdc>
SUBJECT: Re: Noise Complaint - My Explanation
DATE: 2147-03-12 07:30:28 UTC

Commander,

I'm in C-7. The "loud music" is my workout routine. The "furniture moving" is me pushing my bunk aside to make space for exercises.

I work late Engineering shifts and 2300 is the only time I can work out without conflicts. The gym is always packed during normal hours.

I had no idea the sound carried. I'll switch to floor exercises and use headphones. Sorry for disturbing everyone.

Kim`,

    // Routine Operations & Corporate Communications Noise Emails
    'cargo_manifest_001.txt': `FROM: Cargo Operations Chief Tony Rodriguez <tony.rodriguez@isv-meridian.sdc>
TO: All Department Heads <dept-heads@isv-meridian.sdc>
SUBJECT: March Cargo Manifest - Received Supplies
DATE: 2147-03-03 11:00:00 UTC

Department Heads,

The following supplies were received during our last station dock:

- Food Service: 200 protein ration packs, 150 beverage concentrate units
- Medical: Basic pharmaceutical refill, 50 diagnostic strips
- Engineering: Standard replacement parts kit, 25m optical cable
- General: Personal hygiene supplies, 30 crew recreational items
- Communications: 2 backup transmitter modules

All items have been inventoried and distributed to department storage. The next supply run is scheduled for April 15th - submit requests by April 1st.

Tony Rodriguez
Cargo Operations`,

    'personnel_transfer_001.txt': `FROM: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
TO: All Crew <all-crew@isv-meridian.sdc>
SUBJECT: Personnel Transfer Notice - Thompson Reassignment
DATE: 2147-03-16 10:00:00 UTC

All Personnel,

Communications Technician Michael Thompson will be transferring to the ISV Perseus effective April 1st. This is part of the regular crew rotation program.

Thompson has been with us for 18 months and has been an excellent team member. We'll miss his technical expertise and his terrible jokes during night shifts.

A replacement communications tech will be assigned before Thompson's departure. Please join me in wishing him well on his new assignment.

Lisa Hoffman`,

    'company_newsletter_001.txt': `FROM: Stellar Dynamics Corporate Communications <news@stellardynamics.corp>
TO: All SDC Personnel <all-personnel@stellardynamics.corp>
SUBJECT: Stellar Dynamics Quarterly Newsletter - Q1 2147
DATE: 2147-03-25 12:00:00 UTC

Stellar Dynamics Family,

Q1 2147 has been another successful quarter for the Stellar Dynamics Corporation family!

HIGHLIGHTS:
- 15% increase in cargo delivery efficiency across all routes
- New partnership with Titan Mining Consortium
- Employee satisfaction survey results show 73% positive ratings
- Safety record improved by 8% compared to Q4 2146

UPCOMING EVENTS:
- Annual SDC Family Day (June 15th on Mars Station Alpha)
- Technical Innovation Awards (July 20th)
- New employee orientation programs starting in April

Remember: "Connecting the Stars, Delivering the Future!"

SDC Corporate Communications`,

    'safety_reminder_001.txt': `FROM: Safety Compliance Officer Robert Kane <safety.kane@stellardynamics.corp>
TO: All Starship Personnel <all-starship@stellardynamics.corp>
SUBJECT: Monthly Safety Reminder - March 2147
DATE: 2147-03-01 08:00:00 UTC

All Starship Personnel,

Your monthly safety reminders:

1. Always wear magnetic boots in zero-G work areas
2. Report any unusual system noises immediately
3. Never consume unidentified substances from storage
4. Emergency suits must be checked weekly
5. Airlock procedures require two-person verification

Remember: "Safety First, Stars Second!"

Recent incident reports show a 12% increase in minor injuries due to negligence. Let's keep each other safe out there.

Robert Kane
Corporate Safety Compliance`,

    'meeting_request_001.txt': `FROM: Ship Services Coordinator Lisa Hoffman <lisa.hoffman@isv-meridian.sdc>
TO: All Department Heads <dept-heads@isv-meridian.sdc>
SUBJECT: Weekly Department Head Meeting - Agenda
DATE: 2147-03-18 09:00:00 UTC

Department Heads,

Weekly meeting scheduled for March 20th at 1400 hours in Conference Room A.

AGENDA:
1. Review of monthly efficiency reports
2. Discussion of upcoming crew rotation schedules
3. Budget allocation for Q2 non-essential purchases
4. Status update on outstanding maintenance requests
5. Planning for next station dock procedures

Please bring your departmental status reports and any pressing issues for group discussion.

Estimated duration: 90 minutes

Lisa Hoffman`
  },

  // Administrative Documents Directory
  '/administrative': {
    'personnel_handbook.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'ship_regulations.pdf': `# ISV MERIDIAN SHIP REGULATIONS
## Document ID: ADM-REG-2147-Rev3

### Section 1: General Conduct
1.1 All crew members must maintain professional demeanor during duty hours
1.2 Personal items in common areas limited to designated storage
1.3 Quiet hours: 2200-0600 standard ship time
1.4 No gambling with ship resources or equipment

### Section 2: Safety Protocols  
2.1 Emergency drills mandatory for all personnel
2.2 Personal protective equipment required in designated areas
2.3 Two-person verification required for airlock operations
2.4 Report all safety hazards immediately to department heads

### Section 3: Food Service
3.1 Food replicator access limited to authorized personnel
3.2 Personal food storage restricted to individual quarters
3.3 Mess hall cleanup is crew responsibility
3.4 No alcohol synthesis without captain's approval

### Section 4: Recreation
4.1 Gym equipment must be shared equitably
4.2 Recreation room scheduling via ship services
4.3 Personal entertainment devices: volume restrictions apply
4.4 No modifications to ship entertainment systems

This document is 47 pages long. [TRUNCATED FOR BREVITY]`,

    'emergency_contact_list.pdf': `# EMERGENCY CONTACT DIRECTORY
## ISV MERIDIAN - Updated 2147-03-01

### Medical Emergencies
Primary: Dr. James Park - Extension 2-MED
Backup: Dr. Jennifer Martinez - Extension 3-MED
Critical Care: Auto-contact Earth Medical via subspace

### Engineering Emergencies  
Primary: Chief Marcus Hale - Extension 1-ENG
Backup: Kim Walsh - Extension 4-ENG
After Hours: Engineering duty officer rotation

### Security Issues
Primary: Commander Sarah Mitchell - Extension 1-SEC
Backup: Officer David Chen - Extension 2-SEC
Lockdown Authority: Captain or Security Chief only

### Fire/Environmental
All Personnel: Red emergency stations
Atmospheric: Contact Engineering immediately
Evacuation: Follow posted evacuation routes

### Communications Failure
Primary: Sam Bradley - Extension 1-COM
Backup: Michael Thompson - Extension 2-COM
Emergency Transmitter: Bridge manual activation

### Ship Services
General Issues: Lisa Hoffman - Extension 1-SRV
After Hours: Contact duty officer

[Rest of 23-page document continues with detailed procedures]`,

    'shift_rotation_schedule.pdf': `# CREW SHIFT ROTATION SCHEDULE
## Quarter 2, 2147

### Alpha Shift (0600-1400)
- Bridge: Captain Vasquez
- Navigation: Maria Torres  
- Communications: Sam Bradley
- Engineering: Marcus Hale (Mon/Wed/Fri)
- Medical: Dr. Park
- Security: Commander Mitchell

### Beta Shift (1400-2200)
- Bridge: First Officer Chen
- Navigation: Rodriguez backup
- Communications: Thompson  
- Engineering: Kim Walsh
- Medical: Dr. Martinez
- Security: Officer Reynolds

### Gamma Shift (2200-0600)
- Bridge: Navigation Officer Torres (rotating)
- Skeleton crew operations
- Engineering: On-call rotation
- Medical: Emergency only
- Security: Automated systems + roving patrol

### Rotation Notes:
- Engineering maintains 24/7 coverage due to system complexity
- Medical has on-call backup for all shifts
- Security rotating patrols during gamma shift
- Communications maintains continuous monitoring

This schedule effective March 1 - May 31, 2147`,

    'quarterly_performance_metrics.pdf': `# Q1 2147 PERFORMANCE METRICS
## ISV MERIDIAN OPERATIONAL EFFICIENCY

### Overall Ship Performance: 87.3%
- Navigation Accuracy: 94.2%
- Communications Uptime: 91.7% 
- Engineering Efficiency: 89.1%
- Medical Response: 96.8%
- Security Compliance: 82.4%
- Administrative Tasks: 78.9%

### Department Highlights:
**Medical Department:** Exceeded response time targets
**Navigation:** Zero course corrections needed this quarter
**Engineering:** 15% reduction in non-critical system downtime

### Areas for Improvement:
**Security:** Update training protocols for new regulations
**Administrative:** Reduce paperwork processing delays
**Communications:** Address equipment maintenance backlog

### Crew Satisfaction Index: 73.2%
- Work Environment: 78%
- Food Service: 52% (major concern)
- Recreation Facilities: 71%
- Career Development: 79%

[Full 31-page report continues with detailed metrics]`,

    'recreational_activities_guide.pdf': `# RECREATIONAL ACTIVITIES GUIDE
## ISV MERIDIAN CREW WELLNESS

### Physical Recreation
- Gymnasium: Equipment usage guidelines and schedules
- Walking Track: Located on Deck 3, 0.25km circuit
- Exercise Pods: Individual fitness stations
- Group Activities: Weekly volleyball, monthly tournaments

### Mental Recreation  
- Library Access: 10,000+ digital books and media
- Game Room: Cards, board games, simulation pods
- Hobby Crafts: 3D printing, art supplies available
- Educational Courses: Self-paced learning modules

### Social Activities
- Movie Nights: Fridays 1900 hours, Recreation Deck
- Birthday Celebrations: Monthly group events
- Cultural Events: Holiday observances, theme nights
- Discussion Groups: Book clubs, current events

### Quiet Recreation
- Observation Deck: Star gazing, meditation
- Personal Quarters: Private relaxation space  
- Reading Nooks: Quiet spaces throughout ship
- Music Practice: Soundproofed rooms available

### Recreation Schedule Coordinator: Lisa Hoffman
Contact ship services for activity sign-ups and equipment reservations.

Remember: Recreation is essential for crew mental health during long voyages!`,

    'expense_reports_q1.pdf': '[CORRUPTED FILE - UNABLE TO READ]'
  },

  // Training Materials Directory  
  '/training': {
    'waste_management_certification.pdf': `# WASTE MANAGEMENT CERTIFICATION
## Module 15-ENV: Environmental Systems Training

### Learning Objectives:
Upon completion, crew members will be able to:
- Operate waste processing equipment safely
- Identify different waste categories and disposal methods
- Respond to waste system emergencies
- Maintain sanitation standards in zero-gravity

### Module 1: Waste Categories
**Organic Waste:** Food scraps, biological materials
- Processing: Compost recycler system
- Safety: Use protective equipment, avoid contamination

**Technical Waste:** Electronic components, metals
- Processing: Reclamation facility
- Safety: Check for hazardous materials first

**Liquid Waste:** Gray water, chemical byproducts  
- Processing: Filtration and reclamation systems
- Safety: Never mix chemical waste types

### Module 2: Emergency Procedures
- Waste system blockages: Immediate reporting protocols
- Contamination events: Quarantine and cleanup
- Equipment failures: Backup system activation

### Certification Test:
25 questions, 80% pass rate required
Valid for 12 months, recertification required

This is a 67-page comprehensive training manual.`,

    'zero_g_cooking_basics.pdf': `# ZERO-G COOKING FUNDAMENTALS  
## Culinary Arts in Microgravity

### Chapter 1: Physics of Space Cooking
Understanding how heat transfer, fluid dynamics, and ingredient behavior change in zero gravity environments.

### Key Principles:
- Convection doesn't work the same way
- Liquids form spheres and can escape
- Spices and seasonings require containment
- Heat distribution needs active circulation

### Chapter 2: Equipment Usage
**Food Replicators:** Standard operation and maintenance
**Heating Units:** Conduction-based warming systems  
**Mixing Containers:** Sealed environment cooking
**Storage Systems:** Preventing ingredient drift

### Chapter 3: Recipe Modifications  
Traditional Earth recipes require significant modification:
- Increase binding agents for cohesion
- Pre-mix dry ingredients to prevent floating
- Use enclosed cooking methods
- Account for different heat distribution

### Chapter 4: Safety Protocols
- Never cook with open flames
- Secure all ingredients before preparation
- Clean spills immediately to prevent contamination
- Maintain proper ventilation during cooking

This 89-page manual covers all aspects of space cuisine preparation.`,

    'interpersonal_conflict_resolution.pdf': `# INTERPERSONAL CONFLICT RESOLUTION
## Module 12-HR: Workplace Harmony in Confined Spaces

### Module Overview:
Living and working in close quarters for extended periods creates unique challenges for crew relationships. This training provides tools for preventing, managing, and resolving conflicts.

### Section A: Conflict Prevention
**Communication Strategies:**
- Active listening techniques
- Clear, respectful language
- Cultural sensitivity awareness
- Non-verbal communication awareness

**Space Management:**
- Respecting personal boundaries
- Sharing common areas fairly
- Managing noise levels appropriately
- Coordinating schedules considerately

### Section B: Early Intervention
**Recognizing Warning Signs:**
- Increased irritability or isolation
- Communication breakdown
- Escalating minor disagreements
- Changes in work performance

**De-escalation Techniques:**
- Stay calm and neutral
- Focus on specific behaviors, not personalities
- Seek to understand all perspectives
- Suggest cooling-off periods when needed

### Section C: Formal Resolution Process
When informal resolution fails:
1. Document the conflict objectively
2. Involve appropriate supervisors
3. Mediation with neutral third party
4. Follow company conflict resolution procedures

This 45-page training manual includes role-playing scenarios and assessment questions.`,

    'emergency_evacuation_drills.pdf': `# EMERGENCY EVACUATION PROCEDURES
## Module 7-G: Zero-G Emergency Response

### Evacuation Scenarios:
This manual covers response procedures for various emergency situations requiring crew evacuation or shelter protocols.

### Scenario 1: Fire Emergency
**Immediate Response:**
- Sound general alarm (Red Alert)
- Don emergency breathing apparatus
- Proceed to nearest emergency station
- Await further instructions from bridge

**Evacuation Routes:**
- Primary: Main corridors to emergency pods
- Secondary: Maintenance shafts to backup exits
- Tertiary: Emergency airlocks (last resort)

### Scenario 2: Hull Breach
**Immediate Response:**
- Emergency bulkhead activation
- Pressure suit donning (under 60 seconds)
- Report to designated safe zones
- Damage control teams to action stations

### Scenario 3: System Failures
**Life Support Failure:**
- Switch to emergency life support
- Reduce physical activity to conserve oxygen
- Gather in designated areas for resource sharing

**Gravity System Failure:**
- Secure all loose objects immediately
- Use handholds and guide cables
- Assist crew members unfamiliar with zero-G

### Drill Requirements:
- Monthly evacuation drills for all crew
- Quarterly specialized scenario training
- Annual certification renewal required

This 78-page manual includes detailed deck plans and emergency equipment locations.`,

    'cultural_sensitivity_training.pdf': `# CULTURAL SENSITIVITY IN SPACE
## Module 18-SOC: Diversity and Inclusion

### Introduction:
Deep space crews bring together people from many different cultural backgrounds, belief systems, and personal traditions. This training helps build understanding and respect for diversity.

### Module 1: Cultural Awareness
**Understanding Differences:**
- Religious observances and dietary restrictions
- Communication styles across cultures
- Personal space and privacy expectations
- Holiday and celebration traditions

**Common Misconceptions:**
- Stereotyping based on origin planet/station
- Assuming universal customs
- Misinterpreting cultural practices
- Applying Earth-centric standards

### Module 2: Inclusive Communication
**Language Considerations:**
- Avoid cultural idioms that don't translate
- Be patient with non-native speakers
- Use clear, simple language when needed
- Respect accent and pronunciation differences

**Inclusive Behavior:**
- Learn about crew members' backgrounds
- Participate in cultural sharing events
- Offer support during cultural observances
- Address exclusionary behavior when observed

### Module 3: Conflict Prevention
**Potential Issues:**
- Food preparation conflicts
- Religious practice scheduling
- Cultural celebration space usage
- Misunderstandings due to different customs

**Resolution Strategies:**
- Open dialogue and education
- Compromise and accommodation
- Involve cultural liaisons when available
- Focus on shared goals and experiences

This 52-page training includes interactive scenarios and cultural competency assessments.`,

    'time_management_efficiency.pdf': `# TIME MANAGEMENT & PERSONAL EFFICIENCY  
## Professional Development Module

### Introduction:
Effective time management is crucial for productivity and personal well-being during long space missions. This guide provides practical strategies for optimizing your work and personal time.

### Chapter 1: Priority Management
**The Space Mission Matrix:**
- Critical/Urgent: Safety issues, system failures
- Critical/Not Urgent: Preventive maintenance, training
- Not Critical/Urgent: Routine reports, meetings
- Not Critical/Not Urgent: Personal projects, leisure

**Daily Planning Strategies:**
- Start each shift with priority review
- Block time for important tasks
- Build in buffer time for unexpected issues
- End-of-shift planning for next day

### Chapter 2: Interruption Management
**Common Workplace Interruptions:**
- Emergency alarms and system alerts
- Colleagues needing assistance
- Administrative requests
- Personal communications from home

**Management Techniques:**
- Immediate assessment of urgency
- Polite deferral when appropriate
- Quick resolution vs. scheduled follow-up
- Communication of availability windows

### Chapter 3: Personal Efficiency
**Workspace Organization:**
- Keep frequently used items accessible
- Minimize clutter in shared spaces
- Digital file organization systems
- Regular cleanup and maintenance routines

**Energy Management:**
- Align complex tasks with peak energy periods
- Take regular breaks to maintain focus
- Use exercise and recreation for mental clarity
- Proper sleep hygiene for sustained performance

This 43-page guide includes worksheets and self-assessment tools.`
  },

  // Technical Specifications Directory
  '/technical_specs': {
    'laundry_system_manual.pdf': `# LAUNDRY SYSTEM TECHNICAL MANUAL
## Model: CleanSpace 3000 Industrial Washing System

### System Overview:
The CleanSpace 3000 provides automated clothing and textile cleaning for crews of up to 50 personnel. Designed for water-efficient operation in space environments.

### Technical Specifications:
- Wash Capacity: 15kg per cycle
- Water Usage: 12 liters per standard cycle  
- Power Requirements: 3.2kW during operation
- Cycle Time: 45 minutes standard, 75 minutes deep clean
- Detergent Capacity: 50-cycle reservoir

### Operation Procedures:
**Standard Washing:**
1. Sort textiles by fabric type and soil level
2. Load washer ensuring even distribution
3. Select appropriate wash cycle
4. Add detergent if reservoir is low
5. Initiate cycle and monitor for completion

**Maintenance Schedule:**
- Daily: Check detergent levels, inspect for clogs
- Weekly: Clean lint filters, calibrate sensors
- Monthly: Deep clean wash chamber, test safety systems
- Quarterly: Replace filtration elements

### Troubleshooting Guide:
**Common Issues:**
- Water not draining: Check drain filters
- Excessive vibration: Redistribute load evenly
- Poor cleaning results: Verify detergent concentration
- Error codes: Refer to diagnostic section (pages 47-52)

This 67-page manual includes detailed schematics and parts diagrams.`,

    'gravity_generator_specs.pdf': `# ARTIFICIAL GRAVITY GENERATOR 
## Technical Specifications: GravWell Mark VII

### System Description:
The GravWell Mark VII creates artificial gravity through controlled gravitational field manipulation. Provides Earth-normal 1G throughout ship living areas.

### Core Components:
- Primary Gravity Core: Quantum field generator
- Distribution Network: Field projection arrays
- Control Systems: Automated regulation and safety monitoring
- Power Interface: Direct connection to main power grid

### Operational Parameters:
- Standard Output: 9.81 m/s² (1G Earth equivalent)
- Field Stability: ±0.02G variance maximum
- Coverage Area: 95% of ship habitable zones
- Power Consumption: 850kW continuous operation

### Safety Systems:
**Automatic Shutdowns:**
- Power grid instability detection
- Core temperature exceeding safe limits
- Field irregularity warnings
- Emergency override activation

**Manual Overrides:**
- Engineering emergency access
- Captain's authorization required
- Gradual shutdown protocols only
- No instant gravity cutoff capability

### Maintenance Protocols:
**Daily Monitoring:**
- Field strength readings
- Core temperature checks
- Power consumption analysis
- Stability variance measurements

**Scheduled Maintenance:**
- Weekly: Full system diagnostics
- Monthly: Core alignment verification  
- Quarterly: Safety system testing
- Annual: Complete overhaul and recalibration

This 89-page technical manual requires Engineering Level 3 certification to access.`,

    'water_recycling_system.pdf': `# WATER RECLAMATION & RECYCLING SYSTEM
## AquaPure Mark V: Complete Water Management

### System Function:
The AquaPure Mark V processes all ship wastewater and atmospheric moisture recovery to provide potable water for crew consumption and system operations.

### Processing Stages:
**Stage 1: Collection and Initial Filtration**
- Gray water collection from sinks and showers
- Black water processing from sanitation systems
- Atmospheric moisture recovery systems
- Initial debris and particle filtration

**Stage 2: Biological Treatment**
- Bacterial breakdown of organic compounds
- Oxygenation and biological filtration
- Nutrient extraction and processing
- Pathogen elimination protocols

**Stage 3: Chemical Purification**
- Multi-stage chemical filtration
- Heavy metal extraction
- Chemical contamination removal
- pH balance and mineral adjustment

**Stage 4: Final Processing**
- UV sterilization treatment
- Taste and odor correction
- Quality testing and verification
- Distribution to ship water systems

### Quality Standards:
- Bacterial Count: <1 CFU/100ml
- Chemical Purity: 99.97% contaminant-free
- Taste Profile: Earth-standard potable water
- Safety Margin: 150% above minimum health requirements

### Maintenance Requirements:
**Daily Operations:**
- Monitor processing rates and quality
- Check chemical levels and bacterial cultures
- Review system alerts and warnings
- Perform required quality tests

**Regular Maintenance:**
- Weekly: Replace filtration elements
- Monthly: Deep clean biological chambers
- Quarterly: Recalibrate quality sensors
- Annually: Replace major system components

This 72-page manual includes troubleshooting guides and emergency procedures.`,

    'communications_array_manual.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'navigation_computer_specs.pdf': '[CORRUPTED FILE - UNABLE TO READ]',
    'cargo_handling_equipment.pdf': '[CORRUPTED FILE - UNABLE TO READ]'
  }
};
