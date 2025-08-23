// Canvas Renderer - Core rendering system for the ritual table
// Milestone 2: Canvas setup, asset loading, and basic 2D pipeline

export class CanvasRenderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            throw new Error(`Canvas element '${canvasId}' not found`);
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.assets = new Map();
        this.isInitialized = false;
        
        this.setupCanvas();
        console.log('🎨 Canvas renderer initialized');
    }
    
    setupCanvas() {
        // Set canvas size and scaling for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        // Set actual size in memory (scaled up for high DPI)
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Scale context to ensure correct drawing operations
        this.ctx.scale(dpr, dpr);
        
        // Set display size back to normal
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Enable smooth image rendering
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        console.log(`📐 Canvas set up: ${rect.width}x${rect.height} (${this.canvas.width}x${this.canvas.height} internal)`);
    }
    
    async loadAsset(name, path) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.assets.set(name, img);
                console.log(`✅ Asset loaded: ${name}`);
                resolve(img);
            };
            img.onerror = () => {
                console.error(`❌ Failed to load asset: ${name} from ${path}`);
                reject(new Error(`Failed to load ${name}`));
            };
            img.src = path;
        });
    }
    
    async loadAssets() {
        console.log('📦 Loading ritual assets...');
        
        try {
            // Load background table
            await this.loadAsset('table-background', '/assets/table-background.svg');
            
            // Load candle assets (different colors)
            await this.loadAsset('candle-red', '/assets/candle-red.svg');
            await this.loadAsset('candle-blue', '/assets/candle-blue.svg');
            await this.loadAsset('candle-purple', '/assets/candle-purple.svg');
            await this.loadAsset('candle-white', '/assets/candle-white.svg');
            
            // Load stone assets
            await this.loadAsset('stone-obsidian', '/assets/stone-obsidian.svg');
            await this.loadAsset('stone-quartz', '/assets/stone-quartz.svg');
            await this.loadAsset('stone-amethyst', '/assets/stone-amethyst.svg');
            
            // Load incense
            await this.loadAsset('incense', '/assets/incense.svg');
            
            console.log('🎉 All assets loaded successfully');
            this.isInitialized = true;
            return true;
            
        } catch (error) {
            console.error('💥 Asset loading failed:', error);
            // For milestone 2, we'll create placeholder assets if loading fails
            this.createPlaceholderAssets();
            this.isInitialized = true;
            return false;
        }
    }
    
    createPlaceholderAssets() {
        console.log('🎭 Creating placeholder assets for development...');
        
        // Create simple colored rectangles as placeholders
        const createPlaceholder = (width, height, color, text) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Draw colored background
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, width, height);
            
            // Draw border
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, width, height);
            
            // Draw text label
            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(text, width/2, height/2 + 4);
            
            return canvas;
        };
        
        // Create placeholder assets
        this.assets.set('table-background', createPlaceholder(600, 400, '#2d1810', 'TABLE'));
        this.assets.set('candle-red', createPlaceholder(30, 60, '#cc3333', 'RED'));
        this.assets.set('candle-blue', createPlaceholder(30, 60, '#3366cc', 'BLUE'));
        this.assets.set('candle-purple', createPlaceholder(30, 60, '#9933cc', 'PURPLE'));
        this.assets.set('candle-white', createPlaceholder(30, 60, '#cccccc', 'WHITE'));
        this.assets.set('stone-obsidian', createPlaceholder(40, 30, '#1a1a1a', 'OBSIDIAN'));
        this.assets.set('stone-quartz', createPlaceholder(40, 30, '#f5f5f5', 'QUARTZ'));
        this.assets.set('stone-amethyst', createPlaceholder(40, 30, '#9966cc', 'AMETHYST'));
        this.assets.set('incense', createPlaceholder(20, 80, '#8b4513', 'INCENSE'));
    }
    
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawAsset(assetName, x, y, width = null, height = null) {
        const asset = this.assets.get(assetName);
        if (!asset) {
            console.warn(`Asset '${assetName}' not found`);
            return;
        }
        
        if (width && height) {
            this.ctx.drawImage(asset, x, y, width, height);
        } else {
            this.ctx.drawImage(asset, x, y);
        }
    }
    
    render() {
        if (!this.isInitialized) {
            console.warn('Renderer not initialized yet');
            return;
        }
        
        this.clear();
        
        // Draw table background (centered and scaled to fit)
        const tableAsset = this.assets.get('table-background');
        if (tableAsset) {
            const canvasRect = this.canvas.getBoundingClientRect();
            this.drawAsset('table-background', 0, 0, canvasRect.width, canvasRect.height);
        }
        
        // For milestone 2, we'll just show that assets are loaded
        // Object placement will be handled in milestone 3
        this.drawAssetsPreview();
    }
    
    drawAssetsPreview() {
        // Show a preview of all loaded assets in the corner
        const assets = ['candle-red', 'candle-blue', 'candle-purple', 'candle-white', 
                       'stone-obsidian', 'stone-quartz', 'stone-amethyst', 'incense'];
        
        let x = 10;
        let y = 10;
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(5, 5, 320, 80);
        
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '14px Arial';
        this.ctx.fillText('Assets Loaded:', 10, 25);
        
        assets.forEach((assetName, index) => {
            if (this.assets.has(assetName)) {
                this.drawAsset(assetName, x, y + 30);
                x += 40;
                if (x > 280) {
                    x = 10;
                    y += 35;
                }
            }
        });
    }
    
    getAsset(name) {
        return this.assets.get(name);
    }
    
    hasAsset(name) {
        return this.assets.has(name);
    }
}
