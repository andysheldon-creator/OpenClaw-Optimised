/**
 * Web Search keyword detection
 */

const EXPLICIT_KEYWORDS = [
  "погуглить", "погугли", "загугли", "загуглить",
  "поискать", "найди", "найти", "искать",
  "гугл", "поиск", "веб поиск", "вебпоиск",
  "web search", "search the web", "search online",
  "look up", "google", "search"
];

const CONTEXTUAL_PATTERNS = [
  /погода|weather|температура|temperature/i,
  /новости|news|события|events/i,
  /что такое|who is|what is|где|where|когда|when|какой|сколько|how much|how many/i,
  /текущий|current|сейчас|now|сегодня|today/i,
];
const DEEP_COMMAND_RE = /^\/deep(?:@[a-z0-9_]+)?\b/i;

/**
 * Detect if message contains web search intent
 * Returns false for /deep commands (deep research takes priority)
 */
export function detectWebSearchIntent(
  message: string,
  customPatterns?: readonly (string | RegExp)[]
): boolean {
  const trimmed = message.trim();
  if (DEEP_COMMAND_RE.test(trimmed)) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  
  // Priority 2: Custom patterns from config
  if (customPatterns) {
    for (const pattern of customPatterns) {
      if (typeof pattern === 'string') {
        if (normalized.includes(pattern.toLowerCase())) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(normalized)) {
          return true;
        }
      }
    }
  }
  
  // Priority 3: Explicit keywords (simple includes check with boundary awareness)
  // Also strip punctuation for boundary checks
  const normalizedWords = normalized.replace(/[^\w\sа-яА-Я]/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const normalizedText = ' ' + normalizedWords.join(' ') + ' ';
  
  for (const keyword of EXPLICIT_KEYWORDS) {
    const pattern = keyword.toLowerCase();
    const patternWords = pattern.split(/\s+/);
    
    // Check each word of the keyword
    for (const word of patternWords) {
      if (normalizedText.includes(' ' + word + ' ')) {
        return true;
      }
    }
    // Also check multi-word patterns
    if (pattern.includes(' ') && normalized.includes(pattern)) {
      return true;
    }
  }
  
  // Priority 4: Contextual patterns
  for (const pattern of CONTEXTUAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  
  // Priority 5: High-confidence topics with question words
  // Only trigger if both question word and topic appear early in message
  // Filter out "дела" and similar to avoid "как дела" false positive
  const questionWords = ["что", "кто", "где", "когда", "какой", "сколько"];
  const excludedWords = ["дела", "ты", "вы", "твои", "ваши", "себя", "настроение"]; // Avoid "как дела", "как ты" etc
  const topics = ["погода", "weather", "температура", "temperature", "новости", "news", "события", "events", "курс", "price", "курс доллара"];
  
  const firstPart = normalized.substring(0, 50); // Check first 50 chars
  
  // Check for question words but exclude common false positives
  const hasQuestion = questionWords.some(w => {
    const idx = firstPart.indexOf(w);
    if (idx === -1) return false;
    
    // Check if followed by excluded words
    const afterWord = firstPart.substring(idx + w.length).trim();
    if (excludedWords.some(ew => afterWord.startsWith(ew))) {
      return false;
    }
    
    // Check boundaries
    return idx === 0 || 
           firstPart[idx - 1] === ' ' || 
           firstPart.length === idx + w.length || 
           firstPart[idx + w.length] === ' ';
  });
  
  const hasTopic = topics.some(t => firstPart.includes(t));
  
  if (hasQuestion && hasTopic) {
    return true;
  }
  
  return false;
}

/**
 * Extract clean search query from message
 */
export function extractSearchQuery(message: string): string {
  let query = message.toLowerCase();
  const originalQuery = query;
  
  // Remove explicit keywords (simple string replacement for Cyrillic)
  const keywordsToRemove = [...EXPLICIT_KEYWORDS];
  // Add more action words
  keywordsToRemove.push('найди', 'найти', 'искать', 'поискать', 'загрузи');
  
  // Use whitespace boundary instead of word boundary for Cyrillic
  const whitespaceBoundary = (str: string) => `(^|\\s+)${str}(\\s+|$)`;
  
  // Do multiple passes to catch all
  for (let pass = 0; pass < 3; pass++) {
    for (const keyword of keywordsToRemove) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Try word boundary first (works for ASCII), fallback to whitespace boundary
      const regex1 = new RegExp(`\\b${escaped}\\b`, 'gi');
      const regex2 = new RegExp(whitespaceBoundary(escaped), 'gi');
      query = query.replace(regex1, ' ').replace(regex2, ' ');
    }
    
    // Remove polite words
    const politeWords = ['пожалуйста', 'плиз', 'пж', 'спасибо'];
    for (const word of politeWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex1 = new RegExp(`\\b${escaped}\\b`, 'gi');
      const regex2 = new RegExp(whitespaceBoundary(escaped), 'gi');
      query = query.replace(regex1, ' ').replace(regex2, ' ');
    }
    
    // Remove prepositions and connecting words
    query = query.replace(/(^|\s+)(про|по|о|на тему|и|или|да|нет)(\s+|$)/gi, ' ');
    
    // Remove disfluencies
    const disfluencies = ['эм', 'ну', 'типа', 'значит', 'короче', 'в общем', 'ну'];
    for (const word of disfluencies) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex1 = new RegExp(`\\b${escaped}\\b`, 'gi');
      const regex2 = new RegExp(whitespaceBoundary(escaped), 'gi');
      query = query.replace(regex1, ' ').replace(regex2, ' ');
    }
    
    query = query.replace(/\s+/g, ' ').trim();
  }
  
  // Clean whitespace and punctuation (leading/trailing)
  query = query.replace(/^[:,.!\-\—]+/, '').trim();
  query = query.replace(/[:,.!\-\—]+$/, '').trim();
  
  // Also clean multiple punctuation in middle
  query = query.replace(/[:,.!\-\—]{2,}/g, ' ').trim();
  query = query.replace(/\s+/g, ' ').trim();
  
  return query || originalQuery; // Fallback to original (lowercased) if empty
}

/**
 * Get default patterns for testing/config
 */
export function getWebSearchPatterns() {
  return {
    explicit: EXPLICIT_KEYWORDS,
    contextual: CONTEXTUAL_PATTERNS.map(p => p.source)
  };
}
