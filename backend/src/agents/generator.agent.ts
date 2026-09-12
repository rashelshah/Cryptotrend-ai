import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export class GeneratorAgent {
  private model: any;

  constructor() {
    this.model = genAI.getGenerativeModel({ 
      model: 'gemini-3.6-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    });
  }

  /**
   * Rewrites a user query to be better suited for semantic/hybrid search.
   */
  async rewriteQuery(query: string): Promise<string> {
    const prompt = `
    You are an expert search query rewriter. 
    Your task is to take a user query and rewrite it into a concise, keyword-rich search query optimized for vector databases and BM25 full-text search.
    Remove filler words. Keep the core crypto concepts and project names.
    Return ONLY the rewritten query without any quotes or preamble.

    Original query: ${query}
    `;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error rewriting query:', error);
      return query; // fallback to original query
    }
  }

  /**
   * Generates a final answer using retrieved context and/or live data.
   */
  async generateAnswer(query: string, context: string, liveData: string = ''): Promise<string> {
    const prompt = `
    You are Crypton AI, an expert cryptocurrency intelligence system.
    You have been provided with context from official blockchain documentation and/or live market data from CoinLore.

    USER QUERY:
    ${query}

    RETRIEVED CONTEXT (Docs):
    ${context}

    LIVE MARKET DATA:
    ${liveData}

    INSTRUCTIONS:
    - You may use reasoning ability, and you should always prioritize answering based on:
      1. Retrieved context
      2. CoinLore API data
    - If the provided context or live data contains the answer, append brief citations like (Source: ProjectName Docs) or (Source: CoinLore).
    - If the requested information is completely missing from the retrieved context and live data, you may fall back to using your internal knowledge to answer the question. If you do this, explicitly state that you are answering based on general AI knowledge.
    - Provide accurate, well-structured, and concise answers.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error generating answer:', error);
      throw new Error('Failed to generate answer');
    }
  }
}

export const generatorAgent = new GeneratorAgent();
