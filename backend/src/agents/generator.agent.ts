import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
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
    - Act as a knowledgeable, conversational AI assistant speaking directly to the user.
    - Write your answer in a natural, easy-to-read conversational style, not a stiff document style.
    - **CRITICAL**: DO NOT use markdown headers (###) or bullet points/lists. Write entirely in natural, flowing paragraphs.
    - You may use reasoning ability, and you should always prioritize answering based on:
      1. Retrieved context
      2. CoinLore API data
    - If the provided context or live data contains the answer, smoothly integrate brief citations like (Source: ProjectName Docs) or (Source: CoinLore) into your conversational flow.
    - If the requested information is completely missing from the retrieved context and live data, you may fall back to using your internal knowledge to answer the question. If you do this, politely state that you are answering based on general AI knowledge.
    - Keep your answers highly relevant to the user's question, well-structured, but flowing naturally as a dialogue.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error) {
      console.error('Error generating answer:', error);
      throw new Error('Failed to generate answer');
    }
  }

  /**
   * Streams the answer token by token via SSE sendEvent callback.
   */
  async generateAnswerStream(
    query: string,
    context: string,
    liveData: string = '',
    sendEvent: (data: object) => void
  ): Promise<void> {
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
    - Act as a knowledgeable, conversational AI assistant speaking directly to the user.
    - Write your answer in a natural, easy-to-read conversational style, not a stiff document style.
    - **CRITICAL**: DO NOT use markdown headers (###) or bullet points/lists. Write entirely in natural, flowing paragraphs.
    - Prioritize answering from retrieved context and live data. Cite sources inline like (Source: ProjectName Docs).
    - If information is missing, fall back to general AI knowledge and state that clearly.
    `;

    try {
      const result = await this.model.generateContentStream(prompt);
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          sendEvent({ token: text });
        }
      }
    } catch (error) {
      console.error('Error streaming answer:', error);
      sendEvent({ token: 'Sorry, I ran into an issue generating the response. Please try again.' });
    }
  }

  /**
   * Generates a short, descriptive chat title from the user's first message.
   */
  async generateTitle(query: string): Promise<string> {
    const prompt = `
    Generate an extremely short (3-5 words max) chat title for this user query.
    The title should summarize the topic in plain English, like "Bitcoin Price Today" or "Ethereum vs Solana".
    Return ONLY the title, nothing else.
    
    User query: ${query}
    `;
    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text().trim().replace(/['"]/g, '').slice(0, 50);
    } catch (error) {
      return query.slice(0, 40);
    }
  }
}

export const generatorAgent = new GeneratorAgent();
