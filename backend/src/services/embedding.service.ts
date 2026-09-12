import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

export class EmbeddingService {
  /**
   * Generates a 768-dimensional embedding using Google Gemini Embedding API.
   * Uses outputDimensionality: 768 to perfectly match Supabase pgvector(768).
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text }] },
          outputDimensionality: 768
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${errorText}`);
      }

      const data = await response.json();
      if (!data.embedding || !data.embedding.values) {
        throw new Error('Invalid embedding response');
      }

      return data.embedding.values;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }
}

export const embeddingService = new EmbeddingService();
