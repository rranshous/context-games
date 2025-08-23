// Screenshot Capture - Handles canvas image capture for AI processing
// Milestone 4: Canvas screenshot capture

export class ScreenshotCapture {
    constructor(renderer) {
        this.renderer = renderer;
        this.lastScreenshot = null;
        this.lastScreenshotUrl = null;
        
        console.log('📸 Screenshot capture system initialized');
    }
    
    // Capture the current canvas state as an image
    async captureCanvas(format = 'png', quality = 0.95) {
        try {
            console.log('📸 Capturing ritual table screenshot...');
            
            const canvas = this.renderer.canvas;
            
            // Clean up previous screenshot URL to prevent memory leaks
            if (this.lastScreenshotUrl) {
                URL.revokeObjectURL(this.lastScreenshotUrl);
            }
            
            // Capture canvas as blob for better performance and flexibility
            const blob = await new Promise((resolve) => {
                if (format === 'jpeg') {
                    canvas.toBlob(resolve, 'image/jpeg', quality);
                } else {
                    canvas.toBlob(resolve, 'image/png');
                }
            });
            
            // Store the screenshot data
            this.lastScreenshot = blob;
            this.lastScreenshotUrl = URL.createObjectURL(blob);
            
            console.log(`✅ Screenshot captured: ${blob.size} bytes as ${format}`);
            
            return {
                blob: blob,
                url: this.lastScreenshotUrl,
                size: blob.size,
                format: format,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('❌ Screenshot capture failed:', error);
            throw error;
        }
    }
    
    // Capture as data URL (for inline display)
    captureAsDataURL(format = 'png', quality = 0.95) {
        try {
            const canvas = this.renderer.canvas;
            
            if (format === 'jpeg') {
                return canvas.toDataURL('image/jpeg', quality);
            } else {
                return canvas.toDataURL('image/png');
            }
        } catch (error) {
            console.error('❌ Data URL capture failed:', error);
            throw error;
        }
    }
    
    // Get optimized screenshot for AI processing
    async captureForAI() {
        console.log('🤖 Capturing screenshot optimized for AI vision...');
        
        // Use JPEG with good quality for AI processing (smaller file size)
        const screenshot = await this.captureCanvas('jpeg', 0.85);
        
        console.log(`🎯 AI-optimized screenshot ready: ${(screenshot.size / 1024).toFixed(1)}KB`);
        
        return screenshot;
    }
    
    // Download the screenshot (for debugging/testing)
    downloadLastScreenshot(filename = null) {
        if (!this.lastScreenshotUrl) {
            console.warn('No screenshot available to download');
            return false;
        }
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        const defaultFilename = `ritual-table-${timestamp}.png`;
        
        const link = document.createElement('a');
        link.href = this.lastScreenshotUrl;
        link.download = filename || defaultFilename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`💾 Downloaded screenshot as: ${link.download}`);
        return true;
    }
    
    // Display screenshot in a debug panel
    displayInDebugPanel() {
        if (!this.lastScreenshotUrl) {
            console.warn('No screenshot available to display');
            return null;
        }
        
        // Find or create debug panel
        let debugPanel = document.getElementById('screenshot-debug');
        if (!debugPanel) {
            debugPanel = this.createDebugPanel();
        }
        
        // Update the debug image
        const debugImg = debugPanel.querySelector('.debug-screenshot');
        if (debugImg) {
            debugImg.src = this.lastScreenshotUrl;
            debugImg.style.display = 'block';
        }
        
        // Update info
        const infoEl = debugPanel.querySelector('.screenshot-info');
        if (infoEl && this.lastScreenshot) {
            const sizeKB = (this.lastScreenshot.size / 1024).toFixed(1);
            infoEl.textContent = `${sizeKB}KB • ${this.lastScreenshot.type}`;
        }
        
        console.log('🖼️ Screenshot displayed in debug panel');
        return debugPanel;
    }
    
    createDebugPanel() {
        const panel = document.createElement('div');
        panel.id = 'screenshot-debug';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: 200px;
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #444;
            border-radius: 8px;
            padding: 10px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 1000;
        `;
        
        panel.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: bold;">📸 Screenshot Debug</div>
            <img class="debug-screenshot" style="width: 100%; border-radius: 4px; display: none;" />
            <div class="screenshot-info" style="margin-top: 8px; color: #ccc;"></div>
            <button class="download-btn" style="
                margin-top: 8px;
                padding: 4px 8px;
                background: #333;
                border: 1px solid #555;
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 11px;
            ">Download</button>
        `;
        
        // Add download functionality
        panel.querySelector('.download-btn').addEventListener('click', () => {
            this.downloadLastScreenshot();
        });
        
        document.body.appendChild(panel);
        return panel;
    }
    
    // Clean up resources
    cleanup() {
        if (this.lastScreenshotUrl) {
            URL.revokeObjectURL(this.lastScreenshotUrl);
            this.lastScreenshotUrl = null;
        }
        
        const debugPanel = document.getElementById('screenshot-debug');
        if (debugPanel) {
            debugPanel.remove();
        }
    }
}
