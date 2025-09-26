console.log('Wuvu game starting...');

interface CreatureNeeds {
    satiation: number;      // 0-100, decreases over time
    happiness: number;   // 0-100, decreases over time
    health: number;      // 0-100, derived from bowl cleanliness
}

interface GameAction {
    type: 'feed' | 'play' | 'clean';
    target: string; // creature id or 'bowl' for environment actions
    source: 'player' | 'script' | 'ai-assist-agent';
}

interface GameState {
    creatures: {id: string, satiation: number, happiness: number, health: number, isDead: boolean}[];
    bowlCleanliness: number;
    timestamp: number;
}

abstract class Agent {
    abstract id: string;
    abstract name: string;
    protected isActive: boolean = false;
    
    abstract evaluate(gameState: GameState): Promise<void>;
    
    start() {
        this.isActive = true;
    }
    
    stop() {
        this.isActive = false;
    }
    
    getStatus() {
        return this.isActive;
    }
}

class AIAssistAgent extends Agent {
    id = 'ai-assist-agent';
    name = 'AI Assist Agent';
    private executeAction: (action: GameAction) => boolean;
    private isEvaluating: boolean = false;
    
    constructor(executeActionFn: (action: GameAction) => boolean) {
        super();
        this.executeAction = executeActionFn;
    }
    
    async evaluate(gameState: GameState): Promise<void> {
        if (!this.isActive) return;
        
        this.isEvaluating = true;
        console.log('🤖 AI Assist Agent evaluating...');
        
        // Define the executeAction tool for ollama
        const executeActionTool = {
            type: 'function' as const,
            function: {
                name: 'executeAction',
                description: 'Perform an action in the game (feed creature, play with creature, or clean bowl)',
                parameters: {
                    type: 'object',
                    required: ['type', 'target'],
                    properties: {
                        type: { 
                            type: 'string', 
                            enum: ['feed', 'play', 'clean'],
                            description: 'The action to perform' 
                        },
                        target: { 
                            type: 'string', 
                            description: 'creature1, creature2, creature3, or bowl' 
                        }
                    }
                }
            }
        };

        // Create prompt with current game state
        const prompt = this.createPrompt(gameState);
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen3:1.7b',
                    messages: [{ role: 'user', content: prompt }],
                    tools: [executeActionTool],
                    stream: false
                })
            });
            
            const data = await response.json();

            // Handle tool calls
            if (data.message && data.message.tool_calls) {
                for (const toolCall of data.message.tool_calls) {
                    if (toolCall.function.name === 'executeAction') {
                        const args = toolCall.function.arguments;
                        const action: GameAction = {
                            type: args.type,
                            target: args.target,
                            source: 'ai-assist-agent'
                        };
                        
                        const success = this.executeAction(action);
                        console.log(`🤖 AI Assist Agent: ${args.type} ${args.target} ${success ? '✅' : '❌'}`);
                    }
                }
            }
        } catch (error) {
            console.error('AI Assist Agent error:', error);
        } finally {
            this.isEvaluating = false;
        }
    }
    
    private createPrompt(gameState: GameState): string {
        const livingCreatures = gameState.creatures.filter(c => !c.isDead);
        const deadCount = gameState.creatures.length - livingCreatures.length;

        let prompt = `You are the AI Assist Agent helping care for digital pets. You are in charge of keeping them healthy and happy.

Use your tools to care for the creatures, take any action necessary to keep them healthy and happy.
You can perform up to 5 tool calls at a time.
You can execute an action multiple times and execute an action for a creature multiple times in a row if needed.
You can Clean the bowl when it is dirty.
You can Feed a creature when it is not satiated.
You can Play with a creature when it is unhappy.

example tool calls:
- executeAction clean bowl
- executeAction feed creature1

Current Game State (YAML):
\`\`\`yaml
environment:
  bowl_cleanliness: ${this.getStatusDescription(gameState.bowlCleanliness)}
  living_creatures: ${livingCreatures.length}
  dead_creatures: ${deadCount}

creatures:`;

        livingCreatures.forEach(creature => {
            prompt += `
  ${creature.id}:
    satiation: ${this.getStatusDescription(creature.satiation)}
    happiness: ${this.getStatusDescription(creature.happiness)}
    health: ${this.getStatusDescription(creature.health)}`;
        });

        prompt += `\`\`\`
        You do not need to return any text, just make tool calls /no_think`;

        return prompt;
    }
    
    isEvaluatingNow(): boolean {
        return this.isEvaluating;
    }

    private getStatusDescription(value: number): string {
        if (value >= 70) return 'high';
        if (value >= 50) return 'middling';
        if (value >= 30) return 'low';
        return 'critical';
    }
}

type CreatureState = 'idle' | 'eating' | 'playing' | 'happy' | 'dead';

class Creature {
    public x: number;
    public y: number;
    private vx: number = 0;
    private vy: number = 0;
    private size: number = 20;
    private animationTime: number = 0;
    public needs: CreatureNeeds;
    public id: string = 'creature1'; // For future multi-creature support
    private state: CreatureState = 'idle';
    private stateTimer: number = 0;
    private baseColor: string;
    private personalitySpeed: number;

    constructor(x: number, y: number, id?: string) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.id = id || 'creature1';
        
        // Personality variations based on ID
        const personality = this.getPersonality(this.id);
        this.baseColor = personality.color;
        this.personalitySpeed = personality.speed;
        this.size = personality.size;
        
        // Start with good stats (slight variation per creature)
        this.needs = {
            satiation: 70 + Math.random() * 20,    // 70-90 range
            happiness: 65 + Math.random() * 20, // 65-85 range
            health: 90                          // Will be updated by bowl cleanliness
        };
    }

    private getPersonality(id: string) {
        const personalities = {
            'creature1': { color: '#FF6B6B', speed: 1.0, size: 20 },   // Red, normal
            'creature2': { color: '#4ECDC4', speed: 0.7, size: 18 },   // Teal, slower, smaller  
            'creature3': { color: '#45B7D1', speed: 1.3, size: 22 }    // Blue, faster, larger
        };
        return personalities[id as keyof typeof personalities] || personalities['creature1'];
    }

    update(deltaTime: number, bowlCenterX: number, bowlCenterY: number, bowlWidth: number, bowlHeight: number) {
        this.animationTime += deltaTime;

        // Update state timer
        if (this.stateTimer > 0) {
            this.stateTimer -= deltaTime;
            if (this.stateTimer <= 0) {
                this.state = 'idle';
            }
        }

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

        // Animation variations based on state
        let bodyColor = this.baseColor;
        let eyeScale = 1;
        let bodyBounce = 0;
        let speedMultiplier = this.personalitySpeed;
        let rotation = 0;

        switch (this.state) {
            case 'eating':
                bodyColor = '#FF9999'; // Lighter when eating
                bodyBounce = Math.sin(this.animationTime * 0.01) * 3; // Gentle bobbing
                speedMultiplier = 0.5; // Slower tail wiggle
                break;
            case 'playing':
                bodyColor = '#FF4444'; // Brighter when playing
                eyeScale = 1.2; // Bigger eyes when excited
                bodyBounce = Math.sin(this.animationTime * 0.015) * 5; // More energetic bobbing
                speedMultiplier = 2; // Faster tail wiggle
                break;
            case 'happy':
                bodyColor = '#FF8888';
                eyeScale = 1.1;
                break;
            case 'dead':
                bodyColor = '#666666'; // Gray when dead
                eyeScale = 0.5; // Much smaller eyes
                speedMultiplier = 0; // No tail movement
                bodyBounce = Math.sin(this.animationTime * 0.002) * 2; // Slow floating
                rotation = Math.PI; // Upside down
                break;
        }

        // Apply bounce effect and rotation
        ctx.translate(0, bodyBounce);
        ctx.rotate(rotation);

        // Simple fish-like creature with state-based animations
        const tailWiggle = Math.sin(this.animationTime * 0.005 * speedMultiplier) * 0.2;
        
        // Body
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 0.7, 0, 0, 2 * Math.PI);
        ctx.fill();

        // Tail
        ctx.fillStyle = '#FF8E8E';
        ctx.beginPath();
        ctx.ellipse(-this.size * 1.2, tailWiggle * this.size, this.size * 0.6, this.size * 0.4, 0, 0, 2 * Math.PI);
        ctx.fill();

        // Eye (with state-based scaling)
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.ellipse(this.size * 0.3, -this.size * 0.2, this.size * 0.3 * eyeScale, this.size * 0.3 * eyeScale, 0, 0, 2 * Math.PI);
        ctx.fill();
        
        // Pupil
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.ellipse(this.size * 0.3, -this.size * 0.2, this.size * 0.15 * eyeScale, this.size * 0.15 * eyeScale, 0, 0, 2 * Math.PI);
        ctx.fill();

        // Add sparkles when playing
        if (this.state === 'playing' && this.stateTimer > 0) {
            for (let i = 0; i < 3; i++) {
                const sparkleAngle = (this.animationTime * 0.01 + i * Math.PI * 2 / 3) % (Math.PI * 2);
                const sparkleRadius = 35;
                const sparkleX = Math.cos(sparkleAngle) * sparkleRadius;
                const sparkleY = Math.sin(sparkleAngle) * sparkleRadius;
                
                ctx.fillStyle = `rgba(255, 255, 0, ${0.5 + Math.sin(this.animationTime * 0.02) * 0.3})`;
                ctx.beginPath();
                ctx.ellipse(sparkleX, sparkleY, 3, 3, 0, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    isClickedOn(clickX: number, clickY: number): boolean {
        const distance = Math.sqrt((clickX - this.x) * (clickX - this.x) + (clickY - this.y) * (clickY - this.y));
        return distance <= this.size * 1.5; // Slightly larger hit area for easier clicking
    }

    private updateNeeds(deltaTime: number) {
        // Decay rates (per second) - much slower for better gameplay
        const satiationDecayRate = 0.5;   // Loses 0.5 satiation per second
        const happinessDecayRate = 0.3; // Loses 0.3 happiness per second
        
        // Apply decay
        this.needs.satiation = Math.max(0, this.needs.satiation - (satiationDecayRate * deltaTime / 1000));
        this.needs.happiness = Math.max(0, this.needs.happiness - (happinessDecayRate * deltaTime / 1000));
    }

    updateHealthFromCleanliness(bowlCleanliness: number, deltaTime: number) {
        // Health tends toward bowl cleanliness level
        const targetHealth = bowlCleanliness;
        const healthChangeRate = 2; // Health changes 2 points per second toward target
        
        if (this.needs.health < targetHealth) {
            this.needs.health = Math.min(100, this.needs.health + (healthChangeRate * deltaTime / 1000));
        } else if (this.needs.health > targetHealth) {
            this.needs.health = Math.max(0, this.needs.health - (healthChangeRate * deltaTime / 1000));
        }

        // Check for death
        if (this.needs.health <= 0 && this.state !== 'dead') {
            this.state = 'dead';
            console.log(`💀 ${this.id} has died from poor health!`);
        }
    }

    isDead(): boolean {
        return this.state === 'dead';
    }

    // Unified action handler - same interface for player/script/AI actions
    handleAction(action: GameAction): boolean {
        if (action.target !== this.id) {
            return false; // Action not for this creature
        }

        switch (action.type) {
            case 'feed':
                return this.feed(action.source);
            case 'play':
                return this.play(action.source);
            default:
                return false;
        }
    }

    private feed(source: 'player' | 'script' | 'ai-assist-agent'): boolean {
        // Feeding increases satiation, slight happiness boost
        const satiationIncrease = 25;
        const happinessBonus = 5;

        this.needs.satiation = Math.min(100, this.needs.satiation + satiationIncrease);
        this.needs.happiness = Math.min(100, this.needs.happiness + happinessBonus);

        // Visual feedback
        this.state = 'eating';
        this.stateTimer = 2000; // 2 seconds of eating animation

        console.log(`Creature fed by ${source}! satiation: ${Math.round(this.needs.satiation)}, Happiness: ${Math.round(this.needs.happiness)}`);
        return true;
    }

    private play(source: 'player' | 'script' | 'ai-assist-agent'): boolean {
        // Playing increases happiness, slight satiation cost
        const happinessIncrease = 20;
        const satiationCost = 5;

        this.needs.happiness = Math.min(100, this.needs.happiness + happinessIncrease);
        this.needs.satiation = Math.max(0, this.needs.satiation - satiationCost);

        // Visual feedback
        this.state = 'playing';
        this.stateTimer = 3000; // 3 seconds of playing animation

        console.log(`Creature played with by ${source}! Happiness: ${Math.round(this.needs.happiness)}, satiation: ${Math.round(this.needs.satiation)}`);
        return true;
    }
}

class GameRenderer {
    public canvas: HTMLCanvasElement;
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

    drawBowlCleanliness(cleanliness: number) {
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const bowlWidth = 500;
        const bowlHeight = 350;

        // Add algae overlay based on dirtiness (lower cleanliness = more algae)
        const dirtiness = (100 - cleanliness) / 100; // 0 = clean, 1 = very dirty
        
        if (dirtiness > 0.1) { // Only show algae when somewhat dirty
            const algaeAlpha = Math.min(0.6, dirtiness * 0.8); // Max 60% opacity
            
            // Green algae overlay
            this.ctx.fillStyle = `rgba(34, 139, 34, ${algaeAlpha})`;
            this.ctx.beginPath();
            this.ctx.ellipse(centerX, centerY, (bowlWidth / 2) - 2, (bowlHeight / 2) - 2, 0, 0, 2 * Math.PI);
            this.ctx.fill();

            // Add some algae spots for texture
            for (let i = 0; i < dirtiness * 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + performance.now() * 0.0005;
                const spotRadius = 20 + dirtiness * 15;
                const spotX = centerX + Math.cos(angle) * spotRadius * (1 + Math.sin(performance.now() * 0.001 + i) * 0.3);
                const spotY = centerY + Math.sin(angle) * spotRadius * 0.6 * (1 + Math.cos(performance.now() * 0.001 + i) * 0.2);
                
                this.ctx.fillStyle = `rgba(0, 100, 0, ${algaeAlpha * 0.8})`;
                this.ctx.beginPath();
                this.ctx.ellipse(spotX, spotY, 8 + dirtiness * 4, 6 + dirtiness * 3, 0, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
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
        drawMiniBar(creature.needs.satiation, startY, '#4CAF50');           // Green for satiation
        drawMiniBar(creature.needs.happiness, startY + barSpacing, '#2196F3'); // Blue for happiness
        drawMiniBar(creature.needs.health, startY + barSpacing * 2, '#FF9800'); // Orange for health
    }

    drawInteractionMenu(x: number, y: number, isBowlMenu: boolean = false) {
        const buttonWidth = 80;
        const buttonHeight = 30;
        const buttonSpacing = 10;

        if (isBowlMenu) {
            // Bowl menu - just clean option
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(x - 5, y - 5, buttonWidth + 10, buttonHeight + 10);

            // Clean button
            this.ctx.fillStyle = '#00BCD4';
            this.ctx.fillRect(x, y, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.fillText('Clean', x + 22, y + 20);
        } else {
            // Creature menu - feed and play options
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(x - 5, y - 5, buttonWidth + 10, (buttonHeight * 2) + buttonSpacing + 10);

            // Feed button
            this.ctx.fillStyle = '#4CAF50';
            this.ctx.fillRect(x, y, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px Arial';
            this.ctx.fillText('Feed', x + 25, y + 20);

            // Play button
            this.ctx.fillStyle = '#2196F3';
            this.ctx.fillRect(x, y + buttonHeight + buttonSpacing, buttonWidth, buttonHeight);
            this.ctx.fillStyle = 'white';
            this.ctx.fillText('Play', x + 25, y + buttonHeight + buttonSpacing + 20);
        }
    }

    drawAgentControls(agents: Agent[], x: number, y: number) {
        const buttonWidth = 120;
        const buttonHeight = 30;
        
        agents.forEach((agent, index) => {
            const buttonY = y + (index * (buttonHeight + 10));
            const isActive = agent.getStatus();
            
            // Check if agent is currently evaluating (for pulsing effect)
            const isEvaluating = (agent as any).isEvaluatingNow && (agent as any).isEvaluatingNow();
            
            // Button background with pulsing effect during evaluation
            let buttonColor = isActive ? '#4CAF50' : '#757575';
            if (isEvaluating) {
                const pulse = Math.sin(performance.now() * 0.005) * 0.3 + 0.7; // Gentle pulse between 0.4 and 1.0
                buttonColor = `rgba(76, 175, 80, ${pulse})`; // Green with pulsing opacity
            }
            
            this.ctx.fillStyle = buttonColor;
            this.ctx.fillRect(x, buttonY, buttonWidth, buttonHeight);
            
            // Button border
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, buttonY, buttonWidth, buttonHeight);
            
            // Button text
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            const text = `${agent.name}: ${isActive ? 'ON' : 'OFF'}`;
            const textWidth = this.ctx.measureText(text).width;
            this.ctx.fillText(text, x + (buttonWidth - textWidth) / 2, buttonY + 20);
            
            // Status indicator
            if (isActive) {
                this.ctx.fillStyle = '#FFF';
                this.ctx.beginPath();
                this.ctx.arc(x + buttonWidth - 15, buttonY + 10, 4, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        });
    }
}

class Game {
    private renderer: GameRenderer;
    private lastTime: number = 0;
    private creatures: Creature[] = [];
    private showInteractionMenu: boolean = false;
    private menuX: number = 0;
    private menuY: number = 0;
    private selectedCreatureId: string | null = null;
    private bowlCleanliness: number = 90; // 0-100, starts clean
    private agents: Agent[] = [];
    private lastAgentEvaluation: number = 0;
    private agentEvaluationInterval: number = 30000; // 60 seconds (1 minute)

    constructor() {
        this.renderer = new GameRenderer();
        
        // Create 3 creatures with different starting positions
        this.creatures = [
            new Creature(350, 280, 'creature1'),
            new Creature(450, 320, 'creature2'), 
            new Creature(400, 350, 'creature3')
        ];
        
        // Create and register AI Assist Agent
        const aiAssistAgent = new AIAssistAgent((action: GameAction) => this.executeAction(action));
        this.addAgent(aiAssistAgent);
    }

    init() {
        const app = document.getElementById('app');
        if (!app) {
            throw new Error('Could not find app element');
        }

        app.innerHTML = '<h1>Wuvu - Your Digital Aquatic Friend</h1>';
        this.renderer.appendToDOM(app);

        // Add click listener
        this.renderer.canvas.addEventListener('click', this.handleClick);

        // Start the game loop
        this.gameLoop(0);
    }

    gameLoop = (currentTime: number) => {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Update bowl cleanliness (degrades over time)
        const cleanlinessDecayRate = 0.2; // Loses 0.2 cleanliness per second
        this.bowlCleanliness = Math.max(0, this.bowlCleanliness - (cleanlinessDecayRate * deltaTime / 1000));

        // Agent evaluation loop
        if (performance.now() - this.lastAgentEvaluation > this.agentEvaluationInterval) {
            this.evaluateAgents();
            this.lastAgentEvaluation = performance.now();
        }

        // Update all creatures (only if alive)
        for (const creature of this.creatures) {
            if (!creature.isDead()) {
                creature.update(deltaTime, 400, 300, 500, 350); // Bowl center and dimensions
            }
            creature.updateHealthFromCleanliness(this.bowlCleanliness, deltaTime); // Health still updates for death check
        }
        
        // Render
        this.renderer.render();
        this.renderer.drawBowlCleanliness(this.bowlCleanliness);
        
        // Draw all creatures
        for (const creature of this.creatures) {
            this.renderer.drawCreature(creature);
            this.renderer.drawStatsUI(creature);
        }
        
        if (this.showInteractionMenu) {
            const isBowlMenu = this.selectedCreatureId === null;
            this.renderer.drawInteractionMenu(this.menuX, this.menuY, isBowlMenu);
        }

        // Draw agent controls
        this.renderer.drawAgentControls(this.agents, 10, 10);

        requestAnimationFrame(this.gameLoop);
    }

    private handleClick = (event: MouseEvent) => {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Check agent button clicks first
        if (this.handleAgentButtonClick(clickX, clickY)) {
            return;
        }

        if (this.showInteractionMenu) {
            // Check if clicked on menu buttons
            this.handleMenuClick(clickX, clickY);
        } else {
            // Check if clicked on any living creature first
            for (const creature of this.creatures) {
                if (!creature.isDead() && creature.isClickedOn(clickX, clickY)) {
                    this.showInteractionMenu = true;
                    this.menuX = clickX;
                    this.menuY = clickY;
                    this.selectedCreatureId = creature.id;
                    return;
                }
            }
            
            // If no creature was clicked, check if clicked in bowl area
            if (this.isClickInBowl(clickX, clickY)) {
                this.showInteractionMenu = true;
                this.menuX = clickX;
                this.menuY = clickY;
                this.selectedCreatureId = null; // No specific creature, this is a bowl action
            }
        }
    }

    private handleMenuClick(clickX: number, clickY: number) {
        const buttonWidth = 80;
        const buttonHeight = 30;
        const buttonSpacing = 10;
        const isBowlMenu = this.selectedCreatureId === null;

        if (isBowlMenu) {
            // Bowl menu - clean button
            const cleanButtonX = this.menuX;
            const cleanButtonY = this.menuY;
            if (clickX >= cleanButtonX && clickX <= cleanButtonX + buttonWidth &&
                clickY >= cleanButtonY && clickY <= cleanButtonY + buttonHeight) {
                this.executeAction({
                    type: 'clean',
                    target: 'bowl',
                    source: 'player'
                });
                this.showInteractionMenu = false;
                return;
            }
        } else {
            // Creature menu - feed and play buttons
            // Feed button
            const feedButtonX = this.menuX;
            const feedButtonY = this.menuY;
            if (clickX >= feedButtonX && clickX <= feedButtonX + buttonWidth &&
                clickY >= feedButtonY && clickY <= feedButtonY + buttonHeight) {
                this.executeAction({
                    type: 'feed',
                    target: this.selectedCreatureId || 'creature1',
                    source: 'player'
                });
                this.showInteractionMenu = false;
                return;
            }

            // Play button
            const playButtonX = this.menuX;
            const playButtonY = this.menuY + buttonHeight + buttonSpacing;
            if (clickX >= playButtonX && clickX <= playButtonX + buttonWidth &&
                clickY >= playButtonY && clickY <= playButtonY + buttonHeight) {
                this.executeAction({
                    type: 'play',
                    target: this.selectedCreatureId || 'creature1',
                    source: 'player'
                });
                this.showInteractionMenu = false;
                return;
            }
        }

        // Click outside menu closes it
        this.showInteractionMenu = false;
    }

    // Unified action processor - entry point for all actions
    executeAction(action: GameAction): boolean {
        // This is where we'd add logging, validation, etc.
        console.log(`Executing ${action.type} action from ${action.source} on ${action.target}`);
        
        // Handle bowl actions
        if (action.target === 'bowl') {
            return this.handleBowlAction(action);
        }
        
        // Route to the appropriate creature
        for (const creature of this.creatures) {
            if (creature.id === action.target) {
                return creature.handleAction(action);
            }
        }
        
        return false;
    }

    private handleBowlAction(action: GameAction): boolean {
        switch (action.type) {
            case 'clean':
                // Restore bowl cleanliness
                const cleaningPower = 40; // Restores 40 points
                this.bowlCleanliness = Math.min(100, this.bowlCleanliness + cleaningPower);
                console.log(`Bowl cleaned by ${action.source}! Cleanliness: ${Math.round(this.bowlCleanliness)}`);
                return true;
            default:
                return false;
        }
    }

    private isClickInBowl(clickX: number, clickY: number): boolean {
        // Check if click is within the bowl ellipse bounds
        const centerX = 400;
        const centerY = 300;
        const bowlWidth = 500;
        const bowlHeight = 350;
        
        const dx = clickX - centerX;
        const dy = clickY - centerY;
        const normalizedDistance = Math.sqrt((dx * dx) / ((bowlWidth/2) * (bowlWidth/2)) + 
                                           (dy * dy) / ((bowlHeight/2) * (bowlHeight/2)));
        
        return normalizedDistance <= 1; // Inside the ellipse
    }

    private handleAgentButtonClick(clickX: number, clickY: number): boolean {
        const buttonWidth = 120;
        const buttonHeight = 30;
        const startX = 10;
        const startY = 10;
        
        for (let i = 0; i < this.agents.length; i++) {
            const buttonY = startY + (i * (buttonHeight + 10));
            
            if (clickX >= startX && clickX <= startX + buttonWidth &&
                clickY >= buttonY && clickY <= buttonY + buttonHeight) {
                
                const agent = this.agents[i];
                if (agent.getStatus()) {
                    agent.stop();
                    console.log(`🤖 ${agent.name} deactivated`);
                } else {
                    agent.start();
                    console.log(`🤖 ${agent.name} activated`);
                    // Trigger immediate evaluation when activated
                    this.triggerAgentEvaluation(agent);
                }
                return true;
            }
        }
        return false;
    }

    private async evaluateAgents() {
        const gameState = this.getGameState();
        for (const agent of this.agents.filter(a => a.getStatus())) {
            try {
                await agent.evaluate(gameState);
            } catch (error) {
                console.error(`Agent ${agent.id} evaluation failed:`, error);
            }
        }
    }

    private getGameState(): GameState {
        return {
            creatures: this.creatures.map(c => ({
                id: c.id,
                satiation: c.needs.satiation,
                happiness: c.needs.happiness,
                health: c.needs.health,
                isDead: c.isDead()
            })),
            bowlCleanliness: this.bowlCleanliness,
            timestamp: Date.now()
        };
    }

    addAgent(agent: Agent) {
        this.agents.push(agent);
    }

    getAgents(): Agent[] {
        return [...this.agents];
    }
    
    private async triggerAgentEvaluation(agent: Agent) {
        if (!agent.getStatus()) return;
        
        try {
            const gameState = this.getGameState();
            await agent.evaluate(gameState);
        } catch (error) {
            console.error(`Immediate agent ${agent.id} evaluation failed:`, error);
        }
    }
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});