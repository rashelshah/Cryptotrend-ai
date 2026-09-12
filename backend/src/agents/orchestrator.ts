import { classifyIntent, IntentType } from './router';
import { generatorAgent } from './generator.agent';
import { coinLoreAgent } from './coinlore.agent';
import { embeddingService } from '../services/embedding.service';
import { dbService } from '../services/db.service';

export interface RetrievedSource {
  projectName: string;
  sourceUrl: string;
  pageTitle: string;
  headingPath: string;
  similarity: number;
}

export interface QueryResult {
  answer: string;
  intent: IntentType;
  sourceType: 'RAG' | 'LIVE_MARKET' | 'HYBRID' | 'FALLBACK';
  sources: RetrievedSource[];
  liveDataUsed: boolean;
}

export class Orchestrator {
  /**
   * Processes a user query end-to-end based on the hybrid agentic architecture.
   */
  async processQuery(query: string): Promise<QueryResult> {
    const intent = classifyIntent(query);
    console.log(`[Orchestrator] Intent classified as: ${intent}`);

    let liveDataStr = '';
    let contextStr = '';
    let liveDataUsed = false;
    let sources: RetrievedSource[] = [];

    // 1. Handle Live Data if needed
    if (intent === IntentType.LIVE || intent === IntentType.HYBRID) {
      console.log(`[Orchestrator] Fetching live data...`);
      const coinData = await coinLoreAgent.searchCoin(query);
      if (coinData) {
        liveDataUsed = true;
        liveDataStr = `CoinLore Data for ${coinData.name} (${coinData.symbol}):
Price: $${coinData.price_usd}
Market Cap: $${coinData.market_cap_usd}
Rank: ${coinData.rank}
24h Volume: $${coinData.volume24}
Circulating Supply: ${coinData.csupply}`;
      } else {
        liveDataStr = `Could not find live market data for the requested coin on CoinLore.`;
      }
    }

    // 2. Handle Knowledge Data if needed (RAG via Supabase pgvector + BM25)
    if (intent === IntentType.KNOWLEDGE || intent === IntentType.HYBRID) {
      console.log(`[Orchestrator] Fetching knowledge context for query...`);

      try {
        // Skip the rewriteQuery step to reduce API latency by 50%
        const queryEmbedding = await embeddingService.generateEmbedding(query);
        const searchResults = await dbService.hybridSearch(query, queryEmbedding, 8);
        
        if (searchResults && searchResults.length > 0) {
          sources = searchResults.map((res: any) => ({
            projectName: res.project_name,
            sourceUrl: res.source_url,
            pageTitle: res.page_title,
            headingPath: res.heading_path,
            similarity: res.similarity ?? 0
          }));

          contextStr = searchResults.map((res: any, index: number) => {
            return `[Chunk ${index + 1}] (Source: ${res.project_name} Docs | ${res.page_title} > ${res.heading_path})\n${res.content}\n`;
          }).join('\n');
        } else {
          contextStr = `No relevant documentation found in the indexed sources.`;
        }
      } catch (err) {
        console.warn(`[Orchestrator] RAG Search skipped or no vectors:`, err);
        contextStr = `No documentation indexed yet.`;
      }
    }

    // 3. Determine Source Type
    let sourceType: 'RAG' | 'LIVE_MARKET' | 'HYBRID' | 'FALLBACK' = 'FALLBACK';
    if (sources.length > 0 && liveDataUsed) {
      sourceType = 'HYBRID';
    } else if (sources.length > 0) {
      sourceType = 'RAG';
    } else if (liveDataUsed) {
      sourceType = 'LIVE_MARKET';
    }

    // 4. Generate Final Grounded Answer
    console.log(`[Orchestrator] Generating final answer with source type: ${sourceType}...`);
    const finalAnswer = await generatorAgent.generateAnswer(query, contextStr, liveDataStr);

    return {
      answer: finalAnswer,
      intent,
      sourceType,
      sources,
      liveDataUsed
    };
  }
  async processQueryStream(query: string, sendEvent: (data: object) => void): Promise<void> {
    const intent = classifyIntent(query);
    console.log(`[Orchestrator] Intent: ${intent} — launching parallel data fetches...`);

    const needsLive = intent === IntentType.LIVE || intent === IntentType.HYBRID;
    const needsRAG = intent === IntentType.KNOWLEDGE || intent === IntentType.HYBRID;

    // ⚡ Run live data fetch AND embedding+search simultaneously (saves ~500ms-1.5s)
    const [liveResult, ragResult] = await Promise.all([
      // Live data task (only runs if needed, else resolves immediately)
      needsLive
        ? coinLoreAgent.searchCoin(query).catch(() => null)
        : Promise.resolve(null),

      // RAG task: embed query then vector search (only if needed)
      needsRAG
        ? embeddingService.generateEmbedding(query)
            .then(embedding => dbService.hybridSearch(query, embedding, 5))
            .catch(() => [])
        : Promise.resolve([])
    ]);

    // Process live data result
    let liveDataStr = '';
    let liveDataUsed = false;
    if (liveResult) {
      liveDataUsed = true;
      liveDataStr = `CoinLore Data for ${liveResult.name} (${liveResult.symbol}):
Price: $${liveResult.price_usd}
Market Cap: $${liveResult.market_cap_usd}
Rank: ${liveResult.rank}
24h Volume: $${liveResult.volume24}
Circulating Supply: ${liveResult.csupply}`;
    }

    // Process RAG result
    let contextStr = 'No relevant documentation found.';
    let sources: RetrievedSource[] = [];
    const searchResults = ragResult as any[];
    if (searchResults && searchResults.length > 0) {
      sources = searchResults.map((res: any) => ({
        projectName: res.project_name,
        sourceUrl: res.source_url,
        pageTitle: res.page_title,
        headingPath: res.heading_path,
        similarity: res.similarity ?? 0
      }));
      contextStr = searchResults.map((res: any, i: number) =>
        `[Chunk ${i + 1}] (Source: ${res.project_name} | ${res.page_title})\n${res.content}\n`
      ).join('\n');
    }

    // Determine source type
    let sourceType: 'RAG' | 'LIVE_MARKET' | 'HYBRID' | 'FALLBACK' = 'FALLBACK';
    if (sources.length > 0 && liveDataUsed) sourceType = 'HYBRID';
    else if (sources.length > 0) sourceType = 'RAG';
    else if (liveDataUsed) sourceType = 'LIVE_MARKET';

    // Send metadata immediately so UI can update confidence badge
    sendEvent({ sourceType, sources, liveDataUsed });

    // Stream the answer token-by-token
    console.log(`[Orchestrator] Streaming answer (sourceType: ${sourceType})...`);
    await generatorAgent.generateAnswerStream(query, contextStr, liveDataStr, sendEvent);
  }
}

export const orchestrator = new Orchestrator();
