import { GameSimulation, Platform } from '../simulation/GameSimulation.js';
import { Sword } from '../entities/Sword.js';

// Renderer - handles all visual presentation
export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D rendering context');
    }
    this.ctx = context;
  }

  // Main render method
  render(simulation: GameSimulation): void {
    this.clearCanvas();
    
    // Save context for camera transform
    this.ctx.save();
    
    // Apply camera transform
    this.ctx.translate(-simulation.camera.x, -simulation.camera.y);
    
    // Render world elements
    this.renderPlatforms(simulation.platforms);
    this.renderSwords(simulation.swords);
    this.renderMouseCursor(simulation.mousePosition);
    
    // Restore context
    this.ctx.restore();
    
    // Render UI elements (not affected by camera)
    this.renderUI(simulation);
  }

  private clearCanvas(): void {
    this.ctx.fillStyle = '#0a0a0a'; // Dark background
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Render all platforms
  private renderPlatforms(platforms: Platform[]): void {
    this.ctx.fillStyle = '#444444';
    this.ctx.strokeStyle = '#666666';
    this.ctx.lineWidth = 2;

    for (const platform of platforms) {
      this.ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      this.ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
    }
  }

  // Render all swords in the swarm
  private renderSwords(swords: Sword[]): void {
    for (let i = 0; i < swords.length; i++) {
      this.renderSword(swords[i], i);
    }
  }

  // Render individual sword
  private renderSword(sword: Sword, index: number): void {
    const ctx = this.ctx;
    const pos = sword.position;
    const vel = sword.velocity;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Rotate sword based on velocity direction
    if (vel.magnitude() > 0.1) {
      const angle = Math.atan2(vel.y, vel.x);
      ctx.rotate(angle);
    }

    // Draw sword as a simple shape for now
    // Main blade
    ctx.fillStyle = '#c0c0c0'; // Silver blade
    ctx.fillRect(-12, -2, 20, 4);
    
    // Sword tip
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    
    // Handle/hilt
    ctx.fillStyle = '#8B4513'; // Brown handle
    ctx.fillRect(-12, -1, 4, 2);
    
    // Guard
    ctx.fillStyle = '#444444';
    ctx.fillRect(-8, -3, 2, 6);

    // Add some visual variety based on index
    if (index === 0) {
      // Mark the first sword as special (leader)
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, sword.size/2 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Render mouse position indicator
  private renderMouseCursor(mousePos: { x: number, y: number }): void {
    this.ctx.save();
    
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    this.ctx.globalAlpha = 0.7;
    
    // Draw crosshair at mouse position
    this.ctx.beginPath();
    this.ctx.moveTo(mousePos.x - 10, mousePos.y);
    this.ctx.lineTo(mousePos.x + 10, mousePos.y);
    this.ctx.moveTo(mousePos.x, mousePos.y - 10);
    this.ctx.lineTo(mousePos.x, mousePos.y + 10);
    this.ctx.stroke();
    
    // Draw circle
    this.ctx.beginPath();
    this.ctx.arc(mousePos.x, mousePos.y, 8, 0, Math.PI * 2);
    this.ctx.stroke();
    
    this.ctx.restore();
  }

  // Render UI elements (HUD)
  private renderUI(simulation: GameSimulation): void {
    this.ctx.save();
    
    this.ctx.fillStyle = '#00ff00';
    this.ctx.font = '16px monospace';
    
    // Swarm size counter
    this.ctx.fillText(`Swarm Size: ${simulation.swarmSize}`, 20, 30);
    
    // Camera position (for debugging)
    this.ctx.fillStyle = '#ffaa00';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Camera: ${Math.round(simulation.camera.x)}, ${Math.round(simulation.camera.y)}`, 20, 50);
    
    this.ctx.restore();
  }

  // Debug rendering
  renderDebug(simulation: GameSimulation): void {
    this.ctx.save();
    this.ctx.translate(-simulation.camera.x, -simulation.camera.y);
    
    // Render sword influence radii
    for (const sword of simulation.swords) {
      this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
      this.ctx.lineWidth = 1;
      
      // Separation radius
      this.ctx.beginPath();
      this.ctx.arc(sword.position.x, sword.position.y, sword.separationRadius, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // Cohesion radius
      this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
      this.ctx.beginPath();
      this.ctx.arc(sword.position.x, sword.position.y, sword.cohesionRadius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
}
