/**
 * Animation system for the theater simulator
 * Handles timing, easing, and queue management for all layer animations
 */

import type { AnimationCommand, EasingType } from './types.js';

export class AnimationEngine {
  private isRunning: boolean = true;

  constructor() {
    this.tick = this.tick.bind(this);
    this.start();
  }

  /**
   * Start the animation loop
   */
  start(): void {
    this.isRunning = true;
    requestAnimationFrame(this.tick);
  }

  /**
   * Pause all animations
   */
  pause(): void {
    this.isRunning = false;
  }

  /**
   * Resume all animations
   */
  resume(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      requestAnimationFrame(this.tick);
    }
  }

  /**
   * Main animation loop tick
   */
  private tick(_currentTime: number): void {
    if (!this.isRunning) return;

    // Continue the loop
    requestAnimationFrame(this.tick);
  }

  /**
   * Generate a unique animation ID
   */
  generateId(): string {
    return `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate easing value for animation progress
   */
  static ease(t: number, easing: EasingType): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-out':
        return 1 - Math.pow(1 - t, 3);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      default:
        return t;
    }
  }

  /**
   * Check if animation is complete
   */
  static isComplete(command: AnimationCommand, currentTime: number): boolean {
    return currentTime >= command.startTime + command.duration;
  }

  /**
   * Get animation progress (0-1)
   */
  static getProgress(command: AnimationCommand, currentTime: number): number {
    if (currentTime < command.startTime) return 0;
    if (currentTime >= command.startTime + command.duration) return 1;
    
    const elapsed = currentTime - command.startTime;
    const raw_progress = elapsed / command.duration;
    return AnimationEngine.ease(raw_progress, command.easing);
  }
}

/**
 * Animation queue manager for a specific layer
 */
export class AnimationQueue<T extends AnimationCommand> {
  private queue: T[] = [];

  constructor(_engine: AnimationEngine) {
    // Engine reference available for future use
  }

  /**
   * Add animation command to queue
   */
  add(command: T): void {
    this.queue.push(command);
  }

  /**
   * Process queue and update animations
   */
  update(currentTime: number): T[] {
    const completed: T[] = [];
    
    // Process active animations
    this.queue = this.queue.filter(command => {
      if (AnimationEngine.isComplete(command, currentTime)) {
        completed.push(command);
        if (command.onComplete) {
          command.onComplete();
        }
        return false; // Remove completed animation
      }
      return true; // Keep active animation
    });

    return completed;
  }

  /**
   * Get all active animations
   */
  getActive(): T[] {
    return [...this.queue];
  }

  /**
   * Clear all animations
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get animation by ID
   */
  getById(id: string): T | undefined {
    return this.queue.find(cmd => cmd.id === id);
  }

  /**
   * Remove animation by ID
   */
  removeById(id: string): boolean {
    const index = this.queue.findIndex(cmd => cmd.id === id);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }
}
