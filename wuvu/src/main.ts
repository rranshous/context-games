console.log('Wuvu game starting...');

interface CreatureNeeds {
    hunger: number;      // 0-100, decreases over time
    happiness: number;   // 0-100, decreases over time  
    health: number;      // 0-100, affected by hunger and happiness
}

class Creature {
    public x: number;
    public y: number;
    private vx: number = 0;
    private vy: number = 0;
    private size: number = 20;
    private animationTime: number = 0;
    public needs: CreatureNeeds;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        
        // Start with good stats
        this.needs = {
            hunger: 80,
            happiness: 75,
            health: 90
        };
    }

    update(deltaTime: number, bowlCenterX: number, bowlCenterY: number, bowlWidth: number, bowlHeight: number) {
        this.animationTime += deltaTime;

        // Update needs (decay over time)
        this.updateNeeds(deltaTime);

        // Simple swimming movement
        this.x += this.vx;
        this.y += this.vy;

        // Keep creature in bowl bounds (ellipse) - account for creature size
        const dx = this.x - bowlCenterX;
        const dy = this.y - bowlCenterY;
        const effectiveBowlWidth = bowlWidth - (this.size * 2);
        const effectiveBowlHeight = bowlHeight - (this.size * 2);
        const normalizedDistance = Math.sqrt((dx * dx) / ((effectiveBowlWidth/2) * (effectiveBowlWidth/2)) + 
                                           (dy * dy) / ((effectiveBowlHeight/2) * (effectiveBowlHeight/2)));
        
        if (normalizedDistance > 1) {
            // Calculate reflection vector for smooth bouncing
            const normalX = (2 * dx) / ((effectiveBowlWidth/2) * (effectiveBowlWidth/2));
            const normalY = (2 * dy) / ((effectiveBowlHeight/2) * (effectiveBowlHeight/2));
            const normalLength = Math.sqrt(normalX * normalX + normalY * normalY);
            
            if (normalLength > 0) {
                const unitNormalX = normalX / normalLength;
                const unitNormalY = normalY / normalLength;
                
                // Reflect velocity
                const dotProduct = this.vx * unitNormalX + this.vy * unitNormalY;
                this.vx = this.vx - 2 * dotProduct * unitNormalX;
                this.vy = this.vy - 2 * dotProduct * unitNormalY;
                
                // Apply some damping
                this.vx *= 0.8;
                this.vy *= 0.8;
            }
            
            // Gently push back inside bounds
            const pushBackStrength = 0.1;
            this.x += -dx * pushBackStrength;
            this.y += -dy * pushBackStrength;
        }

        // Add some random movement variation
        if (Math.random() < 0.01) {
            this.vx += (Math.random() - 0.5) * 0.2;
            this.vy += (Math.random() - 0.5) * 0.2;
            
            // Limit speed
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > 1) {
                this.vx = (this.vx / speed) * 1;
                this.vy = (this.vy / speed) * 1;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Simple fish-like creature
        const tailWiggle = Math.sin(this.animationTime * 0.005) * 0.2;
        
        // Body
        ctx.fillStyle = '#FF6B6B';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 0.7, 0, 0, 2 * Math.PI);
        ctx.fill();

        // Tail
        ctx.fillStyle = '#FF8E8E';
        ctx.beginPath();
        ctx.ellipse(-this.size * 1.2, tailWiggle * this.size, this.size * 0.6, this.size * 0.4, 0, 0, 2 * Math.PI);
        ctx.fill();

        // Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.ellipse(this.size * 0.3, -this.size * 0.2, this.size * 0.3, this.size * 0.3, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // Pupil
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.ellipse(this.size * 0.3, -this.size * 0.2, this.size * 0.15, this.size * 0.15, 0, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
    }

    private updateNeeds(deltaTime: number) {
        // Decay rates (per second) - much slower for better gameplay
        const hungerDecayRate = 0.5;   // Loses 0.5 hunger per second
        const happinessDecayRate = 0.3; // Loses 0.3 happiness per second
        
        // Apply decay
        this.needs.hunger = Math.max(0, this.needs.hunger - (hungerDecayRate * deltaTime / 1000));
        this.needs.happiness = Math.max(0, this.needs.happiness - (happinessDecayRate * deltaTime / 1000));
        
        // Health is affected by hunger and happiness
        const targetHealth = (this.needs.hunger + this.needs.happiness) / 2;
        const healthChangeRate = 3; // Health changes 3 points per second toward target
        
        if (this.needs.health < targetHealth) {
            this.needs.health = Math.min(100, this.needs.health + (healthChangeRate * deltaTime / 1000));
        } else if (this.needs.health > targetHealth) {
            this.needs.health = Math.max(0, this.needs.health - (healthChangeRate * deltaTime / 1000));
        }
    }
}

class GameRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private width: number = 800;
    private height: number = 600;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.border = '1px solid #ccc';
        this.canvas.style.display = 'block';
        this.canvas.style.margin = '20px auto';
        
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D context');
        }
        this.ctx = context;
    }

    appendToDOM(parent: HTMLElement) {
        parent.appendChild(this.canvas);
    }

    clear() {
        // Deep ocean background gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, '#1a237e'); // Deep blue at top
        gradient.addColorStop(0.5, '#283593'); // Medium blue in middle
        gradient.addColorStop(1, '#1565c0'); // Lighter blue at bottom
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    drawBowl() {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const bowlWidth = 500;
        const bowlHeight = 350;

        // Bowl background (water)
        this.ctx.fillStyle = '#4A90E2';
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, bowlWidth / 2, bowlHeight / 2, 0, 0, 2 * Math.PI);
        this.ctx.fill();

        // Bowl rim
        this.ctx.strokeStyle = '#2C3E50';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, bowlWidth / 2, bowlHeight / 2, 0, 0, 2 * Math.PI);
        this.ctx.stroke();

        // Water surface highlights
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.beginPath();
        this.ctx.ellipse(centerX - 50, centerY - 60, 60, 20, 0, 0, 2 * Math.PI);
        this.ctx.fill();
    }

    render() {
        this.clear();
        this.drawBowl();
    }

    drawCreature(creature: Creature) {
        creature.draw(this.ctx);
    }

    drawStatsUI(creature: Creature) {
        const barWidth = 25;
        const barHeight = 3;
        const barSpacing = 6;
        
        // Position bars to the right of the creature
        const startX = creature.x + 30;
        const startY = creature.y - 20;

        // Helper function to draw a tiny floating stat bar
        const drawMiniBar = (value: number, y: number, color: string) => {
            // Background
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            this.ctx.fillRect(startX, y, barWidth, barHeight);
            
            // Fill based on value
            const fillWidth = (value / 100) * barWidth;
            this.ctx.fillStyle = color;
            this.ctx.fillRect(startX, y, fillWidth, barHeight);
        };

        // Draw small floating bars (no labels, just colors)
        drawMiniBar(creature.needs.hunger, startY, '#4CAF50');           // Green for hunger
        drawMiniBar(creature.needs.happiness, startY + barSpacing, '#2196F3'); // Blue for happiness  
        drawMiniBar(creature.needs.health, startY + barSpacing * 2, '#FF9800'); // Orange for health
    }
}

class Game {
    private renderer: GameRenderer;
    private lastTime: number = 0;
    private creature: Creature;

    constructor() {
        this.renderer = new GameRenderer();
        this.creature = new Creature(400, 300); // Start in center of canvas
    }

    init() {
        const app = document.getElementById('app');
        if (!app) {
            throw new Error('Could not find app element');
        }

        app.innerHTML = '<h1>Wuvu - Your Digital Aquatic Friend</h1>';
        this.renderer.appendToDOM(app);

        // Start the game loop
        this.gameLoop(0);
    }

    gameLoop = (currentTime: number) => {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Update game state
        this.creature.update(deltaTime, 400, 300, 500, 350); // Bowl center and dimensions
        
        // Render
        this.renderer.render();
        this.renderer.drawCreature(this.creature);
        this.renderer.drawStatsUI(this.creature);

        requestAnimationFrame(this.gameLoop);
    }
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});