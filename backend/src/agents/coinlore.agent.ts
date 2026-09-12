import axios from 'axios';

export interface CoinData {
  id: string;
  symbol: string;
  name: string;
  nameid: string;
  rank: number;
  price_usd: string;
  percent_change_24h: string;
  percent_change_1h: string;
  percent_change_7d: string;
  price_btc: string;
  market_cap_usd: string;
  volume24: number;
  volume24a: number;
  csupply: string;
  tsupply: string;
  msupply: string;
}

export class CoinLoreAgent {
  private readonly baseUrl = 'https://api.coinlore.net/api';

  /**
   * Fetches data for a specific coin by ID.
   * CoinLore uses IDs (e.g., 90 for Bitcoin, 80 for Ethereum).
   */
  async getCoinById(id: string): Promise<CoinData | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/ticker/?id=${id}`);
      if (response.data && response.data.length > 0) {
        return response.data[0];
      }
      return null;
    } catch (error) {
      console.error(`Error fetching data for coin ID ${id}:`, error);
      return null;
    }
  }

  /**
   * Searches for a coin by name or symbol and returns its data.
   */
  async searchCoin(query: string): Promise<CoinData | null> {
    try {
      // CoinLore doesn't have a direct search endpoint, so we fetch global list and filter.
      // For a production system, we'd cache this list.
      const response = await axios.get(`${this.baseUrl}/tickers/`);
      const coins: CoinData[] = response.data.data;
      
      const lowerQuery = query.toLowerCase();
      const match = coins.find(c => 
        c.name.toLowerCase() === lowerQuery || 
        c.symbol.toLowerCase() === lowerQuery ||
        lowerQuery.includes(c.name.toLowerCase()) ||
        lowerQuery.includes(c.symbol.toLowerCase())
      );

      return match || null;
    } catch (error) {
      console.error('Error searching coin:', error);
      return null;
    }
  }
}

export const coinLoreAgent = new CoinLoreAgent();
