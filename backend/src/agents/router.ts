export enum IntentType {
  LIVE = 'LIVE',
  KNOWLEDGE = 'KNOWLEDGE',
  HYBRID = 'HYBRID'
}

const LIVE_KEYWORDS = [
  'price',
  'market cap',
  'rank',
  'volume',
  'ath',
  'circulating supply',
  'current',
  'today',
  'live',
  'cost',
  'worth'
];

/**
 * Deterministically routes a query based on keyword matching.
 * This saves latency and LLM costs compared to an LLM-based intent classifier.
 */
export function classifyIntent(query: string): IntentType {
  const lowerQuery = query.toLowerCase();
  
  const hasLiveKeyword = LIVE_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
  
  // Basic heuristic for hybrid: if it asks for both live data AND explanation/comparison
  // e.g., "Compare Ethereum and Solana including market cap"
  const hasComparison = lowerQuery.includes('compare') || lowerQuery.includes('vs') || lowerQuery.includes('difference');
  
  if (hasLiveKeyword && hasComparison) {
    return IntentType.HYBRID;
  }
  
  if (hasLiveKeyword) {
    return IntentType.LIVE;
  }
  
  return IntentType.KNOWLEDGE;
}
