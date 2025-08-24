// AI Service - Handles Claude API communication
// Milestone 5: AI Proxy Infrastructure

import Anthropic from '@anthropic-ai/sdk';

class AIService {
    constructor() {
        this.anthropic = null;
        this.isInitialized = false;
        this.initializeClient();
    }
    
    initializeClient() {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            console.warn('⚠️ ANTHROPIC_API_KEY not found in environment variables');
            console.log('💡 Create a .env file with your API key for AI functionality');
            return;
        }
        
        try {
            this.anthropic = new Anthropic({
                apiKey: apiKey,
            });
            
            this.isInitialized = true;
            console.log('🤖 Claude AI service initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Claude AI service:', error.message);
        }
    }
    
    // Test connection with a simple hello world message
    async testConnection() {
        if (!this.isInitialized) {
            throw new Error('AI service not initialized - check API key');
        }
        
        try {
            console.log('🧪 Testing Claude API connection...');
            
            const message = await this.anthropic.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 100,
                messages: [{
                    role: "user",
                    content: "Hello! Please respond with a brief greeting to confirm the connection is working."
                }]
            });
            
            const response = message.content[0].text;
            console.log('✅ Claude API test successful:', response);
            
            return {
                success: true,
                response: response,
                model: message.model,
                usage: message.usage
            };
            
        } catch (error) {
            console.error('❌ Claude API test failed:', error.message);
            throw error;
        }
    }
    
    // Send a basic text message to Claude
    async sendMessage(content, systemPrompt = null) {
        if (!this.isInitialized) {
            throw new Error('AI service not initialized - check API key');
        }
        
        try {
            const requestConfig = {
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                messages: [{
                    role: "user",
                    content: content
                }]
            };
            
            if (systemPrompt) {
                requestConfig.system = systemPrompt;
            }
            
            console.log('💭 Sending message to Claude...');
            
            const message = await this.anthropic.messages.create(requestConfig);
            
            const response = message.content[0].text;
            console.log('📤 Claude response received');
            
            return {
                success: true,
                response: response,
                model: message.model,
                usage: message.usage
            };
            
        } catch (error) {
            console.error('❌ Claude message failed:', error.message);
            throw error;
        }
    }
    
        // Send an image to Claude for vision analysis (future milestone)
    async analyzeImage(imageBase64, prompt = "What do you see in this image?") {
        if (!this.isInitialized) {
            throw new Error('AI service not initialized - check API key');
        }
        
        try {
            console.log('👁️ Sending image to Claude for analysis...');
            
            const message = await this.anthropic.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1000,
                messages: [{
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: prompt
                        },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/jpeg",
                                data: imageBase64
                            }
                        }
                    ]
                }]
            });
            
            const response = message.content[0].text;
            console.log('🔍 Claude image analysis complete');
            
            return {
                success: true,
                response: response,
                model: message.model,
                usage: message.usage
            };
            
        } catch (error) {
            console.error('❌ Claude image analysis failed:', error.message);
            throw error;
        }
    }
    
    // Interpret ritual arrangement with game context (Milestone 7)
    async interpretRitual(imageBase64, magicMechanics) {
        if (!this.isInitialized) {
            throw new Error('AI service not initialized - check API key');
        }
        
        try {
            console.log('🔮 Sending ritual for magical interpretation...');
            
            const ritualPrompt = `You are a mystical interpreter analyzing a ritual arrangement in the RitSim universe. 

GAME WORLD CONTEXT:
${magicMechanics}

RESPONSE FORMAT:
You must respond with BOTH prose description AND structured XML markup in this exact format:

<ritual-outcome>
  <ritual successPercent="[0-100]" description="[flowing prose about the ritual outcome and magical effects]"/>
  <ambient-glow color="[hex color]" intensity="[soft|moderate|strong]"/>
  <sparkles density="[few|moderate|many]" color="[hex color]"/>
  <energy-mist color="[hex color]" movement="[still|swirling|dancing]"/>
</ritual-outcome>

TASK:
Examine this ritual table arrangement and provide a mystical interpretation based on the magic mechanics described above. 

For the XML elements:
- ritual successPercent: 0-100 based on elemental balance, geometry, and harmony
- ritual description: Flowing atmospheric prose describing the magical outcome
- ambient-glow: Overall magical atmosphere tint (use mystical colors)
- sparkles: Celebratory magical energy (gold/white for success, darker for failure)
- energy-mist: Swirling magical energy (color should match dominant elements)

Consider the elemental forces, geometric patterns, and sympathetic correspondences. Generate both the mystical interpretation AND the structured effects that would manifest.

The ritual practitioner awaits your wisdom...`;

            const message = await this.anthropic.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1500,
                messages: [{
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: ritualPrompt
                        },
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: "image/jpeg",
                                data: imageBase64
                            }
                        }
                    ]
                }]
            });
            
            const response = message.content[0].text;
            console.log('🔮 Ritual interpretation complete');
            
            return {
                success: true,
                response: response,
                model: message.model,
                usage: message.usage
            };
            
        } catch (error) {
            console.error('❌ Ritual interpretation failed:', error.message);
            throw error;
        }
    }
    
    // Get service status
    getStatus() {
        return {
            initialized: this.isInitialized,
            hasApiKey: !!process.env.ANTHROPIC_API_KEY,
            model: "claude-sonnet-4-20250514"
        };
    }
}

// Export singleton instance
export const aiService = new AIService();
