import axios from 'axios';
import { embeddingService } from '../services/embedding.service';
import { dbService } from '../services/db.service';
import crypto from 'crypto';

const COINLORE_API = 'https://api.coinlore.net/api/tickers/?limit=100';
const WIKIPEDIA_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function seedTop100() {
  console.log('Fetching top 100 cryptos from CoinLore...');
  try {
    const { data } = await axios.get(COINLORE_API);
    const coins = data.data;

    let successCount = 0;

    for (const coin of coins) {
      console.log(`Processing [${coin.rank}] ${coin.name} (${coin.symbol})...`);
      
      try {
        // Try fetching Wikipedia summary
        // Some names might need mapping (e.g. 'Bitcoin' works, 'Ethereum' works)
        const searchName = encodeURIComponent(coin.name);
        const wikiRes = await axios.get(`${WIKIPEDIA_API}${searchName}`, {
          headers: {
            'User-Agent': 'CryptonAI/1.0 (contact@crypton.ai)'
          }
        });
        
        if (wikiRes.data && wikiRes.data.extract) {
          const content = `${coin.name} (${coin.symbol}):\n${wikiRes.data.extract}\n\nMarket Cap Rank: ${coin.rank}`;
          
          const hashInput = `wikipedia::${coin.name}::${content}`;
          const chunkHash = crypto.createHash('sha256').update(hashInput).digest('hex');

          const embedding = await embeddingService.generateEmbedding(content);
          
          await dbService.insertChunk({
            projectName: coin.name,
            sourceUrl: wikiRes.data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${searchName}`,
            pageTitle: `${coin.name} Overview`,
            headingPath: `Overview`,
            content: content,
            embedding: embedding,
            chunkHash: chunkHash,
            documentType: 'summary',
            tokenCount: content.split(' ').length * 2
          });
          
          console.log(`✅ Ingested wiki summary for ${coin.name}`);
          successCount++;
        }
      } catch (err: any) {
        if (err.response && err.response.status === 404) {
          console.log(`⚠️ No Wikipedia page found for ${coin.name}`);
        } else {
          console.error(`❌ Error processing ${coin.name}:`, err.message);
        }
      }
      
      // Sleep to respect rate limits (Wikipedia & Gemini)
      await sleep(1000);
    }

    console.log(`\n🎉 Successfully ingested info for ${successCount} / 100 cryptos into pgvector!`);
    process.exit(0);

  } catch (error) {
    console.error('Error fetching from CoinLore:', error);
    process.exit(1);
  }
}

seedTop100();
