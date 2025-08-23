// RitSim - Main Application Entry Point
// Milestone 4: Canvas screenshot capture

import { CanvasRenderer } from './canvas/renderer.js';
import { ObjectManager } from './objects/object-manager.js';
import { ScreenshotCapture } from './screenshot/capture.js';

console.log('🕯️ RitSim initializing...');

let renderer = null;
let objectManager = null;
let screenshotCapture = null;

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
        } else {
            console.log('⚠️ Using placeholder assets for development');
        }
        
        // Initialize object management system (Milestone 3)
        await initializeObjects();
        
        // Initialize screenshot system (Milestone 4)
        initializeScreenshot();
        
        // Set up mouse interaction (Milestone 3)
        setupMouseInteraction();
        
        // Set up screenshot UI (Milestone 4)
        setupScreenshotUI();
        
        // Start render loop
        startRenderLoop();
        
        // Update status for milestone 4
        updateStatusForMilestone4();
        
    } catch (error) {
        console.error('❌ Canvas initialization failed:', error);
        updateStatusForMilestone4(false, error.message);
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
            <p><strong>Objects:</strong> 8 candles (2 of each color), 3 stones, 4 incense placed on table</p>
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

// Initialize screenshot capture system (Milestone 4)
function initializeScreenshot() {
    console.log('📸 Setting up screenshot capture system...');
    
    screenshotCapture = new ScreenshotCapture(renderer);
    
    console.log('✅ Screenshot system ready');
}

// Set up screenshot UI and controls (Milestone 4)
function setupScreenshotUI() {
    // Add screenshot button to the page
    const container = document.querySelector('.container');
    if (!container) return;
    
    const screenshotSection = document.createElement('div');
    screenshotSection.style.cssText = `
        margin: 20px 0;
        text-align: center;
    `;
    
    screenshotSection.innerHTML = `
        <button id="capture-btn" style="
            background: #d4af37;
            color: #1a1a1a;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            margin-right: 10px;
            box-shadow: 0 2px 4px rgba(212, 175, 55, 0.3);
        ">📸 Capture Ritual</button>
        
        <button id="capture-ai-btn" style="
            background: #2a2a2a;
            color: #e0e0e0;
            border: 1px solid #444;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;
        ">🤖 AI Capture</button>
        
        <button id="download-btn" style="
            background: #444;
            color: #e0e0e0;
            border: 1px solid #666;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
        ">💾 Download</button>
    `;
    
    // Insert after canvas container
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
        canvasContainer.insertAdjacentElement('afterend', screenshotSection);
    }
    
    // Set up button event listeners
    document.getElementById('capture-btn').addEventListener('click', async () => {
        try {
            const screenshot = await screenshotCapture.captureCanvas();
            screenshotCapture.displayInDebugPanel();
            console.log('📸 Screenshot captured and displayed');
        } catch (error) {
            console.error('❌ Screenshot failed:', error);
        }
    });
    
    document.getElementById('capture-ai-btn').addEventListener('click', async () => {
        try {
            const screenshot = await screenshotCapture.captureForAI();
            screenshotCapture.displayInDebugPanel();
            console.log('🤖 AI-optimized screenshot captured');
        } catch (error) {
            console.error('❌ AI screenshot failed:', error);
        }
    });
    
    document.getElementById('download-btn').addEventListener('click', () => {
        screenshotCapture.downloadLastScreenshot();
    });
    
    console.log('🖱️ Screenshot UI controls active');
}

function updateStatusForMilestone4(success = true, errorMessage = null) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    if (success) {
        statusEl.className = 'status success';
        statusEl.innerHTML = `
            <h3>✅ Milestone 4 Complete!</h3>
            <p>Canvas screenshot capture system working</p>
            <p><strong>Capture:</strong> PNG and JPEG formats with quality control</p>
            <p><strong>AI Optimization:</strong> Compressed format for AI vision processing</p>
            <p><strong>Debug Display:</strong> Real-time screenshot preview and download</p>
            <p>🎯 Ready for Milestone 5: AI Proxy Infrastructure</p>
        `;
    } else {
        statusEl.className = 'status';
        statusEl.innerHTML = `
            <h3>❌ Milestone 4: Error</h3>
            <p>Screenshot capture system failed to initialize</p>
            ${errorMessage ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ''}
        `;
    }
}

function startRenderLoop() {
    function render() {
        if (renderer) {
            renderer.render(objectManager);
        }
        requestAnimationFrame(render);
    }
    
    console.log('🎬 Starting render loop...');
    render();
}

// Application startup
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 DOM loaded, starting RitSim...');
    
    // Run milestone initialization
    await testConnection();
    await initializeCanvas();
    
    console.log('🚀 RitSim Milestone 4 complete - screenshot capture ready!');
});
