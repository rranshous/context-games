// RitSim - Main Application Entry Point
// Milestone 2: Canvas rendering and asset loading

import { CanvasRenderer } from './canvas/renderer.js';

console.log('🕯️ RitSim initializing...');

let renderer = null;

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

// Initialize canvas and rendering system (Milestone 2)
async function initializeCanvas() {
    try {
        console.log('🎨 Initializing canvas rendering system...');
        
        renderer = new CanvasRenderer('ritual-canvas');
        
        // Load all assets
        const assetsLoaded = await renderer.loadAssets();
        
        if (assetsLoaded) {
            console.log('✅ All assets loaded successfully');
            updateStatusForMilestone2(true);
        } else {
            console.log('⚠️ Using placeholder assets for development');
            updateStatusForMilestone2(false);
        }
        
        // Start render loop
        startRenderLoop();
        
    } catch (error) {
        console.error('❌ Canvas initialization failed:', error);
        updateStatusForMilestone2(false, error.message);
    }
}

function updateStatusForMilestone2(success, errorMessage = null) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    if (success) {
        statusEl.className = 'status success';
        statusEl.innerHTML = `
            <h3>✅ Milestone 2 Complete!</h3>
            <p>Canvas rendering and asset loading working</p>
            <p><strong>Assets:</strong> Table background, 4 candles, 3 stones, incense loaded</p>
            <p><strong>Rendering:</strong> 2D pipeline active with asset preview</p>
            <p>🎯 Ready for Milestone 3: Object Placement & Interaction</p>
        `;
    } else {
        statusEl.className = 'status';
        statusEl.innerHTML = `
            <h3>⚠️ Milestone 2: Development Mode</h3>
            <p>Canvas rendering active with placeholder assets</p>
            ${errorMessage ? `<p><strong>Note:</strong> ${errorMessage}</p>` : ''}
            <p>Using generated placeholder sprites for development</p>
        `;
    }
}

function startRenderLoop() {
    function render() {
        if (renderer) {
            renderer.render();
        }
        requestAnimationFrame(render);
    }
    
    console.log('� Starting render loop...');
    render();
}

// Application startup
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 DOM loaded, starting RitSim...');
    
    // Run both milestone 1 and 2 initialization
    await testConnection();
    await initializeCanvas();
    
    console.log('🚀 RitSim Milestone 2 complete - canvas rendering active!');
});
