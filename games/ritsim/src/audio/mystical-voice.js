// Mystical Voice Narration System
// Uses HTML5 SpeechSynthesis API for ritual interpretation audio

export class MysticalVoice {
    constructor() {
        this.isEnabled = false;
        this.currentUtterance = null;
        this.settings = {
            rate: 0.7,        // Slower, more mystical pace
            pitch: 0.8,       // Slightly lower pitch for atmosphere
            volume: 0.8,      // Controlled volume
            voice: null       // Will be set to best available voice
        };
        
        this.initializeVoices();
        this.loadSettings();
    }
    
    // Initialize and find the best mystical voice
    initializeVoices() {
        if (!('speechSynthesis' in window)) {
            console.warn('🎭 SpeechSynthesis not supported in this browser');
            return;
        }
        
        // Wait for voices to load (they load asynchronously)
        const setVoices = () => {
            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                // Voices not loaded yet, try again
                setTimeout(setVoices, 100);
                return;
            }
            
            this.selectMysticalVoice(voices);
        };
        
        // Set voices immediately if available, or wait for them to load
        if (speechSynthesis.getVoices().length > 0) {
            setVoices();
        } else {
            speechSynthesis.addEventListener('voiceschanged', setVoices);
        }
    }
    
    // Select the most mystical-sounding voice
    selectMysticalVoice(voices) {
        console.log('🎭 Available voices:', voices.map(v => `${v.name} (${v.lang})`));
        
        // First filter to only English voices
        const englishVoices = voices.filter(voice => 
            voice.lang.startsWith('en-') || voice.lang === 'en'
        );
        
        console.log('🎭 English voices:', englishVoices.map(v => `${v.name} (${v.lang})`));
        
        if (englishVoices.length === 0) {
            console.warn('🎭 No English voices found, using default');
            this.settings.voice = voices[0] || null;
            return;
        }
        
        // Preference order for mystical voices (English only)
        const preferences = [
            // Look for dramatic/deep voices first
            voice => voice.name.toLowerCase().includes('deep'),
            voice => voice.name.toLowerCase().includes('dramatic'),
            voice => voice.name.toLowerCase().includes('ceremonial'),
            
            // Then prefer female voices (often sound more mystical)
            voice => voice.name.toLowerCase().includes('female') || 
                    voice.name.toLowerCase().includes('woman'),
            
            // Then any English voice with good quality indicators
            voice => voice.localService,
            
            // Fallback to first English voice
            voice => true
        ];
        
        for (const preference of preferences) {
            const voice = englishVoices.find(preference);
            if (voice) {
                this.settings.voice = voice;
                console.log('🎭 Selected mystical voice:', voice.name);
                break;
            }
        }
    }
    
    // Load settings from localStorage
    loadSettings() {
        try {
            const saved = localStorage.getItem('ritsim-voice-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.isEnabled = settings.enabled || false;
                Object.assign(this.settings, settings.voice || {});
            }
        } catch (error) {
            console.warn('🎭 Could not load voice settings:', error);
        }
    }
    
    // Save settings to localStorage
    saveSettings() {
        try {
            const settings = {
                enabled: this.isEnabled,
                voice: {
                    rate: this.settings.rate,
                    pitch: this.settings.pitch,
                    volume: this.settings.volume,
                    voiceName: this.settings.voice?.name
                }
            };
            localStorage.setItem('ritsim-voice-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('🎭 Could not save voice settings:', error);
        }
    }
    
    // Speak ritual interpretation text
    speakRitualInterpretation(text) {
        if (!this.isEnabled || !this.isSupported()) {
            return;
        }
        
        // Stop any current speech
        this.stop();
        
        console.log('🎭 Speaking ritual interpretation...');
        
        // Create utterance with mystical settings
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.settings.rate;
        utterance.pitch = this.settings.pitch;
        utterance.volume = this.settings.volume;
        
        if (this.settings.voice) {
            utterance.voice = this.settings.voice;
        }
        
        // Add mystical pauses for dramatic effect
        const mysticalText = this.addMysticalPauses(text);
        utterance.text = mysticalText;
        
        // Event handlers
        utterance.onstart = () => {
            console.log('🎭 Mystical narration began');
            this.currentUtterance = utterance;
        };
        
        utterance.onend = () => {
            console.log('🎭 Mystical narration complete');
            this.currentUtterance = null;
        };
        
        utterance.onerror = (event) => {
            console.error('🎭 Mystical narration error:', event.error);
            this.currentUtterance = null;
        };
        
        // Speak the mystical interpretation
        speechSynthesis.speak(utterance);
    }
    
    // Add dramatic pauses to text for mystical effect
    addMysticalPauses(text) {
        return text
            // Add pause after introductory phrases
            .replace(/(The|As|Behold|Lo,)/g, '$1...')
            // Add pause before important mystical terms
            .replace(/(energy|power|magic|ritual|sacred|divine)/gi, '...$1')
            // Add pause around percentages for emphasis
            .replace(/(\d+%)/g, '...$1...')
            // Add pause at sentence endings for drama
            .replace(/\./g, '...');
    }
    
    // Stop current speech
    stop() {
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
            this.currentUtterance = null;
            console.log('🎭 Mystical narration stopped');
        }
    }
    
    // Check if speech synthesis is supported
    isSupported() {
        return 'speechSynthesis' in window;
    }
    
    // Toggle voice narration on/off
    toggle() {
        this.isEnabled = !this.isEnabled;
        this.saveSettings();
        
        if (!this.isEnabled) {
            this.stop();
        }
        
        console.log(`🎭 Mystical voice ${this.isEnabled ? 'enabled' : 'disabled'}`);
        return this.isEnabled;
    }
    
    // Get current settings for UI display
    getSettings() {
        return {
            enabled: this.isEnabled,
            supported: this.isSupported(),
            currentVoice: this.settings.voice?.name || 'Default',
            currentVoiceName: this.settings.voice?.name,
            rate: this.settings.rate,
            pitch: this.settings.pitch,
            volume: this.settings.volume
        };
    }
    
    // Set voice by name
    setVoiceByName(voiceName) {
        const voices = speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === voiceName);
        
        if (voice) {
            this.settings.voice = voice;
            this.saveSettings();
            console.log('🎭 Voice changed to:', voice.name);
        } else {
            console.warn('🎭 Voice not found:', voiceName);
        }
    }
    
    // Update voice settings
    updateSettings(newSettings) {
        Object.assign(this.settings, newSettings);
        this.saveSettings();
    }
    
    // Test the current voice with a sample phrase
    testVoice() {
        if (!this.isSupported()) {
            console.warn('🎭 Speech synthesis not supported');
            return;
        }
        
        this.speakRitualInterpretation("The mystical energies swirl around your sacred arrangement, revealing hidden patterns of power and wisdom.");
    }
}
