export interface Upgrades {
  maxHealth: number
  currentHealth: number
  speedBoost: number
  damageMultiplier: number
  fireRate: number
  armor: number
}

export class UpgradeSystem {
  private upgrades: Upgrades = {
    maxHealth: 100,
    currentHealth: 100,
    speedBoost: 1.0,
    damageMultiplier: 1.0,
    fireRate: 0.2,
    armor: 0
  }

  private powerUps: Map<string, { duration: number, effect: any }> = new Map()

  // Permanent upgrades
  upgradeHealth(amount: number = 25) {
    this.upgrades.maxHealth += amount
    this.upgrades.currentHealth = Math.min(this.upgrades.currentHealth + amount, this.upgrades.maxHealth)
  }

  upgradeSpeed(multiplier: number = 1.2) {
    this.upgrades.speedBoost *= multiplier
  }

  upgradeDamage(multiplier: number = 1.5) {
    this.upgrades.damageMultiplier *= multiplier
  }

  upgradeFireRate(divisor: number = 1.5) {
    this.upgrades.fireRate /= divisor
  }

  upgradeArmor(amount: number = 1) {
    this.upgrades.armor += amount
  }

  // Temporary power-ups
  addPowerUp(type: string, duration: number, effect: any) {
    this.powerUps.set(type, { duration, effect })
  }

  // Health management
  takeDamage(amount: number): number {
    const actualDamage = Math.max(0, amount - this.upgrades.armor)
    this.upgrades.currentHealth -= actualDamage
    if (this.upgrades.currentHealth < 0) this.upgrades.currentHealth = 0
    return actualDamage
  }

  heal(amount: number) {
    this.upgrades.currentHealth = Math.min(this.upgrades.currentHealth + amount, this.upgrades.maxHealth)
  }

  // Update power-ups
  update(deltaTime: number) {
    for (const [type, powerUp] of this.powerUps) {
      powerUp.duration -= deltaTime
      if (powerUp.duration <= 0) {
        this.powerUps.delete(type)
      }
    }
  }

  // Getters
  getUpgrades(): Upgrades {
    return { ...this.upgrades }
  }

  getEffectiveSpeed(baseSpeed: number): number {
    let speed = baseSpeed * this.upgrades.speedBoost

    // Check for speed power-up
    if (this.powerUps.has('speed')) {
      speed *= 1.5
    }

    return speed
  }

  getEffectiveDamage(baseDamage: number): number {
    let damage = baseDamage * this.upgrades.damageMultiplier

    // Check for damage power-up
    if (this.powerUps.has('damage')) {
      damage *= 2
    }

    return damage
  }

  getEffectiveFireRate(): number {
    let fireRate = this.upgrades.fireRate

    // Check for rapid fire power-up
    if (this.powerUps.has('rapidFire')) {
      fireRate *= 0.5
    }

    return fireRate
  }

  hasPowerUp(type: string): boolean {
    return this.powerUps.has(type)
  }

  getPowerUpTime(type: string): number {
    const powerUp = this.powerUps.get(type)
    return powerUp ? powerUp.duration : 0
  }
}