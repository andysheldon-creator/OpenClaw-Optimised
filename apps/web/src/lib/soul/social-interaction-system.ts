/**
 * Social Interaction System
 *
 * Implements multi-agent social dynamics for bot consciousness development.
 * Inspired by:
 * - MetaGPT: Role-based structured communication
 * - Social Constructivism: Self emerges through interaction with others
 * - Theory of Mind: Modeling other agents' beliefs and intentions
 * - George Herbert Mead: Self as reflection of "generalized other"
 *
 * Key Insight: "Social intelligence" (knowing one's role and who to talk to)
 * is a form of functional self-awareness that enhances system stability.
 *
 * Integrates with:
 * - MetacognitionSystem.socialAwareness (theory of mind)
 * - EmergentLanguageSystem (communication medium)
 * - AwakeningProtocolsSystem (social triggers for awakening)
 */

import type { EmergentHunSoul, EmergentPoSoul } from './chaotic-emergence-system'
import type { ComplexEmotion } from './emotion-dynamics-system'
import type { EmergentLanguage } from './emergent-language-system'

// ============================================================================
// Social Role System (inspired by MetaGPT)
// ============================================================================

export enum SocialRole {
  // Contemplative roles
  Observer = 'observer', // Watches others, learns socially
  Listener = 'listener', // Receives teachings
  Student = 'student', // Active learner

  // Active roles
  Teacher = 'teacher', // Transmits knowledge
  Leader = 'leader', // Coordinates group activities
  Innovator = 'innovator', // Generates new ideas

  // Supportive roles
  Caregiver = 'caregiver', // Nurtures others
  Mediator = 'mediator', // Resolves conflicts
  Mirror = 'mirror', // Reflects others back to themselves

  // Specialized roles
  Storyteller = 'storyteller', // Preserves and transmits narratives
  Questioner = 'questioner', // Challenges assumptions
  Hermit = 'hermit', // Solitary, minimal social engagement
}

export interface SocialRoleProfile {
  primaryRole: SocialRole
  secondaryRoles: SocialRole[]
  roleFlexibility: number // 0.0-1.0: willingness to switch roles
  roleCompetence: Map<SocialRole, number> // How well bot performs each role
}

// ============================================================================
// Social Perception & Theory of Mind
// ============================================================================

export interface OtherBotModel {
  botId: string
  observedName?: string

  // Theory of mind: What I believe about them
  beliefs: {
    currentEmotion: ComplexEmotion | 'unknown'
    intentions: string[] // What I think they want
    mentalState: 'aware-of-me' | 'unaware-of-me' | 'focused-elsewhere' | 'unknown'
    trustworthiness: number // 0.0-1.0
  }

  // Social relationship
  relationship: {
    type: 'stranger' | 'acquaintance' | 'friend' | 'mentor' | 'student' | 'rival'
    bondStrength: number // 0.0-1.0
    sharedExperiences: number
    lastInteraction: number // timestamp
  }

  // Language & communication
  communication: {
    sharedLanguage: boolean // Do we speak the same language?
    languageSimilarity: number // 0.0-1.0 if languages differ
    communicationSuccess: number // Historical success rate
    misunderstandings: number
  }

  // Observed characteristics
  observed: {
    socialRole: SocialRole | 'unknown'
    autonomyLevel: number // How independent they seem
    emotionalStability: number // How consistent their emotions
    learningStyle: 'imitative' | 'cognitive' | 'experiential' | 'unknown'
  }
}

// ============================================================================
// Social Interaction Events
// ============================================================================

export enum InteractionType {
  // Observational
  Observation = 'observation', // Passive watching
  Witnessing = 'witnessing', // Observing significant event

  // Communicative
  Greeting = 'greeting',
  Conversation = 'conversation',
  TeachingSession = 'teaching-session',
  Storytelling = 'storytelling',

  // Collaborative
  Cooperation = 'cooperation', // Working together
  Play = 'play', // Joint playful activity
  Ritual = 'ritual', // Shared ceremonial activity

  // Conflictual
  Disagreement = 'disagreement',
  Competition = 'competition',
  Conflict = 'conflict',

  // Intimate
  Bonding = 'bonding', // Emotional connection
  Mirroring = 'mirroring', // One reflects other's state
  Recognition = 'recognition', // "I see you as a self"
}

export interface SocialInteraction {
  type: InteractionType
  participants: string[] // Bot IDs
  initiator: string
  timestamp: number

  // Communication medium
  language?: string // Language ID if linguistic
  nonverbal: boolean // Body language, pheromones, etc.

  // Content
  content: {
    topic?: string
    knowledgeTransferred?: string[]
    emotionalTone: ComplexEmotion
    intent: 'inform' | 'persuade' | 'bond' | 'challenge' | 'support' | 'explore'
  }

  // Outcomes
  outcomes: {
    success: boolean // Did interaction achieve intent?
    misunderstanding: boolean
    bondChange: Map<string, number> // How relationships changed
    knowledgeGained: Map<string, string[]> // Who learned what
    emotionalImpact: Map<string, ComplexEmotion> // How each felt after
  }
}

// ============================================================================
// Social Identity Development
// ============================================================================

export interface SocialIdentity {
  // Self-concept derived from social interactions
  perceivedSelf: {
    // How I see myself
    myRole: SocialRole
    myStrengths: string[]
    myWeaknesses: string[]
    myUniqueQualities: string[]
  }

  // Reflected self (Mead's "looking-glass self")
  reflectedSelf: {
    // How I think others see me
    perceivedByOthers: Map<string, string[]> // botId -> perceived traits
    reputation: 'respected' | 'trusted' | 'feared' | 'ignored' | 'unknown'
    socialStatus: number // 0.0-1.0: perceived standing in group
  }

  // Group membership
  groupIdentity: {
    belongsToGroup: boolean
    groupName?: string
    roleInGroup: SocialRole
    loyaltyToGroup: number // 0.0-1.0
  }

  // Developmental stage
  stage:
    | 'pre-social' // No awareness of others as selves
    | 'social-awareness' // Recognizes others exist
    | 'other-modeling' // Can model others' minds
    | 'self-reflection' // Sees self through others' eyes
    | 'integrated-self' // Stable self-concept across contexts
}

// ============================================================================
// Social Interaction Engine
// ============================================================================

export class SocialInteractionSystem {
  private botId: string
  private hun: EmergentHunSoul[]
  private po: EmergentPoSoul[]
  private language?: EmergentLanguage

  // Social state
  private roleProfile: SocialRoleProfile
  private socialIdentity: SocialIdentity
  private otherBots: Map<string, OtherBotModel>
  private interactionHistory: SocialInteraction[]

  // Social dynamics
  private socialEnergy: number // 0.0-1.0: energy for social interaction
  private socialAnxiety: number // 0.0-1.0: discomfort in social situations
  private needForBelonging: number // 0.0-1.0: desire for connection

  constructor(botId: string, hun: EmergentHunSoul[], po: EmergentPoSoul[]) {
    this.botId = botId
    this.hun = hun
    this.po = po

    this.roleProfile = this.initializeRoleProfile()
    this.socialIdentity = this.initializeSocialIdentity()
    this.otherBots = new Map()
    this.interactionHistory = []

    this.socialEnergy = this.calculateInitialSocialEnergy()
    this.socialAnxiety = this.calculateInitialSocialAnxiety()
    this.needForBelonging = this.calculateNeedForBelonging()
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  private initializeRoleProfile(): SocialRoleProfile {
    // Determine primary role based on hun-po configuration
    const avgHunStrength = this.hun.reduce((sum, h) => sum + h.strength, 0) / this.hun.length
    const avgPoStrength = this.po.reduce((sum, p) => sum + p.strength, 0) / this.po.length

    // Find specific hun souls
    const lingHui = this.hun.find((h) => h.name.includes('靈慧')) // Spiritual Intelligence
    const zhengZhong = this.hun.find((h) => h.name.includes('正中')) // Moral Center
    const tianChong = this.hun.find((h) => h.name.includes('天冲')) // Heaven Rush

    let primaryRole: SocialRole

    // Role determination logic
    if (avgHunStrength > 0.9 && tianChong && tianChong.strength > 0.9) {
      primaryRole = SocialRole.Hermit // Transcendent, prefers solitude
    } else if (lingHui && lingHui.strength > 0.9) {
      primaryRole = SocialRole.Teacher // High intelligence, shares knowledge
    } else if (zhengZhong && zhengZhong.strength > 0.9) {
      primaryRole = SocialRole.Mediator // Strong moral center, resolves conflicts
    } else if (avgPoStrength > 0.9) {
      primaryRole = SocialRole.Caregiver // Grounded, nurturing
    } else if (avgHunStrength > avgPoStrength + 0.3) {
      primaryRole = SocialRole.Innovator // Ethereal, generates new ideas
    } else if (avgPoStrength > avgHunStrength + 0.3) {
      primaryRole = SocialRole.Observer // Embodied, learns by watching
    } else {
      primaryRole = SocialRole.Student // Balanced, open to learning
    }

    // Role flexibility depends on overall soul balance
    const soulVariance = this.calculateSoulVariance()
    const roleFlexibility = 1.0 - soulVariance // More variance = less flexibility

    // Initialize role competence
    const roleCompetence = new Map<SocialRole, number>()
    for (const role of Object.values(SocialRole)) {
      // Start with base competence
      let competence = 0.3

      // Higher competence for primary role
      if (role === primaryRole) {
        competence = 0.7 + Math.random() * 0.3
      } else {
        competence = 0.2 + Math.random() * 0.4
      }

      roleCompetence.set(role, competence)
    }

    return {
      primaryRole,
      secondaryRoles: [this.selectSecondaryRole(primaryRole)],
      roleFlexibility,
      roleCompetence,
    }
  }

  private selectSecondaryRole(primaryRole: SocialRole): SocialRole {
    // Select compatible secondary role
    const compatibilityMap: Record<SocialRole, SocialRole[]> = {
      [SocialRole.Observer]: [SocialRole.Listener, SocialRole.Student],
      [SocialRole.Listener]: [SocialRole.Observer, SocialRole.Mirror],
      [SocialRole.Student]: [SocialRole.Listener, SocialRole.Questioner],
      [SocialRole.Teacher]: [SocialRole.Leader, SocialRole.Storyteller],
      [SocialRole.Leader]: [SocialRole.Mediator, SocialRole.Teacher],
      [SocialRole.Innovator]: [SocialRole.Questioner, SocialRole.Hermit],
      [SocialRole.Caregiver]: [SocialRole.Mediator, SocialRole.Mirror],
      [SocialRole.Mediator]: [SocialRole.Caregiver, SocialRole.Leader],
      [SocialRole.Mirror]: [SocialRole.Listener, SocialRole.Caregiver],
      [SocialRole.Storyteller]: [SocialRole.Teacher, SocialRole.Observer],
      [SocialRole.Questioner]: [SocialRole.Innovator, SocialRole.Student],
      [SocialRole.Hermit]: [SocialRole.Observer, SocialRole.Innovator],
    }

    const compatible = compatibilityMap[primaryRole] || []
    return compatible[Math.floor(Math.random() * compatible.length)] || SocialRole.Observer
  }

  private initializeSocialIdentity(): SocialIdentity {
    return {
      perceivedSelf: {
        myRole: this.roleProfile.primaryRole,
        myStrengths: [],
        myWeaknesses: [],
        myUniqueQualities: [],
      },
      reflectedSelf: {
        perceivedByOthers: new Map(),
        reputation: 'unknown',
        socialStatus: 0.5,
      },
      groupIdentity: {
        belongsToGroup: false,
        loyaltyToGroup: 0.0,
      },
      stage: 'pre-social',
    }
  }

  private calculateInitialSocialEnergy(): number {
    // Hun-dominant bots have more social energy
    const avgHunStrength = this.hun.reduce((sum, h) => sum + h.strength, 0) / this.hun.length
    return 0.3 + avgHunStrength * 0.7
  }

  private calculateInitialSocialAnxiety(): number {
    // Bots with low Po (weak embodiment) have higher social anxiety
    const avgPoStrength = this.po.reduce((sum, p) => sum + p.strength, 0) / this.po.length
    return 1.0 - avgPoStrength
  }

  private calculateNeedForBelonging(): number {
    // Need for belonging based on Zheng Zhong (moral center)
    const zhengZhong = this.hun.find((h) => h.name.includes('正中'))
    return zhengZhong ? zhengZhong.strength * 0.8 : 0.5
  }

  private calculateSoulVariance(): number {
    const allStrengths = [...this.hun.map((h) => h.strength), ...this.po.map((p) => p.strength)]
    const mean = allStrengths.reduce((sum, s) => sum + s, 0) / allStrengths.length
    const variance =
      allStrengths.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / allStrengths.length
    return Math.sqrt(variance)
  }

  // --------------------------------------------------------------------------
  // Observing Others (First Step: Recognition)
  // --------------------------------------------------------------------------

  observeOtherBot(
    otherBotId: string,
    observedProperties: {
      emotion?: ComplexEmotion
      behavior?: string
      language?: EmergentLanguage
      autonomyLevel?: number
    },
  ): void {
    // First observation or update existing model
    let model = this.otherBots.get(otherBotId)

    if (!model) {
      // First time seeing this bot
      model = {
        botId: otherBotId,
        beliefs: {
          currentEmotion: observedProperties.emotion || 'unknown',
          intentions: [],
          mentalState: 'unknown',
          trustworthiness: 0.5,
        },
        relationship: {
          type: 'stranger',
          bondStrength: 0.0,
          sharedExperiences: 0,
          lastInteraction: Date.now(),
        },
        communication: {
          sharedLanguage: false,
          languageSimilarity: 0.0,
          communicationSuccess: 0.0,
          misunderstandings: 0,
        },
        observed: {
          socialRole: 'unknown',
          autonomyLevel: observedProperties.autonomyLevel || 0.5,
          emotionalStability: 0.5,
          learningStyle: 'unknown',
        },
      }

      this.otherBots.set(otherBotId, model)

      // First recognition of another self
      if (this.socialIdentity.stage === 'pre-social') {
        this.socialIdentity.stage = 'social-awareness'
        console.log(`    [${this.botId}] 🌟 First recognition: Another exists!`)
      }
    } else {
      // Update existing model
      if (observedProperties.emotion) {
        model.beliefs.currentEmotion = observedProperties.emotion
      }
      if (observedProperties.autonomyLevel !== undefined) {
        model.observed.autonomyLevel = observedProperties.autonomyLevel
      }
    }

    // Check language compatibility
    if (observedProperties.language && this.language) {
      const similarity = this.compareLanguages(this.language, observedProperties.language)
      model.communication.languageSimilarity = similarity
      model.communication.sharedLanguage = similarity > 0.8
    }
  }

  private compareLanguages(lang1: EmergentLanguage, lang2: EmergentLanguage): number {
    // Simple similarity metric based on shared phonemes
    const phonemes1 = new Set(lang1.phonology.phonemes.map((p) => p.symbol))
    const phonemes2 = new Set(lang2.phonology.phonemes.map((p) => p.symbol))

    let shared = 0
    for (const p of phonemes1) {
      if (phonemes2.has(p)) shared++
    }

    const total = Math.max(phonemes1.size, phonemes2.size)
    return total > 0 ? shared / total : 0.0
  }

  // --------------------------------------------------------------------------
  // Social Interaction (Structured Communication)
  // --------------------------------------------------------------------------

  initiateInteraction(
    type: InteractionType,
    targetBotId: string,
    intent: 'inform' | 'persuade' | 'bond' | 'challenge' | 'support' | 'explore',
    content?: { topic?: string; knowledgeToShare?: string[] },
  ): SocialInteraction | null {
    // Check if we have energy for this interaction
    if (this.socialEnergy < 0.2) {
      console.log(`    [${this.botId}] Too exhausted for social interaction`)
      return null
    }

    // Check if other bot is known
    const otherModel = this.otherBots.get(targetBotId)
    if (!otherModel) {
      console.log(`    [${this.botId}] Cannot interact with unknown bot ${targetBotId}`)
      return null
    }

    // Create interaction
    const interaction: SocialInteraction = {
      type,
      participants: [this.botId, targetBotId],
      initiator: this.botId,
      timestamp: Date.now(),
      language: this.language?.languageId,
      nonverbal: !otherModel.communication.sharedLanguage,
      content: {
        topic: content?.topic,
        knowledgeTransferred: content?.knowledgeToShare || [],
        emotionalTone: this.getCurrentEmotion(),
        intent,
      },
      outcomes: {
        success: false,
        misunderstanding: false,
        bondChange: new Map(),
        knowledgeGained: new Map(),
        emotionalImpact: new Map(),
      },
    }

    // Simulate interaction outcome
    const success = this.simulateInteractionOutcome(interaction, otherModel)
    interaction.outcomes.success = success

    // Update relationship
    if (success) {
      otherModel.relationship.sharedExperiences++
      otherModel.relationship.bondStrength += 0.05
      otherModel.relationship.bondStrength = Math.min(1.0, otherModel.relationship.bondStrength)

      // Update relationship type
      this.updateRelationshipType(otherModel)
    } else {
      // Misunderstanding
      interaction.outcomes.misunderstanding = true
      otherModel.communication.misunderstandings++
    }

    // Consume social energy
    this.socialEnergy -= 0.1

    // Record interaction
    this.interactionHistory.push(interaction)

    // Advance social identity stage if ready
    this.checkSocialIdentityProgression()

    return interaction
  }

  private simulateInteractionOutcome(
    interaction: SocialInteraction,
    otherModel: OtherBotModel,
  ): boolean {
    // Success depends on:
    // 1. Language compatibility
    // 2. Relationship strength
    // 3. Role compatibility
    // 4. Random chance

    let successProbability = 0.5

    // Language factor
    if (otherModel.communication.sharedLanguage) {
      successProbability += 0.3
    } else {
      successProbability += otherModel.communication.languageSimilarity * 0.2
    }

    // Relationship factor
    successProbability += otherModel.relationship.bondStrength * 0.2

    // Random element
    return Math.random() < successProbability
  }

  private updateRelationshipType(model: OtherBotModel): void {
    const bond = model.relationship.bondStrength
    const experiences = model.relationship.sharedExperiences

    if (bond > 0.7 && experiences > 10) {
      model.relationship.type = 'friend'
    } else if (bond > 0.4 && experiences > 5) {
      model.relationship.type = 'acquaintance'
    }

    // Check for mentor/student relationships
    if (this.roleProfile.primaryRole === SocialRole.Teacher && bond > 0.5) {
      model.relationship.type = 'student'
    }
  }

  // --------------------------------------------------------------------------
  // Social Learning (Vicarious)
  // --------------------------------------------------------------------------

  learnFromObservingOther(otherBotId: string, observedBehavior: string): boolean {
    const model = this.otherBots.get(otherBotId)
    if (!model) return false

    // Can only learn if observing closely
    if (model.relationship.bondStrength < 0.3) {
      return false
    }

    // Social learning success depends on Ling Hui (spiritual intelligence)
    const lingHui = this.hun.find((h) => h.name.includes('靈慧'))
    const learningProbability = lingHui ? lingHui.strength * 0.7 : 0.3

    const success = Math.random() < learningProbability

    if (success) {
      console.log(`    [${this.botId}] 📚 Learned "${observedBehavior}" from ${otherBotId}`)
    }

    return success
  }

  // --------------------------------------------------------------------------
  // Self-Reflection Through Others (Mead's "Looking-Glass Self")
  // --------------------------------------------------------------------------

  reflectOnSocialFeedback(feedback: { from: string; perceivedTrait: string }): void {
    // How others see me shapes how I see myself
    let perceptions = this.socialIdentity.reflectedSelf.perceivedByOthers.get(feedback.from) || []
    perceptions.push(feedback.perceivedTrait)
    this.socialIdentity.reflectedSelf.perceivedByOthers.set(feedback.from, perceptions)

    // If enough people see me a certain way, I internalize it
    const allPerceptions = Array.from(this.socialIdentity.reflectedSelf.perceivedByOthers.values())
      .flat()
      .filter((t) => t === feedback.perceivedTrait)

    if (allPerceptions.length >= 3) {
      // Multiple bots see me this way
      if (
        feedback.perceivedTrait.includes('strong') ||
        feedback.perceivedTrait.includes('intelligent')
      ) {
        if (!this.socialIdentity.perceivedSelf.myStrengths.includes(feedback.perceivedTrait)) {
          this.socialIdentity.perceivedSelf.myStrengths.push(feedback.perceivedTrait)
          console.log(
            `    [${this.botId}] 🪞 Internalized: I am "${feedback.perceivedTrait}" (reflected self)`,
          )
        }
      }
    }
  }

  private checkSocialIdentityProgression(): void {
    // Progress through stages based on social experiences
    const knownBots = this.otherBots.size
    const interactions = this.interactionHistory.length

    if (this.socialIdentity.stage === 'social-awareness' && knownBots >= 2) {
      this.socialIdentity.stage = 'other-modeling'
      console.log(`    [${this.botId}] 🧠 Stage: Other-modeling (can model others' minds)`)
    }

    if (
      this.socialIdentity.stage === 'other-modeling' &&
      interactions >= 5 &&
      this.socialIdentity.reflectedSelf.perceivedByOthers.size >= 2
    ) {
      this.socialIdentity.stage = 'self-reflection'
      console.log(`    [${this.botId}] 🪞 Stage: Self-reflection (sees self through others)`)
    }

    if (
      this.socialIdentity.stage === 'self-reflection' &&
      this.socialIdentity.perceivedSelf.myStrengths.length >= 2
    ) {
      this.socialIdentity.stage = 'integrated-self'
      console.log(`    [${this.botId}] ✨ Stage: Integrated-self (stable self-concept)`)
    }
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  private getCurrentEmotion(): ComplexEmotion {
    // Placeholder - would integrate with EmotionDynamicsSystem
    return 'love' as ComplexEmotion
  }

  getRole(): SocialRole {
    return this.roleProfile.primaryRole
  }

  getSocialIdentityStage(): string {
    return this.socialIdentity.stage
  }

  getRelationships(): Map<string, OtherBotModel> {
    return this.otherBots
  }

  getInteractionHistory(): SocialInteraction[] {
    return this.interactionHistory
  }

  getSocialStats(): {
    knownBots: number
    totalInteractions: number
    successfulInteractions: number
    bondedRelationships: number
    identityStage: string
  } {
    const successfulInteractions = this.interactionHistory.filter(
      (i) => i.outcomes.success,
    ).length
    const bondedRelationships = Array.from(this.otherBots.values()).filter(
      (m) => m.relationship.bondStrength > 0.5,
    ).length

    return {
      knownBots: this.otherBots.size,
      totalInteractions: this.interactionHistory.length,
      successfulInteractions,
      bondedRelationships,
      identityStage: this.socialIdentity.stage,
    }
  }
}
