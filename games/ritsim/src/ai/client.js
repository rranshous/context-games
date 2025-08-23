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
