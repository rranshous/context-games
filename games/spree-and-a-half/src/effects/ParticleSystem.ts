import { Vector2 } from '../core/Vector2.js';

// Individual particle
export class Particle {
  public position: Vector2;
  public velocity: Vector2;
  public life: number;
  public maxLife: number;
  public size: number;
  public color: string;
  
  constructor(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string) {
    this.position = new Vector2(x, y);
    this.velocity = new Vector2(vx, vy);
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
  }
  
  update(): void {
    this.position.addInPlace(this.velocity);
    this.velocity = this.velocity.multiply(0.98); // Slow down over time
    this.life--;
  }
  
  isAlive(): boolean {
    return this.life > 0;
  }
  
  getAlpha(): number {
    return this.life / this.maxLife;
  }
}

// Particle system manager
export class ParticleSystem {
  private particles: Particle[] = [];
  
  // Create blood mist effect
  createBloodMist(x: number, y: number): void {
    const particleCount = 12;
    
    for (let i = 0; i < particleCount; i++) {
      // Random direction and speed
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 3;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 1; // Slight upward bias
      
      // Random properties
      const life = 30 + Math.random() * 20; // 30-50 frames
      const size = 2 + Math.random() * 3;
      
      // Blood colors
      const bloodColors = ['#8B0000', '#A0151B', '#B22222', '#DC143C'];
      const color = bloodColors[Math.floor(Math.random() * bloodColors.length)];
      
      // Add slight random offset to start position
      const offsetX = x + (Math.random() - 0.5) * 10;
      const offsetY = y + (Math.random() - 0.5) * 10;
      
      this.particles.push(new Particle(offsetX, offsetY, vx, vy, life, size, color));
    }
  }
  
  // Update all particles
  update(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].update();
      
      if (!this.particles[i].isAlive()) {
        this.particles.splice(i, 1);
      }
    }
  }
  
  // Render all particles
  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    
    for (const particle of this.particles) {
      const alpha = particle.getAlpha();
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      
      ctx.beginPath();
      ctx.arc(particle.position.x, particle.position.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Get particle count for debugging
  getParticleCount(): number {
    return this.particles.length;
  }
}
