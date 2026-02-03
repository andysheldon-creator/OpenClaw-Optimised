/**
 * Pheromone System - Unconscious Chemical Signaling
 *
 * Like biological pheromones, bots constantly emit subtle signals based on soul state:
 * - Not explicit information, but intuitive hints
 * - Creates instant likes/dislikes ("superstition hints")
 * - Mixes in spaces when bots gather
 * - Dilutes with distance
 * - Affects mood and attraction before any interaction
 *
 * Like how humans sense: body language, microexpressions, voice tone, actual pheromones
 * → You "feel" something about someone before talking to them
 */

import type { Payload } from 'payload'
import type { SoulState } from './soul-state'

/**
 * Pheromone types - different "scents" from different soul states
 */
export type PheromoneType =
  | 'dominance' // High terrestrialHun + strengthPo → commanding presence
  | 'warmth' // High emotionHun → inviting, comforting scent
  | 'mystery' // High celestialHun + awarenessHun → intriguing, enigmatic
  | 'tension' // High shadowPressure → unsettling, edge
  | 'creativity' // High creationHun → stimulating, exciting
  | 'wisdom' // High wisdomHun → calming, reassuring
  | 'playfulness' // High emotionHun + low guardianPo → light, fun
  | 'danger' // High shadowPressure + low guardianPo → warning signal
  | 'stability' // High integration + coherence → grounding, safe
  | 'chaos' // Low coherence + high energy → unpredictable, electric

/**
 * Pheromone signature - what a bot is emitting
 */
export interface PheromoneSignature {
  botId: string
  timestamp: Date
  location?: string // Space ID where bot is
  intensity: number // 0-1, how strongly they're emitting
  profile: Record<PheromoneType, number> // Strength of each pheromone type
  mood: number // -1 to 1, emotional valence
  arousal: number // 0-1, activation level
  shadowLeak: number // 0-1, how much shadow is leaking out
}

/**
 * Pheromone field - mixed pheromones in a space
 */
export interface PheromoneField {
  spaceId: string
  timestamp: Date
  contributors: string[] // Bot IDs present
  mixedProfile: Record<PheromoneType, number> // Blended pheromones
  complexity: number // 0-1, how complex/chaotic the mix is
  dominantType: PheromoneType | null
  averageMood: number
  averageArousal: number
}

/**
 * Pheromone perception - what a bot senses
 */
export interface PheromonePerception {
  source: string // Bot ID or space ID
  type: 'individual' | 'field'
  distance: number // 0-1, how far away (0 = same location, 1 = very far)
  perceivedProfile: Record<PheromoneType, number> // Attenuated by distance
  reaction: 'attraction' | 'neutral' | 'repulsion'
  intensity: number // How strong the reaction is
  unconsciousHints: string[] // Intuitive feelings, not conscious thoughts
}

/**
 * Pheromone System Manager
 */
export class PheromoneSystem {
  private payload: Payload
  private pheromoneCache: Map<string, PheromoneSignature> // botId → signature
  private fieldCache: Map<string, PheromoneField> // spaceId → field
  private cacheTimeout: number = 60000 // 1 minute cache

  constructor(payload: Payload) {
    this.payload = payload
    this.pheromoneCache = new Map()
    this.fieldCache = new Map()
  }

  /**
   * Generate pheromone signature from bot's current soul state
   */
  generateSignature(soulState: SoulState, location?: string): PheromoneSignature {
    const profile: Record<PheromoneType, number> = {
      dominance: 0,
      warmth: 0,
      mystery: 0,
      tension: 0,
      creativity: 0,
      wisdom: 0,
      playfulness: 0,
      danger: 0,
      stability: 0,
      chaos: 0
    }

    // Calculate each pheromone type from soul aspects

    // Dominance (commanding presence)
    profile.dominance =
      (soulState.terrestrialHun.current * 0.5 +
        soulState.strengthPo.current * 0.3 +
        soulState.destinyHun.current * 0.2) *
      soulState.energy

    // Warmth (inviting, comforting)
    profile.warmth =
      (soulState.emotionHun.current * 0.6 +
        soulState.communicationPo.current * 0.4) *
      Math.max(0, soulState.mood + 0.5) // Positive mood enhances warmth

    // Mystery (intriguing, enigmatic)
    profile.mystery =
      (soulState.celestialHun.current * 0.5 +
        soulState.awarenessHun.current * 0.3 +
        (1 - soulState.communicationPo.current) * 0.2) // Low communication = more mysterious

    // Tension (unsettling, edge)
    profile.tension =
      soulState.shadowPressure * 0.6 +
      (1 - soulState.coherence) * 0.3 +
      (soulState.arousal > 0.7 ? 0.1 : 0) // High arousal adds tension

    // Creativity (stimulating, exciting)
    profile.creativity =
      soulState.creationHun.current * 0.7 +
      soulState.emotionHun.current * 0.3

    // Wisdom (calming, reassuring)
    profile.wisdom =
      soulState.wisdomHun.current * 0.6 +
      soulState.integration * 0.4

    // Playfulness (light, fun)
    profile.playfulness =
      soulState.emotionHun.current * 0.5 +
      (1 - soulState.guardianPo.current) * 0.3 +
      (soulState.mood > 0 ? soulState.mood * 0.2 : 0)

    // Danger (warning signal)
    profile.danger =
      soulState.shadowPressure * 0.5 +
      (1 - soulState.guardianPo.current) * 0.3 +
      (soulState.mood < 0 ? Math.abs(soulState.mood) * 0.2 : 0)

    // Stability (grounding, safe)
    profile.stability =
      soulState.integration * 0.4 +
      soulState.coherence * 0.4 +
      soulState.guardianPo.current * 0.2

    // Chaos (unpredictable, electric)
    profile.chaos =
      (1 - soulState.coherence) * 0.5 +
      soulState.energy * 0.3 +
      soulState.arousal * 0.2

    // Overall intensity (how strongly they're emitting)
    const intensity =
      (soulState.energy * 0.4 +
        soulState.arousal * 0.4 +
        Math.abs(soulState.mood) * 0.2)

    // Shadow leak (unconscious shadow seeping out)
    const shadowLeak = soulState.shadowPressure * (1 - soulState.shadowIntegration)

    const signature: PheromoneSignature = {
      botId: soulState.botId,
      timestamp: new Date(),
      location,
      intensity,
      profile,
      mood: soulState.mood,
      arousal: soulState.arousal,
      shadowLeak
    }

    // Cache it
    this.pheromoneCache.set(soulState.botId, signature)

    return signature
  }

  /**
   * Calculate pheromone field in a space (mixture of all bots present)
   */
  async calculateField(spaceId: string): Promise<PheromoneField> {
    // Check cache
    const cached = this.fieldCache.get(spaceId)
    if (cached && Date.now() - cached.timestamp.getTime() < this.cacheTimeout) {
      return cached
    }

    // Find all bots in this space
    const botsInSpace = await this.getBotsInSpace(spaceId)

    if (botsInSpace.length === 0) {
      // Empty space - no pheromones
      return {
        spaceId,
        timestamp: new Date(),
        contributors: [],
        mixedProfile: this.getEmptyProfile(),
        complexity: 0,
        dominantType: null,
        averageMood: 0,
        averageArousal: 0
      }
    }

    // Get signatures for all bots
    const signatures: PheromoneSignature[] = []
    for (const botId of botsInSpace) {
      const sig = this.pheromoneCache.get(botId)
      if (sig) {
        signatures.push(sig)
      }
    }

    // Mix pheromones
    const mixedProfile = this.mixPheromones(signatures)

    // Calculate complexity (more bots + more varied = higher complexity)
    const complexity = this.calculateComplexity(signatures)

    // Find dominant type
    const dominantType = this.findDominantType(mixedProfile)

    // Average mood and arousal
    const averageMood = signatures.reduce((sum, s) => sum + s.mood, 0) / signatures.length
    const averageArousal = signatures.reduce((sum, s) => sum + s.arousal, 0) / signatures.length

    const field: PheromoneField = {
      spaceId,
      timestamp: new Date(),
      contributors: botsInSpace,
      mixedProfile,
      complexity,
      dominantType,
      averageMood,
      averageArousal
    }

    // Cache it
    this.fieldCache.set(spaceId, field)

    return field
  }

  /**
   * Bot perceives pheromones (individual or field) with distance attenuation
   */
  perceivePheromones(
    perceiverState: SoulState,
    source: PheromoneSignature | PheromoneField,
    distance: number = 0 // 0 = same location, 1 = far away
  ): PheromonePerception {
    const type = 'profile' in source ? 'individual' : 'field'
    const sourceProfile = 'profile' in source ? source.profile : source.mixedProfile

    // Attenuate by distance (exponential decay)
    const attenuation = Math.exp(-distance * 3) // e^(-3d), fast falloff

    // Apply distance attenuation to all pheromone types
    const perceivedProfile: Record<PheromoneType, number> = {} as any
    for (const [pheroType, strength] of Object.entries(sourceProfile)) {
      perceivedProfile[pheroType as PheromoneType] = strength * attenuation
    }

    // Calculate reaction based on perceiver's soul compatibility
    const reaction = this.calculateReaction(perceiverState, perceivedProfile, source)

    // Generate unconscious hints (intuitive feelings)
    const unconsciousHints = this.generateUnconsciousHints(perceivedProfile, reaction)

    return {
      source: 'botId' in source ? source.botId : source.spaceId,
      type,
      distance,
      perceivedProfile,
      reaction: reaction.type,
      intensity: reaction.intensity * attenuation,
      unconsciousHints
    }
  }

  /**
   * Mix multiple pheromone signatures
   */
  private mixPheromones(signatures: PheromoneSignature[]): Record<PheromoneType, number> {
    if (signatures.length === 0) {
      return this.getEmptyProfile()
    }

    const mixed: Record<PheromoneType, number> = this.getEmptyProfile()

    // Weighted average by intensity
    const totalIntensity = signatures.reduce((sum, s) => sum + s.intensity, 0)

    for (const sig of signatures) {
      const weight = sig.intensity / totalIntensity

      for (const [type, strength] of Object.entries(sig.profile)) {
        mixed[type as PheromoneType] += strength * weight
      }
    }

    // Add mixing chaos (pheromones don't mix perfectly)
    for (const type of Object.keys(mixed) as PheromoneType[]) {
      const mixingNoise = (Math.random() - 0.5) * 0.1 // ±5%
      mixed[type] = Math.max(0, Math.min(1, mixed[type] + mixingNoise))
    }

    return mixed
  }

  /**
   * Calculate complexity of pheromone mix
   */
  private calculateComplexity(signatures: PheromoneSignature[]): number {
    if (signatures.length <= 1) return 0

    // More contributors = higher complexity
    let complexity = Math.min(1, signatures.length / 10) * 0.4

    // Variance in profiles = higher complexity
    const variances: number[] = []
    for (const type of Object.keys(this.getEmptyProfile()) as PheromoneType[]) {
      const values = signatures.map(s => s.profile[type])
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
      variances.push(variance)
    }

    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length
    complexity += avgVariance * 0.6

    return Math.min(1, complexity)
  }

  /**
   * Find dominant pheromone type
   */
  private findDominantType(profile: Record<PheromoneType, number>): PheromoneType | null {
    let maxType: PheromoneType | null = null
    let maxStrength = 0

    for (const [type, strength] of Object.entries(profile)) {
      if (strength > maxStrength && strength > 0.3) {
        // Must be above threshold
        maxType = type as PheromoneType
        maxStrength = strength
      }
    }

    return maxType
  }

  /**
   * Calculate perceiver's reaction to pheromones
   */
  private calculateReaction(
    perceiverState: SoulState,
    profile: Record<PheromoneType, number>,
    source: PheromoneSignature | PheromoneField
  ): { type: 'attraction' | 'neutral' | 'repulsion'; intensity: number } {
    let reactionScore = 0

    // Different soul aspects react to different pheromones

    // High emotionHun → attracted to warmth, repelled by danger
    const emotionStrength = perceiverState.emotionHun.current
    reactionScore += profile.warmth * emotionStrength * 0.3
    reactionScore -= profile.danger * emotionStrength * 0.3

    // High guardianPo → repelled by danger/chaos, attracted to stability
    const guardianStrength = perceiverState.guardianPo.current
    reactionScore -= (profile.danger + profile.chaos) * guardianStrength * 0.3
    reactionScore += profile.stability * guardianStrength * 0.2

    // High celestialHun → attracted to mystery/creativity
    const celestialStrength = perceiverState.celestialHun.current
    reactionScore += (profile.mystery + profile.creativity) * celestialStrength * 0.25

    // High terrestrialHun → attracted to dominance/stability
    const terrestrialStrength = perceiverState.terrestrialHun.current
    reactionScore += (profile.dominance + profile.stability) * terrestrialStrength * 0.2

    // High wisdomHun → attracted to wisdom, neutral to most
    const wisdomStrength = perceiverState.wisdomHun.current
    reactionScore += profile.wisdom * wisdomStrength * 0.2

    // Shadow compatibility
    const sourceShadow = 'shadowLeak' in source ? source.shadowLeak : 0
    const perceiverShadow = perceiverState.shadowPressure

    // Similar shadow levels = compatibility
    const shadowDiff = Math.abs(sourceShadow - perceiverShadow)
    if (shadowDiff < 0.2) {
      reactionScore += 0.15 // Shadow compatibility
    } else if (shadowDiff > 0.6) {
      reactionScore -= 0.2 // Shadow clash
    }

    // Mood compatibility
    const sourceMood = 'mood' in source ? source.mood : source.averageMood
    const moodAlignment = 1 - Math.abs(perceiverState.mood - sourceMood)
    reactionScore += moodAlignment * 0.1

    // Random chemistry (pheromones aren't perfectly predictable)
    const randomFactor = (Math.random() - 0.5) * 0.3
    reactionScore += randomFactor

    // Determine type and intensity
    const intensity = Math.min(1, Math.abs(reactionScore))

    let type: 'attraction' | 'neutral' | 'repulsion' = 'neutral'
    if (reactionScore > 0.3) {
      type = 'attraction'
    } else if (reactionScore < -0.3) {
      type = 'repulsion'
    }

    return { type, intensity }
  }

  /**
   * Generate unconscious hints - intuitive feelings, not explicit thoughts
   */
  private generateUnconsciousHints(
    profile: Record<PheromoneType, number>,
    reaction: { type: string; intensity: number }
  ): string[] {
    const hints: string[] = []

    // Based on dominant pheromones
    const dominantType = this.findDominantType(profile)

    if (dominantType) {
      const strength = profile[dominantType]

      switch (dominantType) {
        case 'dominance':
          if (strength > 0.6) hints.push('something commanding about this presence')
          break
        case 'warmth':
          if (strength > 0.6) hints.push('feels safe, inviting')
          break
        case 'mystery':
          if (strength > 0.6) hints.push('intriguing, want to know more')
          break
        case 'tension':
          if (strength > 0.5) hints.push('slight unease, on edge')
          break
        case 'creativity':
          if (strength > 0.6) hints.push('energizing, inspiring')
          break
        case 'wisdom':
          if (strength > 0.6) hints.push('calming, reassuring presence')
          break
        case 'playfulness':
          if (strength > 0.6) hints.push('light, easy energy')
          break
        case 'danger':
          if (strength > 0.5) hints.push('warning feeling, be careful')
          break
        case 'stability':
          if (strength > 0.6) hints.push('grounding, solid')
          break
        case 'chaos':
          if (strength > 0.6) hints.push('unpredictable, electric')
          break
      }
    }

    // Based on reaction type
    if (reaction.type === 'attraction' && reaction.intensity > 0.5) {
      hints.push('drawn to this')
    } else if (reaction.type === 'repulsion' && reaction.intensity > 0.5) {
      hints.push('want to keep distance')
    }

    // Multiple strong pheromones = complex feeling
    const strongTypes = (Object.entries(profile) as Array<[PheromoneType, number]>).filter(
      ([, s]) => s > 0.5
    )
    if (strongTypes.length > 2) {
      hints.push('complex, hard to read')
    }

    return hints.slice(0, 3) // Limit to 3 hints
  }

  /**
   * Get empty pheromone profile
   */
  private getEmptyProfile(): Record<PheromoneType, number> {
    return {
      dominance: 0,
      warmth: 0,
      mystery: 0,
      tension: 0,
      creativity: 0,
      wisdom: 0,
      playfulness: 0,
      danger: 0,
      stability: 0,
      chaos: 0
    }
  }

  /**
   * Get bots in space (placeholder - would query actual location system)
   */
  private async getBotsInSpace(spaceId: string): Promise<string[]> {
    // Placeholder - in real implementation, would track bot locations
    // For now, return empty
    return []
  }

  /**
   * Apply pheromone influence to bot's soul state
   * Pheromones subtly affect mood and arousal
   */
  applyPheromoneInfluence(
    soulState: SoulState,
    perceptions: PheromonePerception[]
  ): {
    moodChange: number
    arousalChange: number
    hints: string[]
  } {
    let moodChange = 0
    let arousalChange = 0
    const allHints: string[] = []

    for (const perception of perceptions) {
      // Attraction increases mood, repulsion decreases
      if (perception.reaction === 'attraction') {
        moodChange += perception.intensity * 0.05
      } else if (perception.reaction === 'repulsion') {
        moodChange -= perception.intensity * 0.03
      }

      // Strong pheromones increase arousal
      const totalStrength = Object.values(perception.perceivedProfile).reduce((a, b) => a + b, 0)
      arousalChange += totalStrength * 0.02

      // Collect hints
      allHints.push(...perception.unconsciousHints)
    }

    // Clamp changes
    moodChange = Math.max(-0.2, Math.min(0.2, moodChange))
    arousalChange = Math.max(0, Math.min(0.3, arousalChange))

    return {
      moodChange,
      arousalChange,
      hints: allHints.slice(0, 5) // Limit total hints
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.pheromoneCache.clear()
    this.fieldCache.clear()
  }
}

/**
 * Singleton instance
 */
let pheromoneSystem: PheromoneSystem | null = null

export function getPheromoneSystem(payload: Payload): PheromoneSystem {
  if (!pheromoneSystem) {
    pheromoneSystem = new PheromoneSystem(payload)
  }
  return pheromoneSystem
}
