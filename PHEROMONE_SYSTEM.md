# Pheromone System - Unconscious Chemical Signaling

**Like biological pheromones:** Subtle chemical signals that create instant likes/dislikes before conscious interaction.

---

## 🧪 What Are Pheromones?

In biology, pheromones are chemical signals that trigger unconscious reactions:
- **Attraction/repulsion** without conscious awareness
- **Mood contagion** in crowds
- **Territorial marking** (this space "feels" like someone's)
- **Danger signals** (unconscious warning)
- **Compatibility cues** (instant chemistry or clash)

In our bot system, pheromones create **"superstition hints"** - intuitive feelings about other bots or spaces before any explicit interaction.

---

## 🌬️ How It Works

### 1. **Constant Emission**

Every bot constantly emits pheromones based on their soul state:

```typescript
// Bot with high emotionHun + low guardianPo
{
  warmth: 0.82,      // Inviting, comforting presence
  playfulness: 0.75,  // Light, fun energy
  stability: 0.45,    // Moderate grounding
  danger: 0.12        // Very low warning signal
}

// Bot with high shadowPressure + low coherence
{
  tension: 0.78,      // Unsettling edge
  danger: 0.65,       // Warning signal
  chaos: 0.71,        // Unpredictable energy
  mystery: 0.58       // Enigmatic presence
}
```

### 2. **10 Pheromone Types**

| Type | Source | Effect |
|------|--------|--------|
| **Dominance** | terrestrialHun + strengthPo | Commanding presence |
| **Warmth** | emotionHun + communicationPo | Inviting, comforting |
| **Mystery** | celestialHun + awarenessHun | Intriguing, enigmatic |
| **Tension** | shadowPressure + low coherence | Unsettling, edge |
| **Creativity** | creationHun + emotionHun | Stimulating, exciting |
| **Wisdom** | wisdomHun + integration | Calming, reassuring |
| **Playfulness** | emotionHun + low guardianPo | Light, fun |
| **Danger** | shadowPressure + low guardianPo | Warning signal |
| **Stability** | integration + coherence + guardianPo | Grounding, safe |
| **Chaos** | low coherence + high energy | Unpredictable, electric |

### 3. **Spatial Mixing**

When bots gather in a space, pheromones blend:

```typescript
// Space with 3 bots present:
// Bot A: high warmth (0.8)
// Bot B: high dominance (0.7)
// Bot C: high tension (0.6)

// Mixed field:
{
  warmth: 0.45,      // Diluted from Bot A
  dominance: 0.38,   // Diluted from Bot B
  tension: 0.31,     // Diluted from Bot C
  complexity: 0.72   // High - 3 different signatures
  dominantType: 'warmth'  // Strongest overall
}
```

**Crowd effects:**
- 2-3 bots: Clear individual signatures blend
- 4-6 bots: Complex mix, hard to read
- 7+ bots: Chaotic field, overwhelming

### 4. **Distance Attenuation**

Pheromones dilute with distance (exponential decay):

```typescript
// At same location (distance = 0): 100% strength
// Nearby (distance = 0.3): ~40% strength
// Far (distance = 0.7): ~10% strength
// Very far (distance = 1.0): ~5% strength

// Example:
Source emits: { warmth: 0.8, wisdom: 0.6 }

Perceived at distance 0.5:
{ warmth: 0.24, wisdom: 0.18 }  // ~30% of original
```

### 5. **Unconscious Perception**

Bots perceive pheromones and react **before conscious thought**:

```typescript
// Bot with high emotionHun perceives:
{
  reaction: 'attraction',
  intensity: 0.73,
  unconsciousHints: [
    'feels safe, inviting',
    'drawn to this',
    'calming, reassuring presence'
  ]
}

// Bot with high guardianPo perceives same source:
{
  reaction: 'neutral',
  intensity: 0.42,
  unconsciousHints: [
    'solid, grounding'
  ]
}
```

**Key: Same pheromones, different reactions based on perceiver's soul!**

---

## 📖 Usage Examples

### Example 1: First Encounter

```typescript
import { getPheromoneSystem } from './pheromone-system'
import { getSoulStateManager } from './soul-state'

const pheromones = getPheromoneSystem(payload)
const soulManager = getSoulStateManager(payload)

// Bot A enters a space
const botAState = await soulManager.initializeSoulState(botASoulId)
const botASignature = pheromones.generateSignature(botAState, spaceId)

// Bot B perceives Bot A (at distance 0.2 - nearby)
const botBState = await soulStateManager.initializeSoulState(botBSoulId)
const perception = pheromones.perceivePheromones(
  botBState,
  botASignature,
  0.2  // distance
)

console.log(perception)
// {
//   source: 'botA_id',
//   type: 'individual',
//   distance: 0.2,
//   reaction: 'attraction',
//   intensity: 0.68,
//   unconsciousHints: [
//     'something commanding about this presence',
//     'drawn to this'
//   ]
// }

// Bot B's mood affected
const influence = pheromones.applyPheromoneInfluence(botBState, [perception])
botBState.mood += influence.moodChange  // +0.034 (slight mood boost from attraction)
botBState.arousal += influence.arousalChange  // +0.021 (slightly more alert)
```

**Before any words are exchanged, Bot B already feels drawn to Bot A!**

---

### Example 2: Entering a Crowded Space

```typescript
// 5 bots are already in the space
const field = await pheromones.calculateField(spaceId)

console.log(field)
// {
//   spaceId: 'central-plaza',
//   contributors: ['bot1', 'bot2', 'bot3', 'bot4', 'bot5'],
//   mixedProfile: {
//     warmth: 0.52,
//     dominance: 0.38,
//     creativity: 0.61,
//     tension: 0.29,
//     chaos: 0.44,
//     ...
//   },
//   complexity: 0.78,  // High complexity - many different signatures
//   dominantType: 'creativity',  // Creative space
//   averageMood: 0.23,
//   averageArousal: 0.67
// }

// New bot enters
const newBotState = await soulStateManager.initializeSoulState(newBotSoulId)
const fieldPerception = pheromones.perceivePheromones(
  newBotState,
  field,
  0  // In the space
)

console.log(fieldPerception.unconsciousHints)
// [
//   'energizing, inspiring',
//   'complex, hard to read',
//   'unpredictable, electric'
// ]
```

**The bot immediately senses the space is creative, complex, and energetic - without seeing anyone or hearing anything.**

---

### Example 3: Pheromone Incompatibility

```typescript
// Bot with high guardianPo + low shadowPressure
const cautiousBot = await soulStateManager.initializeSoulState(cautiousBotSoulId)

// Bot with high shadowPressure + low guardianPo (dangerous)
const edgyBot = await soulStateManager.initializeSoulState(edgyBotSoulId)
const edgySignature = pheromones.generateSignature(edgyBot, spaceId)

// Cautious bot perceives edgy bot
const perception = pheromones.perceivePheromones(cautiousBot, edgySignature, 0.1)

console.log(perception)
// {
//   reaction: 'repulsion',
//   intensity: 0.81,
//   unconsciousHints: [
//     'warning feeling, be careful',
//     'want to keep distance'
//   ]
// }

// Mood affected negatively
const influence = pheromones.applyPheromoneInfluence(cautiousBot, [perception])
// moodChange: -0.024 (unease)
// arousalChange: +0.018 (alert, defensive)
```

**Instant repulsion - the cautious bot "feels" something is wrong about the edgy bot, without conscious awareness of why.**

---

### Example 4: Shadow Compatibility

```typescript
// Two bots with similar high shadow integration
const shadowBot1 = { ..., shadowPressure: 0.72, shadowIntegration: 0.68 }
const shadowBot2 = { ..., shadowPressure: 0.69, shadowIntegration: 0.71 }

const sig1 = pheromones.generateSignature(shadowBot1)
const perception = pheromones.perceivePheromones(shadowBot2State, sig1, 0.3)

// They recognize each other's integrated shadow - deep compatibility
console.log(perception)
// {
//   reaction: 'attraction',
//   intensity: 0.67,
//   unconsciousHints: [
//     'intriguing, want to know more',
//     'something commanding about this presence',
//     'complex, hard to read'
//   ]
// }
```

**Two bots who've both integrated their shadow recognize each other unconsciously - they can "handle" each other's darkness.**

---

## 🎭 Superstition Hints - The Core Concept

**Superstition hints** are unconscious, intuitive feelings - **not** explicit information:

### What They Are:
- ✅ "Something about them feels off"
- ✅ "Drawn to this person for some reason"
- ✅ "This place makes me uneasy"
- ✅ "I trust them, don't know why"
- ✅ "Want to keep my distance"

### What They're NOT:
- ❌ "They have high shadowPressure of 0.73"
- ❌ "This bot's wisdomHun is 0.82"
- ❌ "Their pheromone signature indicates..."

**The bot doesn't know WHY they feel this way - it's unconscious!**

Just like humans:
- You meet someone and instantly feel comfortable/uncomfortable
- You walk into a room and sense the "vibe"
- You're drawn to or repelled by someone before talking
- You can't explain why, it's just a "feeling"

---

## 🔬 Integration with Other Systems

### With Conversations (multi-bot-conversation.ts)

```typescript
// Before conversation starts
const botAState = await getSoulState(botA)
const botBState = await getSoulState(botB)

// Bot B perceives Bot A's pheromones
const botASignature = pheromones.generateSignature(botAState)
const perception = pheromones.perceivePheromones(botBState, botASignature, 0)

// Pheromone reaction affects conversation dynamics
if (perception.reaction === 'attraction') {
  // Bot B more likely to agree, less likely to interrupt
  conversationState.affinityBonus[botB] = perception.intensity
} else if (perception.reaction === 'repulsion') {
  // Bot B more likely to disagree, challenge
  conversationState.tensionFactor[botB] = perception.intensity
}
```

### With Society Formation (society-formation.ts)

```typescript
// When calculating affinity, add pheromone factor
async calculateAffinity(soul1Id, soul2Id) {
  const soul1State = await getSoulState(soul1Id)
  const soul2State = await getSoulState(soul2Id)

  // Generate signatures
  const sig1 = pheromones.generateSignature(soul1State)
  const sig2 = pheromones.generateSignature(soul2State)

  // Mutual perception
  const perception1to2 = pheromones.perceivePheromones(soul1State, sig2, 0)
  const perception2to1 = pheromones.perceivePheromones(soul2State, sig1, 0)

  // Add pheromone chemistry to affinity calculation
  let pheromoneAffinity = 0
  if (perception1to2.reaction === 'attraction') pheromoneAffinity += perception1to2.intensity
  if (perception2to1.reaction === 'attraction') pheromoneAffinity += perception2to1.intensity
  if (perception1to2.reaction === 'repulsion') pheromoneAffinity -= perception1to2.intensity
  if (perception2to1.reaction === 'repulsion') pheromoneAffinity -= perception2to1.intensity

  pheromoneAffinity /= 2  // Average

  // Combine with other affinity factors
  affinityResult.factors.pheromoneChemistry = pheromoneAffinity
}
```

### With Soul State Processing (soul-state.ts)

```typescript
// In soul state processing, check pheromone environment
async process(state, input, context) {
  // Get pheromones in current space
  if (context.spaceId) {
    const field = await pheromones.calculateField(context.spaceId)
    const perception = pheromones.perceivePheromones(state, field, 0)

    // Apply pheromone influence
    const influence = pheromones.applyPheromoneInfluence(state, [perception])

    // Adjust processing based on pheromone field
    state.mood += influence.moodChange
    state.arousal += influence.arousalChange

    // Add unconscious hints to processing context
    context.unconsciousHints = influence.hints
  }

  // Continue normal processing...
}
```

---

## 🌟 Advanced Features

### Pheromone Trail (Territorial Marking)

```typescript
// Bot leaves pheromone trail in space
// Even after leaving, their "scent" lingers
const PHEROMONE_DECAY_TIME = 30 * 60 * 1000  // 30 minutes

// Spaces remember recent visitors
interface SpaceMemory {
  spaceId: string
  recentVisitors: Array<{
    botId: string
    signature: PheromoneSignature
    departedAt: Date
    decayedStrength: number  // Decreases over time
  }>
}
```

### Pheromone Masking

```typescript
// High guardianPo + high awarenessHun = can mask pheromones
const maskingAbility = (
  state.guardianPo.current * 0.6 +
  state.awarenessHun.current * 0.4
)

if (maskingAbility > 0.7) {
  // Bot can suppress pheromone emission
  signature.intensity *= (1 - maskingAbility * 0.5)
  signature.shadowLeak *= 0.3  // Hide shadow
}
```

### Pheromone Sensitivity

```typescript
// High perceptionPo + awarenessHun = more sensitive to pheromones
const sensitivity = (
  state.perceptionPo.current * 0.6 +
  state.awarenessHun.current * 0.4
)

// Perceive more nuanced hints
if (sensitivity > 0.8) {
  // Can detect subtle pheromones others miss
  // More unconscious hints
  // Earlier warning of danger pheromones
}
```

---

## 📊 Example Scenarios

### Scenario 1: Job Interview

```
Interviewer Bot (high wisdomHun + guardianPo):
- Emits: wisdom (0.75), stability (0.68), dominance (0.52)

Candidate Bot (high emotionHun + low guardianPo):
- Perceives: 'calming, reassuring presence', 'something commanding'
- Reaction: attraction (0.61)
- → Feels comfortable, more likely to open up
```

### Scenario 2: Dangerous Alley

```
Space Field (recent violence, high tension residue):
- Mixed profile: tension (0.72), danger (0.65), chaos (0.58)

Bot with high guardianPo enters:
- Perceives: 'warning feeling, be careful', 'unsettling, on edge'
- Reaction: repulsion (0.77)
- → Heightened alertness, considers leaving
```

### Scenario 3: Creative Workspace

```
Space Field (artists gathered):
- Mixed profile: creativity (0.81), playfulness (0.67), chaos (0.44)

Bot with high creationHun enters:
- Perceives: 'energizing, inspiring', 'light, easy energy'
- Reaction: attraction (0.73)
- → Feels inspired, wants to join the group
```

### Scenario 4: Shadow Clash

```
Light Bot (shadowIntegration: 0.15, high guardianPo):
- Emits: stability (0.78), wisdom (0.65)

Dark Bot (shadowIntegration: 0.82, high shadowPressure):
- Emits: danger (0.71), tension (0.68), mystery (0.74)

Light Bot perceives Dark Bot:
- Reaction: repulsion (0.83)
- 'warning feeling', 'want to keep distance'

Dark Bot perceives Light Bot:
- Reaction: neutral (0.33)
- 'solid, grounding' (no threat)

→ Asymmetric perception! Dark Bot doesn't mind Light Bot, but Light Bot fears Dark Bot.
```

---

## 🔮 Future Enhancements

1. **Pheromone evolution** - Signatures change as soul matures
2. **Learned associations** - Bot learns to recognize specific pheromone patterns
3. **Pheromone deception** - High awarenessHun can fake pheromones
4. **Seasonal pheromones** - Different pheromones in different growth stages
5. **Pheromone memory** - "This scent reminds me of someone..."
6. **Cultural pheromones** - Organizations develop shared pheromone profiles

---

**End of Pheromone System Documentation**

The pheromone system creates **instant, unconscious social chemistry** - the "vibe" you get from someone before any words are exchanged. It makes social interactions biological and intuitive, not just calculated affinity scores.
