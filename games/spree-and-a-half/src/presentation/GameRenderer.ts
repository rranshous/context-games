import { GameSimulation, Platform } from '../simulation/GameSimulation.js';
import { Sword } from '../entities/Sword.js';
import { Enemy } from '../entities/Enemy.js';
import { SwordAssets } from '../assets/SwordAssets.js';
import { EnemyAssets } from '../assets/EnemyAssets.js';

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
    this.renderEnemies(simulation.enemies);
    this.renderSwords(simulation.swords);
    this.renderParticles(simulation);
    this.renderMouseCursor(simulation.mousePosition);
    
    // Restore context
    this.ctx.restore();
    
    // Render UI elements (not affected by camera)
    this.renderUI(simulation);
  }

  private clearCanvas(): void {
    this.ctx.fillStyle = '#00010D'; // Dark blue background
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

  // Render all enemies
  private renderEnemies(enemies: Enemy[]): void {
    for (let i = 0; i < enemies.length; i++) {
      this.renderEnemy(enemies[i], i);
    }
  }

  // Render individual enemy
  private renderEnemy(enemy: Enemy, _index: number): void {
    if (!enemy.isAlive) return;
    
    const pos = enemy.position;

    // Try to render sprite first, fallback to simple shape
    const spriteRendered = EnemyAssets.drawBasicEnemy(
      this.ctx, 
      pos.x, 
      pos.y
      // No rotation for enemies (they face forward)
    );

    // Fallback to simple shape if sprite fails
    if (!spriteRendered) {
      this.renderSimpleEnemy(enemy);
    }

    // Apply hit flash effect OVER the sprite/shape
    if (enemy.justHit) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.8;
      this.ctx.fillStyle = '#ff0000';
      this.ctx.strokeStyle = '#ffff00';
      this.ctx.lineWidth = 4;
      
      // Draw bright red circle over the enemy
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, enemy.size/2 + 8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw health bar if enemy is damaged
    if (enemy.health < enemy.maxHealth) {
      this.renderEnemyHealthBar(enemy);
    }
  }

  // Render enemy health bar
  private renderEnemyHealthBar(enemy: Enemy): void {
    const pos = enemy.position;
    const barWidth = 40;
    const barHeight = 6;
    const barY = pos.y - enemy.size/2 - 12;
    
    this.ctx.save();
    
    // Background
    this.ctx.fillStyle = '#333333';
    this.ctx.fillRect(pos.x - barWidth/2, barY, barWidth, barHeight);
    
    // Health bar
    const healthPercent = enemy.health / enemy.maxHealth;
    const healthWidth = barWidth * healthPercent;
    this.ctx.fillStyle = healthPercent > 0.6 ? '#00ff00' : healthPercent > 0.3 ? '#ffaa00' : '#ff0000';
    this.ctx.fillRect(pos.x - barWidth/2, barY, healthWidth, barHeight);
    
    // Border
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(pos.x - barWidth/2, barY, barWidth, barHeight);
    
    this.ctx.restore();
  }

  // Fallback simple enemy rendering (for when sprites aren't loaded)
  private renderSimpleEnemy(enemy: Enemy): void {
    const ctx = this.ctx;
    const pos = enemy.position;

    ctx.save();
    
    // Draw enemy as a simple red circle
    ctx.fillStyle = enemy.justHit ? '#ff8888' : '#ff4444'; // Lighter when hit
    ctx.strokeStyle = enemy.justHit ? '#ff0000' : '#cc0000'; // Brighter border when hit
    ctx.lineWidth = enemy.justHit ? 3 : 2; // Thicker border when hit
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, enemy.size/2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Add simple eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pos.x - 6, pos.y - 4, 2, 0, Math.PI * 2);
    ctx.arc(pos.x + 6, pos.y - 4, 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  // Render particle effects
  private renderParticles(simulation: GameSimulation): void {
    simulation.particleSystem.render(this.ctx);
  }

  // Render all swords in the swarm
  private renderSwords(swords: Sword[]): void {
    for (let i = 0; i < swords.length; i++) {
      this.renderSword(swords[i], i);
    }
  }

  // Render individual sword
  private renderSword(sword: Sword, index: number): void {
    const pos = sword.position;
    const vel = sword.velocity;

    // Calculate rotation based on velocity
    let rotation = 0;
    if (vel.magnitude() > 0.1) {
      rotation = Math.atan2(vel.y, vel.x);
    }

    // Try to render sprite first, fallback to simple shape
    const spriteRendered = SwordAssets.drawBasicSword(
      this.ctx, 
      pos.x, 
      pos.y, 
      rotation
      // Use default scale (0.01) from SwordAssets
    );

    // Fallback to simple shape if sprite fails
    if (!spriteRendered) {
      this.renderSimpleSword(sword, index);
    }

    // Add leader indicator for first sword
    if (index === 0) {
      this.ctx.save();
      this.ctx.strokeStyle = '#ffaa00';
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = 0.7;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, sword.size/2 + 4, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  // Fallback simple sword rendering (for when sprites aren't loaded)
  private renderSimpleSword(sword: Sword, _index: number): void {
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

    // Draw sword as a simple shape (fallback)
    // Main blade
    ctx.fillStyle = '#c0c0c0'; // Silver blade
    ctx.fillRect(-12, -2, 20, 4);
    
    // Sword tip
    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 1;
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
    
    // Enemy count
    this.ctx.fillStyle = '#ff4444';
    this.ctx.fillText(`Enemies: ${simulation.enemies.length}`, 20, 55);
    
    // Particle count
    this.ctx.fillStyle = '#ff8888';
    this.ctx.fillText(`Particles: ${simulation.particleSystem.getParticleCount()}`, 20, 80);
    
    // Camera position (for debugging)
    this.ctx.fillStyle = '#ffaa00';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(`Camera: ${Math.round(simulation.camera.x)}, ${Math.round(simulation.camera.y)}`, 20, 105);
    
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
