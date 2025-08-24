// RitSim - Main Application Entry Point
// Milestone 8: Structured AI Response Format

import { CanvasRenderer } from './canvas/renderer.js';
import { ObjectManager } from './objects/object-manager.js';
import { ScreenshotCapture } from './screenshot/capture.js';
import { AIClient } from './ai/client.js';
import { RitualOutcomeParser } from './ritual/outcome-parser.js';
import { EffectsRenderer } from './ritual/effects-renderer.js';

console.log('🕯️ RitSim initializing...');

let renderer = null;
let objectManager = null;
let screenshotCapture = null;
let aiClient = null;
let effectsRenderer = null;

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
        
        // Initialize AI client (Milestone 5)
        initializeAI();
        
        // Set up mouse interaction (Milestone 3)
        setupMouseInteraction();
        
        // Set up screenshot UI (Milestone 4)
        setupScreenshotUI();
        
        // Set up AI UI (Milestone 5)
        await setupAIUI();
        
        // Start render loop
        startRenderLoop();
        
        // Update status for milestone 8
        updateStatusForMilestone8();
        
    } catch (error) {
        console.error('❌ Canvas initialization failed:', error);
        updateStatusForMilestone8(false, error.message);
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
        
        <button id="vision-analyze-btn" style="
            background: #4a2a7a;
            color: #e0e0e0;
            border: 1px solid #6a4a9a;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;
            box-shadow: 0 2px 4px rgba(106, 74, 154, 0.3);
        ">👁️ Analyze Ritual</button>
        
        <button id="ritual-interpret-btn" style="
            background: #7a2a4a;
            color: #e0e0e0;
            border: 1px solid #9a4a6a;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;
            box-shadow: 0 2px 4px rgba(154, 74, 106, 0.3);
        ">🔮 Interpret Ritual</button>
        
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
    
    // Vision analysis button (Milestone 6)
    document.getElementById('vision-analyze-btn').addEventListener('click', async () => {
        try {
            console.log('👁️ Starting vision analysis...');
            
            // Capture image for vision analysis
            const visionData = await screenshotCapture.captureForVision();
            screenshotCapture.displayInDebugPanel();
            
            // Show analysis in progress
            const visionPanel = createVisionResponsePanel();
            const contentDiv = visionPanel.querySelector('#vision-content');
            const metaDiv = visionPanel.querySelector('#vision-meta');
            
            contentDiv.textContent = 'Analyzing ritual arrangement...';
            contentDiv.style.color = '#b794d4';
            metaDiv.textContent = 'Processing image with Claude AI...';
            
            // Send to AI for analysis
            const result = await aiClient.analyzeImage(visionData.base64);
            
            console.log('🔍 Raw AI result:', result);
            console.log('🔍 Response data:', result.data);
            console.log('🔍 Response text:', result.data?.response);
            
            // Display results
            displayVisionAnalysis(result.data.response, result.data.usage);
            
            console.log('🔍 Vision analysis complete');
            
        } catch (error) {
            console.error('❌ Vision analysis failed:', error);
            displayVisionAnalysis(`Error: ${error.message}`, null, true);
        }
    });
    
    // Ritual interpretation button (Milestone 7)
    document.getElementById('ritual-interpret-btn').addEventListener('click', async () => {
        try {
            console.log('🔮 Starting ritual interpretation...');
            
            // Capture image for ritual interpretation
            const visionData = await screenshotCapture.captureForVision();
            screenshotCapture.displayInDebugPanel();
            
            // Show interpretation in progress
            const visionPanel = createVisionResponsePanel();
            const contentDiv = visionPanel.querySelector('#vision-content');
            const metaDiv = visionPanel.querySelector('#vision-meta');
            
            contentDiv.textContent = 'Consulting the mystical arts...';
            contentDiv.style.color = '#d4af37';
            metaDiv.textContent = 'Interpreting ritual with magical knowledge...';
            
            // Send to AI for ritual interpretation with game context
            const result = await aiClient.interpretRitual(visionData.base64);
            
            console.log('🔮 Raw ritual result:', result);
            console.log('🔮 Interpretation:', result.data?.response);
            
            // Parse the structured XML response (Milestone 8)
            const parsedOutcome = RitualOutcomeParser.parseResponse(result.data.response);
            
            if (parsedOutcome.success && RitualOutcomeParser.validateOutcome(parsedOutcome)) {
                console.log('✅ Parsed ritual outcome:', parsedOutcome);
                
                // Apply visual effects to scene
                effectsRenderer.applyRitualEffects(parsedOutcome.effects);
                
                // Display the prose description in vision panel
                displayVisionAnalysis(parsedOutcome.ritual.description, result.data.usage);
                
                // Show success percentage in meta area
                const metaDiv = document.querySelector('#vision-meta');
                if (metaDiv) {
                    metaDiv.innerHTML = `
                        <div>🔮 Ritual Success: ${parsedOutcome.ritual.successPercent}%</div>
                        <div>Tokens: ${result.data.usage?.input_tokens || 0} in, ${result.data.usage?.output_tokens || 0} out</div>
                        <div>Model: claude-sonnet-4-20250514</div>
                    `;
                }
            } else {
                console.warn('⚠️ Failed to parse structured response, falling back to raw display');
                displayVisionAnalysis(result.data.response, result.data.usage);
            }
            
            console.log('🔮 Ritual interpretation complete');
            
        } catch (error) {
            console.error('❌ Ritual interpretation failed:', error);
            displayVisionAnalysis(`Error: ${error.message}`, null, true);
        }
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

// Initialize AI client system (Milestone 5)
function initializeAI() {
    console.log('🤖 Setting up AI client system...');
    
    aiClient = new AIClient();
    effectsRenderer = new EffectsRenderer();
    
    console.log('✅ AI client and effects renderer ready');
}

// Set up AI UI and controls (Milestone 5)
async function setupAIUI() {
    console.log('🎨 Setting up AI UI...');
    
    // Check AI status first
    let aiStatus = null;
    let statusError = null;
    try {
        aiStatus = await aiClient.getStatus();
        console.log('✅ AI status check successful:', aiStatus);
    } catch (error) {
        console.warn('⚠️ Could not check AI status:', error.message);
        statusError = error.message;
    }
    
    // Add AI section to the page
    const container = document.querySelector('.container');
    if (!container) return;
    
    const aiSection = document.createElement('div');
    aiSection.id = 'ai-section';
    aiSection.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        background: #2a2a2a;
        border: 1px solid #444;
        border-radius: 8px;
        text-align: center;
    `;
    
    // Insert after screenshot section
    const screenshotSection = container.querySelector('div[style*="margin: 20px 0"]');
    if (screenshotSection) {
        screenshotSection.insertAdjacentElement('afterend', aiSection);
    }
    
    // Update AI UI with current status
    updateAIUI(aiStatus, statusError);
    
    console.log('🖱️ AI UI controls ready');
}

function updateAIUI(aiStatus, statusError = null) {
    const aiSection = document.getElementById('ai-section');
    if (!aiSection) return;
    
    const isConfigured = aiStatus?.ai?.initialized || false;
    const statusColor = isConfigured ? '#4a9' : '#aa4';
    const statusText = isConfigured ? 'AI Ready' : 'API Key Required';
    
    let debugInfo = '';
    if (statusError) {
        debugInfo = `<div style="color: #a44; font-size: 12px; margin-top: 5px;">Error: ${statusError}</div>`;
    } else if (aiStatus) {
        debugInfo = `
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                Has API Key: ${aiStatus.ai?.hasApiKey ? 'Yes' : 'No'} | 
                Initialized: ${aiStatus.ai?.initialized ? 'Yes' : 'No'} | 
                Model: ${aiStatus.ai?.model || 'Unknown'}
            </div>
        `;
    }
    
    aiSection.innerHTML = `
        <h3 style="color: ${statusColor}; margin: 0 0 10px 0;">🤖 ${statusText}</h3>
        
        <button id="ai-refresh-btn" style="
            background: #333;
            color: #e0e0e0;
            border: 1px solid #555;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            margin-right: 10px;
        ">🔄 Refresh Status</button>
        
        <button id="ai-test-btn" style="
            background: #4a4a4a;
            color: #e0e0e0;
            border: 1px solid #666;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            margin-right: 10px;
            ${isConfigured ? '' : 'opacity: 0.5; cursor: not-allowed;'}
        " ${isConfigured ? '' : 'disabled'}>🧪 Test Connection</button>
        
        <button id="ai-message-btn" style="
            background: #4a4a4a;
            color: #e0e0e0;
            border: 1px solid #666;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            ${isConfigured ? '' : 'opacity: 0.5; cursor: not-allowed;'}
        " ${isConfigured ? '' : 'disabled'}>💬 Send Test Message</button>
        
        <div id="ai-response" style="
            margin-top: 10px;
            padding: 10px;
            background: #1a1a1a;
            border-radius: 4px;
            text-align: left;
            font-family: monospace;
            font-size: 12px;
            color: #ccc;
            max-height: 150px;
            overflow-y: auto;
            display: none;
        "></div>
        
        ${debugInfo}
        
        ${!isConfigured ? `
        <div style="margin-top: 10px; font-size: 12px; color: #999;">
            Create .env file with ANTHROPIC_API_KEY to enable AI functionality
        </div>
        ` : ''}
    `;
    
    // Set up event listeners
    setupAIEventListeners(isConfigured);
}

function setupAIEventListeners(isConfigured) {
    // Refresh status button (always enabled)
    document.getElementById('ai-refresh-btn').addEventListener('click', async () => {
        console.log('🔄 Refreshing AI status...');
        
        let aiStatus = null;
        let statusError = null;
        try {
            aiStatus = await aiClient.getStatus();
            console.log('✅ Status refresh successful');
        } catch (error) {
            console.error('❌ Status refresh failed:', error);
            statusError = error.message;
        }
        
        updateAIUI(aiStatus, statusError);
    });
    
    // Only set up other buttons if AI is configured
    if (!isConfigured) return;
    
    document.getElementById('ai-test-btn').addEventListener('click', async () => {
        const responseDiv = document.getElementById('ai-response');
        responseDiv.style.display = 'block';
        responseDiv.textContent = 'Testing AI connection...';
        
        try {
            const result = await aiClient.testConnection();
            responseDiv.innerHTML = `
                <div style="color: #4a9;">✅ Test Successful</div>
                <div style="margin-top: 5px;">${result.data.response}</div>
                <div style="margin-top: 5px; color: #666;">
                    Model: ${result.data.model} | 
                    Tokens: ${result.data.usage?.input_tokens || 0} in, ${result.data.usage?.output_tokens || 0} out
                </div>
            `;
        } catch (error) {
            responseDiv.innerHTML = `
                <div style="color: #a44;">❌ Test Failed</div>
                <div style="margin-top: 5px;">${error.message}</div>
            `;
        }
    });
    
    document.getElementById('ai-message-btn').addEventListener('click', async () => {
        const responseDiv = document.getElementById('ai-response');
        responseDiv.style.display = 'block';
        responseDiv.textContent = 'Sending test message...';
        
        try {
            const result = await aiClient.sendMessage(
                'Please describe what you know about ritual practices and mystical traditions in a brief, atmospheric way.'
            );
            responseDiv.innerHTML = `
                <div style="color: #4a9;">✅ Message Successful</div>
                <div style="margin-top: 5px;">${result.data.response}</div>
                <div style="margin-top: 5px; color: #666;">
                    Model: ${result.data.model} | 
                    Tokens: ${result.data.usage?.input_tokens || 0} in, ${result.data.usage?.output_tokens || 0} out
                </div>
            `;
        } catch (error) {
            responseDiv.innerHTML = `
                <div style="color: #a44;">❌ Message Failed</div>
                <div style="margin-top: 5px;">${error.message}</div>
            `;
        }
    });
}

function updateStatusForMilestone5(success = true, errorMessage = null) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    if (success) {
        statusEl.className = 'status success';
        statusEl.innerHTML = `
            <h3>✅ Milestone 5 Complete!</h3>
            <p>AI Proxy Infrastructure working</p>
            <p><strong>Backend:</strong> Claude API integration with Anthropic SDK</p>
            <p><strong>Endpoints:</strong> Status, test connection, and message processing</p>
            <p><strong>Frontend:</strong> AI client with error handling and UI controls</p>
            <p>🎯 Ready for Milestone 6: Vision Processing & Debug Display</p>
        `;
    } else {
        statusEl.className = 'status';
        statusEl.innerHTML = `
            <h3>❌ Milestone 5: Error</h3>
            <p>AI proxy system failed to initialize</p>
            ${errorMessage ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ''}
        `;
    }
}

// Create or get vision response panel (Milestone 6)
function createVisionResponsePanel() {
    let panel = document.getElementById('vision-response');
    if (panel) return panel;
    
    panel = document.createElement('div');
    panel.id = 'vision-response';
    panel.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        width: 400px;
        max-height: 600px;
        background: rgba(20, 20, 20, 0.95);
        border: 2px solid #6a4a9a;
        border-radius: 12px;
        padding: 20px;
        color: #e0e0e0;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 1001;
        overflow-y: auto;
        box-shadow: 0 8px 24px rgba(106, 74, 154, 0.4);
    `;
    
    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <h3 style="margin: 0; color: #b794d4;">👁️ Ritual Vision Analysis</h3>
            <button id="close-vision" style="
                background: none;
                border: none;
                color: #888;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
            ">×</button>
        </div>
        <div id="vision-content" style="
            line-height: 1.6;
            white-space: pre-wrap;
        "></div>
        <div id="vision-meta" style="
            margin-top: 15px;
            padding-top: 15px;
            border-top: 1px solid #444;
            font-size: 12px;
            color: #888;
        "></div>
    `;
    
    // Add close functionality
    panel.querySelector('#close-vision').addEventListener('click', () => {
        panel.remove();
    });
    
    document.body.appendChild(panel);
    return panel;
}

// Display vision analysis results (Milestone 6)
function displayVisionAnalysis(response, usage = null, isError = false) {
    const panel = createVisionResponsePanel();
    const contentDiv = panel.querySelector('#vision-content');
    const metaDiv = panel.querySelector('#vision-meta');
    
    if (isError) {
        contentDiv.style.color = '#ff7f7f';
        contentDiv.textContent = response;
        metaDiv.textContent = 'Analysis failed';
    } else {
        contentDiv.style.color = '#e0e0e0';
        contentDiv.textContent = response;
        
        if (usage) {
            metaDiv.innerHTML = `
                <div>✨ Analysis complete</div>
                <div>Tokens: ${usage.input_tokens || 0} in, ${usage.output_tokens || 0} out</div>
                <div>Model: claude-sonnet-4-20250514</div>
            `;
        } else {
            metaDiv.textContent = '✨ Analysis complete';
        }
    }
}

function updateStatusForMilestone8(success = true, errorMessage = null) {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    
    if (success) {
        statusEl.className = 'status success';
        statusEl.innerHTML = `
            <h3>✅ Milestone 8 Complete!</h3>
            <p>Structured AI Response Format working</p>
            <p><strong>XML Format:</strong> AI returns parseable ritual outcome markup</p>
            <p><strong>Visual Effects:</strong> Ambient glow, sparkles, and energy mist</p>
            <p><strong>Parser:</strong> Extracts both prose and structured effect data</p>
            <p>🎯 Ready for Milestone 9: Scene Rendering from AI Description</p>
        `;
    } else {
        statusEl.className = 'status';
        statusEl.innerHTML = `
            <h3>❌ Milestone 8: Error</h3>
            <p>Structured response system failed to initialize</p>
            ${errorMessage ? `<p><strong>Error:</strong> ${errorMessage}</p>` : ''}
        `;
    }
}

// Start render loop
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
    
    console.log('🚀 RitSim Milestone 8 complete - structured AI response format ready!');
});
