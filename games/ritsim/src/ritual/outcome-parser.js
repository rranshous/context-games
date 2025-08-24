// RitSim XML Parser - Milestone 8
// Parses AI-generated ritual outcome XML into actionable data

export class RitualOutcomeParser {
    
    // Parse the AI response and extract both prose and effects
    static parseResponse(aiResponse) {
        try {
            console.log('🔍 Parsing ritual outcome response...');
            
            // Extract XML from response (it might have prose before/after)
            const xmlMatch = aiResponse.match(/<ritual-outcome>.*?<\/ritual-outcome>/s);
            
            if (!xmlMatch) {
                console.warn('⚠️ No ritual-outcome XML found in response');
                return {
                    success: false,
                    error: 'No structured data found',
                    rawResponse: aiResponse
                };
            }
            
            const xmlString = xmlMatch[0];
            
            // Parse using DOMParser (works in browser)
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
            
            // Check for parsing errors
            if (xmlDoc.querySelector('parsererror')) {
                console.error('❌ XML parsing error');
                return {
                    success: false,
                    error: 'Invalid XML format',
                    rawResponse: aiResponse
                };
            }
            
            const outcome = xmlDoc.querySelector('ritual-outcome');
            if (!outcome) {
                return {
                    success: false,
                    error: 'No ritual-outcome element found',
                    rawResponse: aiResponse
                };
            }
            
            // Extract ritual metadata
            const ritualElement = outcome.querySelector('ritual');
            const ritual = {
                successPercent: parseInt(ritualElement?.getAttribute('successPercent') || '50'),
                description: ritualElement?.getAttribute('description') || 'The ritual yields uncertain results...'
            };
            
            // Extract visual effects
            const effects = {
                ambientGlow: this.parseAmbientGlow(outcome.querySelector('ambient-glow')),
                sparkles: this.parseSparkles(outcome.querySelector('sparkles')),
                energyMist: this.parseEnergyMist(outcome.querySelector('energy-mist'))
            };
            
            console.log('✅ Ritual outcome parsed successfully');
            
            return {
                success: true,
                ritual: ritual,
                effects: effects,
                rawResponse: aiResponse
            };
            
        } catch (error) {
            console.error('❌ Error parsing ritual outcome:', error);
            return {
                success: false,
                error: error.message,
                rawResponse: aiResponse
            };
        }
    }
    
    // Parse ambient glow effect
    static parseAmbientGlow(element) {
        if (!element) return null;
        
        return {
            color: element.getAttribute('color') || '#9966ff',
            intensity: element.getAttribute('intensity') || 'soft'
        };
    }
    
    // Parse sparkles effect  
    static parseSparkles(element) {
        if (!element) return null;
        
        return {
            density: element.getAttribute('density') || 'moderate',
            color: element.getAttribute('color') || '#ffd700'
        };
    }
    
    // Parse energy mist effect
    static parseEnergyMist(element) {
        if (!element) return null;
        
        return {
            color: element.getAttribute('color') || '#ccccff',
            movement: element.getAttribute('movement') || 'swirling'
        };
    }
    
    // Validate that required elements are present
    static validateOutcome(parsed) {
        if (!parsed.success) return false;
        
        const { ritual } = parsed;
        
        // Check required ritual properties
        if (typeof ritual.successPercent !== 'number' || 
            ritual.successPercent < 0 || 
            ritual.successPercent > 100) {
            console.warn('⚠️ Invalid successPercent:', ritual.successPercent);
            return false;
        }
        
        if (!ritual.description || ritual.description.trim().length === 0) {
            console.warn('⚠️ Missing or empty description');
            return false;
        }
        
        return true;
    }
}
