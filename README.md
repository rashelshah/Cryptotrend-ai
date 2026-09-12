# 🪙 Crypton AI

An AI-Powered Crypto Web Platform featuring a robust **Agentic RAG (Retrieval-Augmented Generation) Pipeline**.

Crypton AI is a modern cryptocurrency analysis and trading assistant that leverages AI to provide real-time insights, portfolio analysis, smart alerts, and a risk-free trading simulator.

---

## 🧠 Agentic RAG Pipeline Architecture

At the core of Crypton AI is a sophisticated hybrid RAG pipeline designed to answer user questions using factual data, significantly reducing AI hallucinations.

### 1. Data Ingestion & Scraping
- **Sources**: Automated scrapers pull official developer documentation (Ethereum, Solana, Bitcoin, etc.) and top 100 cryptocurrency overviews from Wikipedia and CoinLore.
- **Processing**: The HTML is stripped, cleaned, and split into semantically meaningful chunks (200-500 words).
- **Embedding**: Each chunk is passed through the **Gemini Embedding Model (`gemini-embedding-001`)** to convert semantic meaning into 768-dimensional vector coordinates.
- **Vector Database**: These vectors are stored in **Supabase (PostgreSQL with `pgvector`)**.

### 2. Intelligent Query Orchestration
When a user asks a question, the **Orchestrator Agent** dynamically routes it:
- **Live Market Data**: If the user asks about price, rank, or volume, it bypasses the database and queries the CoinLore API in real-time.
- **Knowledge Retrieval (RAG)**: For complex queries, it embeds the question and performs a **Hybrid Search** (Vector Cosine Similarity + BM25 Keyword Search) in Supabase to find the top 5 most relevant documentation chunks.
- **Parallelization**: For maximum speed, live API calls and vector search run simultaneously.

### 3. Streaming Generation
- **Prompt Injection**: The retrieved facts and live data are injected into a hidden prompt.
- **Gemini 3.6 Flash**: The system uses Google's latest model to synthesize a conversational answer based *strictly* on the retrieved context.
- **Real-Time SSE**: The generated text is streamed token-by-token over Server-Sent Events (SSE) to the frontend, giving a fast, ChatGPT-like user experience.

---

## 🚀 Key Features

- **💬 AI Chatbot Assistant** – Ask complex questions and get grounded answers powered by our RAG pipeline.
- **🤖 AI & Risk Analysis** – Evaluate risk levels of different cryptocurrencies.  
- **📊 Smart Market Alerts** – Get notified about significant market changes.  
- **📈 Top Gainers & Losers** – Track daily top-performing and underperforming coins.  
- **📰 Real-Time Crypto News** – Stay updated with the latest market news.  
- **⚡ High Volatility Detection** – Identify coins with sudden price swings.  
- **⭐ Watchlist** – Keep track of your favorite cryptocurrencies.  
- **📂 Portfolio AI Analysis** – Personalized portfolio breakdown and performance analysis.  
- **🎮 Trading Simulator** – Practice crypto trading with virtual funds in a realistic AI-driven market.  

---

## 🛠️ Tech Stack

**Frontend**
- React (Vite), TypeScript, Tailwind CSS, shadcn/ui

**Backend & AI**
- Node.js, Express.js
- Google Generative AI (Gemini 3.6 Flash, Embeddings)
- Puppeteer & Cheerio (Web Scraping)

**Database & Infrastructure**
- Supabase (PostgreSQL, `pgvector` for Embeddings)
- Vercel Serverless Functions

---

Akash Deployment Lease id: 12256125