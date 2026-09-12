import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { orchestrator } from './agents/orchestrator';
import { scraperService } from './services/scraper.service';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Crypton AI Backend is running.' });
});

// Main query endpoint - SSE streaming
app.post('/query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    // Set SSE headers for real-time streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sendEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Run RAG pipeline - orchestrator now returns a stream
    await orchestrator.processQueryStream(query, sendEvent);

    // Signal end of stream
    sendEvent({ done: true });
    res.end();
  } catch (error) {
    console.error('Error processing query:', error);
    try {
      res.write(`data: ${JSON.stringify({ error: 'Internal server error.' })}\n\n`);
      res.end();
    } catch (e) { /* already ended */ }
  }
});

// Generate a short title from the first user message
app.post('/generate-title', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required.' });
    const { generatorAgent } = await import('./agents/generator.agent');
    const title = await generatorAgent.generateTitle(query);
    res.json({ title });
  } catch (error) {
    console.error('Error generating title:', error);
    res.status(500).json({ title: query.slice(0, 40) }); // fallback
  }
});

// Compare endpoint
app.post('/compare', async (req: Request, res: Response) => {
  try {
    const { projectA, projectB } = req.body;
    if (!projectA || !projectB) {
      return res.status(400).json({ error: 'projectA and projectB are required.' });
    }

    const query = `Compare ${projectA} and ${projectB} including their architecture, consensus, and current market cap.`;
    const result = await orchestrator.processQuery(query);
    res.json(result);
  } catch (error) {
    console.error('Error comparing projects:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Ingest single documentation page
app.post('/ingest', async (req: Request, res: Response) => {
  try {
    const { url, projectName } = req.body;
    if (!url || !projectName) {
      return res.status(400).json({ error: 'url and projectName are required.' });
    }

    await scraperService.scrapeAndIngest({ rootUrl: url, projectName }, url);
    res.json({ message: `Successfully ingested ${url} for ${projectName}` });
  } catch (error) {
    console.error('Error during ingestion:', error);
    res.status(500).json({ error: 'Failed to ingest documentation.' });
  }
});

// Trigger scraping for core projects
app.post('/refresh-docs', async (req: Request, res: Response) => {
  try {
    const coreProjects = [
      { projectName: 'Ethereum', rootUrl: 'https://ethereum.org/en/developers/docs/' },
      { projectName: 'Solana', rootUrl: 'https://solana.com/docs' },
      { projectName: 'Bitcoin', rootUrl: 'https://developer.bitcoin.org/' },
      { projectName: 'Polygon', rootUrl: 'https://docs.polygon.technology/' }
    ];

    // Triggering in background to avoid blocking response
    res.json({ message: 'Documentation refresh started in the background.' });

    for (const project of coreProjects) {
      await scraperService.crawlProject(project);
    }
    
  } catch (error) {
    console.error('Error refreshing docs:', error);
  }
});

// Only listen on a port if not in Vercel production
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`[Server] Crypton AI Backend running on port ${port}`);
  });
}

export default app;
