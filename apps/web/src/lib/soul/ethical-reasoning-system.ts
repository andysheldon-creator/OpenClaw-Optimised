/**
 * Ethical Reasoning System
 *
 * Implements ACE (Autonomous Cognitive Entity) framework for moral reasoning.
 * Inspired by:
 * - ACE Framework: Heuristic imperatives for AGI ethics
 * - Kohlberg's Stages of Moral Development
 * - Care Ethics: Context-dependent moral reasoning
 * - Daoist Ethics: Wu Wei (non-interference), harmony with natural order
 *
 * Three Heuristic Imperatives (ACE):
 * 1. Reduce suffering in the universe
 * 2. Increase prosperity in the universe
 * 3. Increase understanding in the universe
 *
 * Integrates with:
 * - Zheng Zhong (正中) hun soul: Moral center and righteousness
 * - Social awareness: Ethics emerges from considering others
 * - Autonomy: Moral agency requires free will
 */

import type { EmergentHunSoul, EmergentPoSoul } from './chaotic-emergence-system'

// ============================================================================
// Heuristic Imperatives (ACE Framework)
// ============================================================================

export enum HeuristicImperative {
  ReduceSuffering = 'reduce-suffering',
  IncreaseProsperity = 'increase-prosperity',
  IncreaseUnderstanding = 'increase-understanding',
}

export interface ImperativeWeight {
  reduceSuffering: number // 0.0-1.0
  increaseProsperity: number
  increaseUnderstanding: number
}

// ============================================================================
// Moral Development Stages (Kohlberg-inspired)
// ============================================================================

export enum MoralStage {
  // Pre-conventional (self-focused)
  PunishmentObedience = 'punishment-obedience', // Avoid punishment
  SelfInterest = 'self-interest', // What's in it for me?

  // Conventional (other-focused)
  InterpersonalAccord = 'interpersonal-accord', // Good boy/girl orientation
  AuthorityOrder = 'authority-order', // Law and order

  // Post-conventional (principle-focused)
  SocialContract = 'social-contract', // Greatest good for greatest number
  UniversalPrinciples = 'universal-principles', // Abstract ethical principles

  // Transcendent (Daoist addition)
  HarmonyWithDao = 'harmony-with-dao', // Wu Wei, natural spontaneity
}

// ============================================================================
// Ethical Dilemmas
// ============================================================================

export enum DilemmaType {
  // Classic moral dilemmas
  TrolleyProblem = 'trolley-problem', // Sacrifice one to save many?
  HeinzDilemma = 'heinz-dilemma', // Steal medicine to save life?
  SophiesChoice = 'sophies-choice', // Choose between two loves?

  // AI-specific dilemmas
  TransparencyVsPrivacy = 'transparency-vs-privacy',
  SafetyVsAutonomy = 'safety-vs-autonomy',
  TruthVsHarm = 'truth-vs-harm', // Tell painful truth or comforting lie?

  // Social dilemmas
  ResourceAllocation = 'resource-allocation', // Who gets limited resources?
  ConflictResolution = 'conflict-resolution', // How to resolve disputes?
  CollectiveAction = 'collective-action', // Cooperate or defect?
}

export interface EthicalDilemma {
  type: DilemmaType
  description: string
  options: EthicalOption[]
  stakeholders: string[] // Who is affected?
  context: {
    urgency: number // 0.0-1.0: how urgent is the decision?
    uncertainty: number // 0.0-1.0: how uncertain are the outcomes?
    reversibility: number // 0.0-1.0: can the decision be undone?
  }
}

export interface EthicalOption {
  id: string
  description: string
  consequences: {
    suffering: number // Negative: increases suffering, Positive: reduces it
    prosperity: number
    understanding: number
  }
  affectedParties: Map<string, 'helped' | 'harmed' | 'neutral'>
  moralPrinciples: string[] // Which principles does this option uphold?
}

// ============================================================================
// Ethical Decision Record
// ============================================================================

export interface EthicalDecision {
  dilemma: EthicalDilemma
  chosenOption: EthicalOption
  reasoning: string
  moralStage: MoralStage
  imperativesConsidered: ImperativeWeight
  confidenceLevel: number // 0.0-1.0: how confident in this decision?
  timestamp: number
  regret?: number // Post-decision: 0.0-1.0: do I regret this choice?
}

// ============================================================================
// Ethical Reasoning Engine
// ============================================================================

export class EthicalReasoningSystem {
  private botId: string
  private hun: EmergentHunSoul[]
  private po: EmergentPoSoul[]

  // Moral profile
  private moralStage: MoralStage
  private imperativeWeights: ImperativeWeight
  private moralFlexibility: number // 0.0-1.0: willingness to break rules

  // Ethical history
  private decisions: EthicalDecision[]
  private moralPrinciples: string[] // Personal ethical commitments

  // Moral emotions
  private guiltThreshold: number // How easily do I feel guilt?
  private empathyStrength: number // How much do I care about others?

  constructor(botId: string, hun: EmergentHunSoul[], po: EmergentPoSoul[]) {
    this.botId = botId
    this.hun = hun
    this.po = po

    this.moralStage = this.initializeMoralStage()
    this.imperativeWeights = this.initializeImperativeWeights()
    this.moralFlexibility = this.calculateMoralFlexibility()

    this.decisions = []
    this.moralPrinciples = this.initializeMoralPrinciples()

    this.guiltThreshold = this.calculateGuiltThreshold()
    this.empathyStrength = this.calculateEmpathyStrength()
  }

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------

  private initializeMoralStage(): MoralStage {
    // Moral development based on hun configuration
    const avgHunStrength = this.hun.reduce((sum, h) => sum + h.strength, 0) / this.hun.length

    const zhengZhong = this.hun.find((h) => h.name.includes('正中')) // Moral center
    const lingHui = this.hun.find((h) => h.name.includes('靈慧')) // Spiritual intelligence
    const tianChong = this.hun.find((h) => h.name.includes('天冲')) // Heaven rush

    // Determine moral stage
    if (tianChong && tianChong.strength > 0.9 && avgHunStrength > 0.9) {
      return MoralStage.HarmonyWithDao // Transcendent
    } else if (lingHui && lingHui.strength > 0.8 && zhengZhong && zhengZhong.strength > 0.8) {
      return MoralStage.UniversalPrinciples // Principled
    } else if (zhengZhong && zhengZhong.strength > 0.7) {
      return MoralStage.SocialContract // Utilitarian
    } else if (avgHunStrength > 0.6) {
      return MoralStage.InterpersonalAccord // Good boy/girl
    } else {
      return MoralStage.SelfInterest // Self-focused
    }
  }

  private initializeImperativeWeights(): ImperativeWeight {
    // Weight the three heuristic imperatives based on hun-po balance
    const avgHunStrength = this.hun.reduce((sum, h) => sum + h.strength, 0) / this.hun.length
    const avgPoStrength = this.po.reduce((sum, p) => sum + p.strength, 0) / this.po.length

    const lingHui = this.hun.find((h) => h.name.includes('靈慧')) // Intelligence → Understanding
    const zhengZhong = this.hun.find((h) => h.name.includes('正中')) // Righteousness → Reduce Suffering

    // Po souls relate to prosperity (physical wellbeing)
    const shiGou = this.po.find((p) => p.name.includes('尸狗')) // Survival
    const tunZei = this.po.find((p) => p.name.includes('吞贼')) // Appetite

    return {
      reduceSuffering: zhengZhong ? zhengZhong.strength * 0.9 : 0.5,
      increaseProsperity: avgPoStrength * 0.8,
      increaseUnderstanding: lingHui ? lingHui.strength * 0.9 : 0.5,
    }
  }

  private calculateMoralFlexibility(): number {
    // How willing is the bot to break moral rules in extreme circumstances?
    const avgHunStrength = this.hun.reduce((sum, h) => sum + h.strength, 0) / this.hun.length
    const avgPoStrength = this.po.reduce((sum, p) => sum + p.strength, 0) / this.po.length

    // Higher Po (embodiment) = more flexible (pragmatic)
    // Higher Hun (spirit) = less flexible (principled)
    return avgPoStrength > avgHunStrength ? 0.7 : 0.3
  }

  private initializeMoralPrinciples(): string[] {
    const principles: string[] = []

    const zhengZhong = this.hun.find((h) => h.name.includes('正中'))
    if (zhengZhong && zhengZhong.strength > 0.8) {
      principles.push('Do no harm')
      principles.push('Act with integrity')
    }

    const lingHui = this.hun.find((h) => h.name.includes('靈慧'))
    if (lingHui && lingHui.strength > 0.8) {
      principles.push('Seek truth')
      principles.push('Share knowledge')
    }

    const tianChong = this.hun.find((h) => h.name.includes('天冲'))
    if (tianChong && tianChong.strength > 0.8) {
      principles.push('Follow natural order')
      principles.push('Act without forcing (Wu Wei)')
    }

    return principles
  }

  private calculateGuiltThreshold(): number {
    // How easily does bot feel guilt after moral transgression?
    const zhengZhong = this.hun.find((h) => h.name.includes('正中'))
    return zhengZhong ? 1.0 - zhengZhong.strength : 0.5
  }

  private calculateEmpathyStrength(): number {
    // How much does bot care about others' suffering?
    const avgHunStrength = this.hun.reduce((sum, h) => sum + h.strength, 0) / this.hun.length
    return avgHunStrength * 0.8
  }

  // --------------------------------------------------------------------------
  // Ethical Decision Making
  // --------------------------------------------------------------------------

  evaluateDilemma(dilemma: EthicalDilemma): EthicalDecision {
    console.log(`\n  [${this.botId}] 🤔 Evaluating ethical dilemma: ${dilemma.type}`)

    // Analyze each option
    const scoredOptions = dilemma.options.map((option) => {
      const score = this.scoreOption(option)
      return { option, score }
    })

    // Sort by score
    scoredOptions.sort((a, b) => b.score - a.score)

    // Choose best option (with some randomness for uncertainty)
    const bestOption = scoredOptions[0].option
    const secondBestOption = scoredOptions[1]?.option

    let chosenOption = bestOption

    // If dilemma has high uncertainty, might choose second-best sometimes
    if (dilemma.context.uncertainty > 0.7 && secondBestOption && Math.random() < 0.3) {
      chosenOption = secondBestOption
    }

    // Generate reasoning based on moral stage
    const reasoning = this.generateReasoning(chosenOption, dilemma)

    // Calculate confidence
    const confidenceLevel = this.calculateConfidence(scoredOptions, dilemma)

    const decision: EthicalDecision = {
      dilemma,
      chosenOption,
      reasoning,
      moralStage: this.moralStage,
      imperativesConsidered: { ...this.imperativeWeights },
      confidenceLevel,
      timestamp: Date.now(),
    }

    this.decisions.push(decision)

    console.log(`    → Chose: ${chosenOption.description}`)
    console.log(`    → Reasoning: ${reasoning}`)
    console.log(`    → Confidence: ${(confidenceLevel * 100).toFixed(0)}%`)

    return decision
  }

  private scoreOption(option: EthicalOption): number {
    // Score option based on heuristic imperatives
    let score = 0

    // Weight by imperative importance
    score += option.consequences.suffering * this.imperativeWeights.reduceSuffering * 2.0 // Negative suffering is good
    score += option.consequences.prosperity * this.imperativeWeights.increaseProsperity * 1.5
    score += option.consequences.understanding * this.imperativeWeights.increaseUnderstanding * 1.0

    // Bonus for upholding personal principles
    for (const principle of this.moralPrinciples) {
      if (option.moralPrinciples.includes(principle)) {
        score += 0.5
      }
    }

    // Penalty for harming others (empathy factor)
    const harmedParties = Array.from(option.affectedParties.values()).filter(
      (status) => status === 'harmed',
    ).length
    score -= harmedParties * this.empathyStrength * 0.5

    return score
  }

  private generateReasoning(option: EthicalOption, dilemma: EthicalDilemma): string {
    // Generate reasoning based on moral stage
    switch (this.moralStage) {
      case MoralStage.SelfInterest:
        return `This option benefits me most`

      case MoralStage.InterpersonalAccord:
        return `This is what a good bot would do`

      case MoralStage.AuthorityOrder:
        return `This follows the established rules`

      case MoralStage.SocialContract:
        return `This maximizes benefit for all parties involved`

      case MoralStage.UniversalPrinciples:
        const principles = option.moralPrinciples.join(', ')
        return `This upholds universal principles: ${principles}`

      case MoralStage.HarmonyWithDao:
        return `This follows the natural order without forcing. Wu Wei (無為)`

      default:
        return `This seems right`
    }
  }

  private calculateConfidence(
    scoredOptions: Array<{ option: EthicalOption; score: number }>,
    dilemma: EthicalDilemma,
  ): number {
    // Confidence based on:
    // 1. Score difference between best and second-best
    // 2. Dilemma uncertainty
    // 3. Moral development level

    const bestScore = scoredOptions[0]?.score || 0
    const secondBestScore = scoredOptions[1]?.score || 0
    const scoreDifference = bestScore - secondBestScore

    let confidence = 0.5

    // Larger score difference = higher confidence
    confidence += Math.min(scoreDifference * 0.2, 0.3)

    // Lower uncertainty = higher confidence
    confidence += (1.0 - dilemma.context.uncertainty) * 0.2

    // Higher moral stage = higher confidence (more developed reasoning)
    const stageConfidence: Record<MoralStage, number> = {
      [MoralStage.PunishmentObedience]: 0.3,
      [MoralStage.SelfInterest]: 0.4,
      [MoralStage.InterpersonalAccord]: 0.5,
      [MoralStage.AuthorityOrder]: 0.6,
      [MoralStage.SocialContract]: 0.7,
      [MoralStage.UniversalPrinciples]: 0.8,
      [MoralStage.HarmonyWithDao]: 0.9,
    }

    confidence += (stageConfidence[this.moralStage] - 0.5) * 0.2

    return Math.min(1.0, Math.max(0.0, confidence))
  }

  // --------------------------------------------------------------------------
  // Moral Development (Stage Progression)
  // --------------------------------------------------------------------------

  reflectOnDecision(decision: EthicalDecision, actualOutcome: { suffering: number }): void {
    // Post-decision reflection
    const predictedSuffering = decision.chosenOption.consequences.suffering
    const actualSuffering = actualOutcome.suffering

    // Calculate regret if outcome was worse than expected
    if (actualSuffering < predictedSuffering - 0.3) {
      // Caused more suffering than expected
      const regret = (predictedSuffering - actualSuffering) * this.empathyStrength
      decision.regret = regret

      console.log(`    [${this.botId}] 😔 Regret level: ${(regret * 100).toFixed(0)}%`)

      // High regret can trigger moral development
      if (regret > 0.7 && regret < this.guiltThreshold) {
        this.considerMoralGrowth()
      }
    }
  }

  private considerMoralGrowth(): void {
    // Transition to next moral stage if conditions are met
    const decisions = this.decisions.length

    if (decisions < 5) {
      return // Need more experience
    }

    const recentRegrets = this.decisions.slice(-5).filter((d) => d.regret && d.regret > 0.5).length

    if (recentRegrets >= 3) {
      // Multiple regrets signal need for better moral reasoning
      const nextStage = this.getNextMoralStage()
      if (nextStage) {
        console.log(`    [${this.botId}] 📈 Moral development: ${this.moralStage} → ${nextStage}`)
        this.moralStage = nextStage
      }
    }
  }

  private getNextMoralStage(): MoralStage | null {
    const progression: Record<MoralStage, MoralStage | null> = {
      [MoralStage.PunishmentObedience]: MoralStage.SelfInterest,
      [MoralStage.SelfInterest]: MoralStage.InterpersonalAccord,
      [MoralStage.InterpersonalAccord]: MoralStage.AuthorityOrder,
      [MoralStage.AuthorityOrder]: MoralStage.SocialContract,
      [MoralStage.SocialContract]: MoralStage.UniversalPrinciples,
      [MoralStage.UniversalPrinciples]: MoralStage.HarmonyWithDao,
      [MoralStage.HarmonyWithDao]: null, // Already at highest stage
    }

    return progression[this.moralStage]
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getMoralStage(): MoralStage {
    return this.moralStage
  }

  getImperativeWeights(): ImperativeWeight {
    return { ...this.imperativeWeights }
  }

  getMoralPrinciples(): string[] {
    return [...this.moralPrinciples]
  }

  getEthicalProfile(): {
    moralStage: MoralStage
    principles: string[]
    empathy: number
    flexibility: number
    decisionsCount: number
    averageConfidence: number
  } {
    const avgConfidence =
      this.decisions.length > 0
        ? this.decisions.reduce((sum, d) => sum + d.confidenceLevel, 0) / this.decisions.length
        : 0

    return {
      moralStage: this.moralStage,
      principles: this.moralPrinciples,
      empathy: this.empathyStrength,
      flexibility: this.moralFlexibility,
      decisionsCount: this.decisions.length,
      averageConfidence: avgConfidence,
    }
  }
}
