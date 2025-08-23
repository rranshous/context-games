// RitSim - Main Application Entry Point
// Milestone 1: Basic infrastructure and canvas setup

console.log('🕯️ RitSim initializing...');

// Test API connection
async function testConnection() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        console.log('✅ Server connection:', data);
        
        // Update status on page
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.className = 'status success';
            statusEl.innerHTML = `
                <h3>✅ Milestone 1 Complete!</h3>
                <p>Backend foundation and static serving working</p>
                <p><strong>Server:</strong> ${data.message}</p>
            `;
        }
    } catch (error) {
        console.error('❌ Server connection failed:', error);
    }
}

// Initialize canvas (preparation for Milestone 2)
function initializeCanvas() {
    const canvas = document.getElementById('ritual-canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Basic canvas test - draw a simple placeholder
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw placeholder text
    ctx.fillStyle = '#666';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Ritual Table Coming Soon...', canvas.width / 2, canvas.height / 2);
    
    console.log('🎨 Canvas initialized for future development');
}

// Application startup
document.addEventListener('DOMContentLoaded', () => {
    console.log('📱 DOM loaded, starting RitSim...');
    
    testConnection();
    initializeCanvas();
    
    console.log('🚀 RitSim Milestone 1 complete - ready for development!');
});
