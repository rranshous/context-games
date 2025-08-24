// AI Client - Frontend interface to AI proxy endpoints
// Milestone 5: AI Proxy Infrastructure

export class AIClient {
    constructor() {
        this.baseUrl = '/api/ai';
        console.log('🤖 AI Client initialized');
    }
    
    // Check AI service status
    async getStatus() {
        try {
            console.log('📊 Checking AI status...');
            const response = await fetch(`${this.baseUrl}/status`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Status check failed');
            }
            
            console.log('📊 AI Status Response:', data);
            return data;
            
        } catch (error) {
            console.error('❌ AI status check failed:', error);
            throw error;
        }
    }
    
    // Test AI connection with hello world
    async testConnection() {
        try {
            console.log('🧪 Testing AI connection...');
            
            const response = await fetch(`${this.baseUrl}/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'AI test failed');
            }
            
            console.log('✅ AI test successful:', data.data.response);
            return data;
            
        } catch (error) {
            console.error('❌ AI test failed:', error);
            throw error;
        }
    }
    
    // Send a message to AI
    async sendMessage(message, systemPrompt = null) {
        try {
            console.log('💭 Sending message to AI:', message.substring(0, 100) + '...');
            
            const response = await fetch(`${this.baseUrl}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    systemPrompt: systemPrompt
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'AI message failed');
            }
            
            console.log('📤 AI response received');
            return data;
            
        } catch (error) {
            console.error('❌ AI message failed:', error);
            throw error;
        }
    }
    
    // Send an image for AI vision analysis
    async analyzeImage(imageData, prompt = null) {
        try {
            console.log('👁️ Sending image to AI for vision analysis...');
            
            // Convert blob to base64 if needed
            let imageBase64;
            if (imageData instanceof Blob) {
                imageBase64 = await this.blobToBase64(imageData);
            } else if (typeof imageData === 'string') {
                // Assume it's already base64 or data URL
                imageBase64 = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
            } else {
                throw new Error('Invalid image data format');
            }
            
            const defaultPrompt = `You are analyzing a ritual table arrangement from above. 
The image shows a mystical table with various ritual objects placed on it:
- Candles (red, blue, purple, white) with flames
- Stones (obsidian, quartz, amethyst) 
- Incense sticks with smoke

Please describe what you see in this ritual arrangement. Focus on:
1. The types and colors of objects present
2. Their spatial relationships and positioning
3. Any patterns, symmetries, or symbolic arrangements
4. The overall energy or intention you sense from the configuration

Provide a mystical interpretation while being specific about what objects you can observe.`;

            const response = await fetch(`${this.baseUrl}/analyze-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageBase64: imageBase64,
                    prompt: prompt || defaultPrompt
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'AI vision analysis failed');
            }
            
            console.log('🔍 AI vision analysis complete');
            return data;
            
        } catch (error) {
            console.error('❌ AI vision analysis failed:', error);
            throw error;
        }
    }
    
    // Interpret ritual with game world context (Milestone 7)
    async interpretRitual(imageData) {
        try {
            console.log('🔮 Sending ritual for magical interpretation...');
            
            // Convert blob to base64 if needed
            let imageBase64;
            if (imageData instanceof Blob) {
                imageBase64 = await this.blobToBase64(imageData);
            } else if (typeof imageData === 'string') {
                // Assume it's already base64 or data URL
                imageBase64 = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
            } else {
                throw new Error('Invalid image data format');
            }
            
            const response = await fetch(`${this.baseUrl}/interpret-ritual`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageBase64: imageBase64
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Ritual interpretation failed');
            }
            
            console.log('🔮 Ritual interpretation complete');
            return data;
            
        } catch (error) {
            console.error('❌ Ritual interpretation failed:', error);
            throw error;
        }
    }
    
    // Convert blob to base64
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                // Remove data URL prefix to get just base64
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    // Check if AI is available and configured
    async isAvailable() {
        try {
            const status = await this.getStatus();
            return status.ai.initialized;
        } catch {
            return false;
        }
    }
}
