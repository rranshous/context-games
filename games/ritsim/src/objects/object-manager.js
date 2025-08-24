// Object Manager - Handles all ritual objects and their interactions
// Milestone 3: Object placement and interaction

import { RitualObject } from './ritual-object.js';

export class ObjectManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.objects = [];
        this.draggedObject = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.tableBounds = this.calculateTableBounds();
        
        console.log('🎪 Object Manager initialized');
    }
    
    calculateTableBounds() {
        // Define the usable area of the table based on the background image
        // Using the angled table perspective from our SVG
        const canvas = this.renderer.canvas;
        const rect = canvas.getBoundingClientRect();
        
        return {
            minX: rect.width * 0.1,   // 10% margin from left
            minY: rect.height * 0.25, // Start below the far edge of table
            maxX: rect.width * 0.9,   // 10% margin from right  
            maxY: rect.height * 0.85  // Stop before near edge of table
        };
    }
    
    // Create all starting objects and place them on the table
    initializeObjects() {
        console.log('🕯️ Placing starter objects on the ritual table...');
        
        // Place single candle of each color (4 total)
        this.addRandomObject('candle', 'candle-red');
        this.addRandomObject('candle', 'candle-blue');
        this.addRandomObject('candle', 'candle-purple');
        this.addRandomObject('candle', 'candle-white');
        
        // Place white and black stones only (2 total)
        this.addRandomObject('stone', 'stone-quartz');    // White stone
        this.addRandomObject('stone', 'stone-obsidian');  // Black stone
        
        // Place two incense sticks (2 total)
        this.addRandomObject('incense', 'incense');
        this.addRandomObject('incense', 'incense');
        
        console.log(`✨ Placed ${this.objects.length} objects on the ritual table`);
        console.log(`🕯️ Candles: 4 (one of each color), Stones: 2 (white & black), Incense: 2`);
    }
    
    // Add object at random position within table bounds
    addRandomObject(type, assetName) {
        const bounds = this.tableBounds;
        const margin = 30; // Keep objects away from edges
        
        const x = margin + Math.random() * (bounds.maxX - bounds.minX - 2 * margin) + bounds.minX;
        const y = margin + Math.random() * (bounds.maxY - bounds.minY - 2 * margin) + bounds.minY;
        
        return this.addObject(type, assetName, x, y);
    }
    
    addObject(type, assetName, x, y) {
        const obj = new RitualObject(type, assetName, x, y);
        obj.constrainToBounds(
            this.tableBounds.minX, 
            this.tableBounds.minY, 
            this.tableBounds.maxX, 
            this.tableBounds.maxY
        );
        this.objects.push(obj);
        return obj;
    }
    
    // Handle mouse events
    onMouseDown(x, y) {
        // Convert to canvas coordinates
        this.updateMousePosition(x, y);
        
        // Find topmost object under mouse (reverse order for top-to-bottom)
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const obj = this.objects[i];
            if (obj.contains(this.mouseX, this.mouseY)) {
                obj.startDrag(this.mouseX, this.mouseY);
                this.draggedObject = obj;
                
                // Move dragged object to end of array (render on top)
                this.objects.splice(i, 1);
                this.objects.push(obj);
                
                break;
            }
        }
    }
    
    onMouseMove(x, y) {
        this.updateMousePosition(x, y);
        
        // Update drag if we have a dragged object
        if (this.draggedObject) {
            this.draggedObject.updateDrag(this.mouseX, this.mouseY);
            this.draggedObject.constrainToBounds(
                this.tableBounds.minX, 
                this.tableBounds.minY, 
                this.tableBounds.maxX, 
                this.tableBounds.maxY
            );
        } else {
            // Update hover states
            this.updateHoverStates();
        }
    }
    
    onMouseUp(x, y) {
        if (this.draggedObject) {
            this.draggedObject.stopDrag();
            this.draggedObject = null;
        }
    }
    
    updateMousePosition(x, y) {
        // Convert screen coordinates to canvas coordinates
        const rect = this.renderer.canvas.getBoundingClientRect();
        this.mouseX = x - rect.left;
        this.mouseY = y - rect.top;
    }
    
    updateHoverStates() {
        // Clear all hover states first
        this.objects.forEach(obj => obj.setHovered(false));
        
        // Set hover for object under mouse
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const obj = this.objects[i];
            if (obj.contains(this.mouseX, this.mouseY)) {
                obj.setHovered(true);
                break; // Only hover the topmost object
            }
        }
    }
    
    // Render all objects
    render() {
        // Render table bounds (debug visualization)
        if (this.renderer.isInitialized) {
            this.renderTableBounds();
        }
        
        // Render all objects
        this.objects.forEach(obj => {
            obj.render(this.renderer);
        });
    }
    
    renderTableBounds() {
        // Draw subtle outline showing the usable table area
        const ctx = this.renderer.ctx;
        ctx.save();
        
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.3;
        
        const bounds = this.tableBounds;
        ctx.strokeRect(bounds.minX, bounds.minY, 
                      bounds.maxX - bounds.minX, 
                      bounds.maxY - bounds.minY);
        
        ctx.restore();
    }
    
    // Get current arrangement for AI processing (future milestone)
    getArrangement() {
        return this.objects.map(obj => ({
            type: obj.type,
            assetName: obj.assetName,
            x: Math.round(obj.getCenterX()),
            y: Math.round(obj.getCenterY()),
            position: this.getRelativePosition(obj)
        }));
    }
    
    getRelativePosition(obj) {
        const bounds = this.tableBounds;
        const relX = (obj.getCenterX() - bounds.minX) / (bounds.maxX - bounds.minX);
        const relY = (obj.getCenterY() - bounds.minY) / (bounds.maxY - bounds.minY);
        
        return {
            x: Math.round(relX * 100) / 100, // Round to 2 decimal places
            y: Math.round(relY * 100) / 100
        };
    }
}
