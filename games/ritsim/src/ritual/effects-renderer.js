// Visual Effects Renderer - Milestone 8
// Applies parsed ritual effects to the scene

export class EffectsRenderer {
    constructor() {
        this.activeEffects = new Set();
    }
    
    // Apply all effects from a parsed ritual outcome
    applyRitualEffects(effects) {
        console.log('✨ Applying ritual effects to scene...');
        
        // Clear any existing effects
        this.clearAllEffects();
        
        // Apply each effect type
        if (effects.ambientGlow) {
            this.applyAmbientGlow(effects.ambientGlow);
        }
        
        if (effects.sparkles) {
            this.applySparkles(effects.sparkles);
        }
        
        if (effects.energyMist) {
            this.applyEnergyMist(effects.energyMist);
        }
        
        console.log('🎆 All ritual effects applied');
    }
    
    // Apply ambient glow effect
    applyAmbientGlow(glow) {
        console.log('🌟 Applying ambient glow:', glow);
        
        // Create or update glow overlay
        let glowOverlay = document.getElementById('ambient-glow-overlay');
        if (!glowOverlay) {
            glowOverlay = document.createElement('div');
            glowOverlay.id = 'ambient-glow-overlay';
            glowOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 10;
                transition: all 2s ease-in-out;
            `;
            
            // Add to canvas container
            const canvasContainer = document.getElementById('canvas-container');
            canvasContainer.style.position = 'relative';
            canvasContainer.appendChild(glowOverlay);
        }
        
        // Set glow properties based on intensity
        const intensityMap = {
            'soft': { opacity: 0.3, blur: '20px' },
            'moderate': { opacity: 0.5, blur: '15px' },
            'strong': { opacity: 0.7, blur: '10px' }
        };
        
        const settings = intensityMap[glow.intensity] || intensityMap.soft;
        
        glowOverlay.style.background = `radial-gradient(circle, ${glow.color}22 0%, ${glow.color}11 50%, transparent 100%)`;
        glowOverlay.style.opacity = settings.opacity;
        glowOverlay.style.filter = `blur(${settings.blur})`;
        
        this.activeEffects.add('ambient-glow');
    }
    
    // Apply sparkles effect
    applySparkles(sparkles) {
        console.log('✨ Applying sparkles:', sparkles);
        
        // Create sparkles container
        let sparklesContainer = document.getElementById('sparkles-container');
        if (!sparklesContainer) {
            sparklesContainer = document.createElement('div');
            sparklesContainer.id = 'sparkles-container';
            sparklesContainer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 20;
                overflow: hidden;
            `;
            
            const canvasContainer = document.getElementById('canvas-container');
            canvasContainer.appendChild(sparklesContainer);
        }
        
        // Clear existing sparkles
        sparklesContainer.innerHTML = '';
        
        // Create sparkles based on density
        const densityMap = {
            'few': 8,
            'moderate': 15,
            'many': 25
        };
        
        const sparkleCount = densityMap[sparkles.density] || densityMap.moderate;
        
        for (let i = 0; i < sparkleCount; i++) {
            const sparkle = this.createSparkle(sparkles.color);
            sparklesContainer.appendChild(sparkle);
        }
        
        this.activeEffects.add('sparkles');
    }
    
    // Create individual sparkle element
    createSparkle(color) {
        const sparkle = document.createElement('div');
        sparkle.style.cssText = `
            position: absolute;
            width: 4px;
            height: 4px;
            background: ${color};
            border-radius: 50%;
            box-shadow: 0 0 6px ${color};
            animation: sparkle-float ${3 + Math.random() * 4}s infinite ease-in-out;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            opacity: ${0.6 + Math.random() * 0.4};
        `;
        
        return sparkle;
    }
    
    // Apply energy mist effect
    applyEnergyMist(mist) {
        console.log('🌫️ Applying energy mist:', mist);
        
        // Create mist overlay
        let mistOverlay = document.getElementById('energy-mist-overlay');
        if (!mistOverlay) {
            mistOverlay = document.createElement('div');
            mistOverlay.id = 'energy-mist-overlay';
            mistOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 15;
                opacity: 0.4;
                transition: all 3s ease-in-out;
            `;
            
            const canvasContainer = document.getElementById('canvas-container');
            canvasContainer.appendChild(mistOverlay);
        }
        
        // Set mist properties based on movement
        const movementStyles = {
            'still': 'radial-gradient(ellipse, transparent 20%, COLOR1 50%, transparent 80%)',
            'swirling': 'conic-gradient(from 0deg, transparent, COLOR1, transparent, COLOR2, transparent)',
            'dancing': 'linear-gradient(45deg, transparent 20%, COLOR1 40%, transparent 60%, COLOR2 80%)'
        };
        
        const pattern = movementStyles[mist.movement] || movementStyles.swirling;
        const color1 = mist.color + '66';  // Semi-transparent
        const color2 = mist.color + '33';  // More transparent
        
        const background = pattern.replace('COLOR1', color1).replace('COLOR2', color2);
        mistOverlay.style.background = background;
        
        // Add animation class based on movement
        mistOverlay.className = `energy-mist-${mist.movement}`;
        
        this.activeEffects.add('energy-mist');
    }
    
    // Clear all visual effects
    clearAllEffects() {
        console.log('🧹 Clearing all visual effects...');
        
        const effectIds = [
            'ambient-glow-overlay',
            'sparkles-container', 
            'energy-mist-overlay'
        ];
        
        effectIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.remove();
            }
        });
        
        this.activeEffects.clear();
    }
    
    // Add CSS animations for effects
    static injectEffectStyles() {
        if (document.getElementById('ritual-effects-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'ritual-effects-styles';
        style.textContent = `
            @keyframes sparkle-float {
                0%, 100% { 
                    transform: translateY(0px) scale(1);
                    opacity: 0.8;
                }
                50% { 
                    transform: translateY(-20px) scale(1.2);
                    opacity: 1;
                }
            }
            
            .energy-mist-swirling {
                animation: mist-swirl 8s infinite linear;
            }
            
            .energy-mist-dancing {
                animation: mist-dance 6s infinite ease-in-out;
            }
            
            @keyframes mist-swirl {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes mist-dance {
                0%, 100% { transform: translateX(0px) scaleY(1); }
                25% { transform: translateX(5px) scaleY(1.1); }
                75% { transform: translateX(-5px) scaleY(0.9); }
            }
        `;
        
        document.head.appendChild(style);
    }
}

// Initialize effect styles when module loads
EffectsRenderer.injectEffectStyles();
