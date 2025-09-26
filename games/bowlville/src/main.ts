// Main game entry point
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

class BowlvilleGame {
    private isRunning = false;

    constructor() {
        this.init();
    }

    private init() {
        console.log('Bowlville Game Initializing...');
        this.setupEventListeners();
        this.start();
    }

    private setupEventListeners() {
        // Add game event listeners here
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            console.log(`Click at: ${x}, ${y}`);
        });
    }

    private start() {
        this.isRunning = true;
        this.gameLoop();
    }

    private gameLoop() {
        if (!this.isRunning) return;

        this.update();
        this.render();

        requestAnimationFrame(() => this.gameLoop());
    }

    private update() {
        // Game logic updates here
    }

    private render() {
        // Clear canvas
        ctx.fillStyle = '#2c5234';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw bowling lane background
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(50, 200, 700, 200);

        // Draw lane lines
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(50, 200);
        ctx.lineTo(750, 200);
        ctx.moveTo(50, 400);
        ctx.lineTo(750, 400);
        ctx.stroke();

        // Draw title
        ctx.fillStyle = '#fff';
        ctx.font = '32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Bowlville', canvas.width / 2, 50);

        // Draw instructions
        ctx.font = '16px Arial';
        ctx.fillText('Click anywhere to interact', canvas.width / 2, 550);
    }
}

// Initialize the game
new BowlvilleGame();
