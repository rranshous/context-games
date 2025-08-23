// Ritual Object - Represents an individual placeable object on the table
// Milestone 3: Object placement and interaction

export class RitualObject {
    constructor(type, assetName, x = 0, y = 0) {
        this.type = type;           // 'candle', 'stone', 'incense'
        this.assetName = assetName; // Asset key for rendering
        this.x = x;                 // Position on canvas
        this.y = y;
        this.width = 30;            // Default width
        this.height = 60;           // Default height
        this.isDragging = false;
        this.isHovered = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        
        // Set dimensions based on object type
        this.setDimensions();
        
        console.log(`🔮 Created ${type} object: ${assetName} at (${x}, ${y})`);
    }
    
    setDimensions() {
        switch (this.type) {
            case 'candle':
                this.width = 30;
                this.height = 60;
                break;
            case 'stone':
                this.width = 40;
                this.height = 30;
                break;
            case 'incense':
                this.width = 20;
                this.height = 80;
                break;
            default:
                this.width = 30;
                this.height = 30;
        }
    }
    
    // Check if point is inside this object
    contains(x, y) {
        return x >= this.x && 
               x <= this.x + this.width && 
               y >= this.y && 
               y <= this.y + this.height;
    }
    
    // Start dragging from this point
    startDrag(mouseX, mouseY) {
        this.isDragging = true;
        this.dragOffsetX = mouseX - this.x;
        this.dragOffsetY = mouseY - this.y;
        console.log(`🤏 Started dragging ${this.assetName}`);
    }
    
    // Update position during drag
    updateDrag(mouseX, mouseY) {
        if (this.isDragging) {
            this.x = mouseX - this.dragOffsetX;
            this.y = mouseY - this.dragOffsetY;
        }
    }
    
    // Stop dragging
    stopDrag() {
        if (this.isDragging) {
            this.isDragging = false;
            console.log(`🎯 Placed ${this.assetName} at (${Math.round(this.x)}, ${Math.round(this.y)})`);
        }
    }
    
    // Set hover state
    setHovered(hovered) {
        this.isHovered = hovered;
    }
    
    // Get center point of object
    getCenterX() {
        return this.x + this.width / 2;
    }
    
    getCenterY() {
        return this.y + this.height / 2;
    }
    
    // Constrain position to stay within bounds
    constrainToBounds(minX, minY, maxX, maxY) {
        this.x = Math.max(minX, Math.min(maxX - this.width, this.x));
        this.y = Math.max(minY, Math.min(maxY - this.height, this.y));
    }
    
    // Render this object
    render(renderer) {
        // Draw object asset
        renderer.drawAsset(this.assetName, this.x, this.y, this.width, this.height);
        
        // Draw visual feedback if needed
        if (this.isDragging || this.isHovered) {
            this.renderFeedback(renderer);
        }
    }
    
    renderFeedback(renderer) {
        const ctx = renderer.ctx;
        
        // Save current context state
        ctx.save();
        
        if (this.isDragging) {
            // Highlight border when dragging
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(this.x - 2, this.y - 2, this.width + 4, this.height + 4);
        } else if (this.isHovered) {
            // Subtle glow when hovering
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.6;
            ctx.strokeRect(this.x - 1, this.y - 1, this.width + 2, this.height + 2);
        }
        
        // Restore context state
        ctx.restore();
    }
}
