// RitSim - Main Application Entry Point
// Milestone 3: Object placement and interaction

import { CanvasRenderer } from './canvas/renderer.js';
import { ObjectMafunction startRenderLoop() {
    function render() {
        if (renderer) {
            renderer.render(objectManager);
        }
        requestAnimationFrame(render);
    }
    
    console.log('🎬 Starting render loop...');
    render();
}m './objects/object-manager.js';

console.log('🕯️ RitSim initializing...');

let renderer = null;
let objectManager = null;

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
        
        // Initialize object management system (Milestone 3)
        await initializeObjects();
        
        // Set up mouse interaction (Milestone 3)
        setupMouseInteraction();
        
        // Start render loop
        startRenderLoop();
        
        // Update status for milestone 3
        updateStatusForMilestone3();
        
    } catch (error) {
        console.error('❌ Canvas initialization failed:', error);
        updateStatusForMilestone3(false, error.message);
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

// Initialize object management and place objects (Milestone 3)
async function initializeObjects() {
    console.log('🎪 Setting up object management system...');
    
    objectManager = new ObjectManager(renderer);
    objectManager.initializeObjects();
    
    console.log('✨ All objects placed on the ritual table');
}

// Set up mouse event handling (Milestone 3)
function setupMouseInteraction() {
    const canvas = renderer.canvas;
    
    canvas.addEventListener('mousedown', (e) => {
        if (objectManager) {
            objectManager.onMouseDown(e.clientX, e.clientY);
        }
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (objectManager) {
            objectManager.onMouseMove(e.clientX, e.clientY);
        }
    });
    
    canvas.addEventListener('mouseup', (e) => {
        if (objectManager) {
            objectManager.onMouseUp(e.clientX, e.clientY);
        }
    });
    
    // Add cursor styling
    canvas.style.cursor = 'grab';
    
    canvas.addEventListener('mousedown', () => {
        canvas.style.cursor = 'grabbing';
    });
    
    canvas.addEventListener('mouseup', () => {
        canvas.style.cursor = 'grab';
    });
    
    console.log('🖱️ Mouse interaction system active');
}

function updateStatusForMilestone3(success = true, errorMessage = null) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    if (success) {
        statusEl.className = 'status success';
        statusEl.innerHTML = `
            <h3>✅ Milestone 3 Complete!</h3>
            <p>Object placement and interaction system working</p>
            <p><strong>Objects:</strong> 4 candles, 3 stones, 1 incense placed on table</p>
            <p><strong>Interaction:</strong> Click and drag to arrange ritual objects</p>
            <p><strong>Boundaries:</strong> Objects constrained to table surface</p>
            <p>🎯 Ready for Milestone 4: Canvas Screenshot Capture</p>
        `;
    } else {
        statusEl.className = 'status';
        statusEl.innerHTML = `
            <h3>❌ Milestone 3: Error</h3>
            <p>Object interaction system failed to initialize</p>
            ${errorMessage ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ''}
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
