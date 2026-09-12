import * as cheerio from 'cheerio';
import axios from 'axios';
import { chunkMarkdown } from '../utils/chunking';
import { embeddingService } from './embedding.service';
import { dbService } from './db.service';

export interface ScrapeTarget {
  projectName: string;
  rootUrl: string;
}

export class ScraperService {
  /**
   * Scrapes a single page, chunks it, and ingests into Supabase.
   * Note: This is a simplified fetcher. For SPAs (like some modern docs),
   * you would replace axios with Puppeteer.
   */
  async scrapeAndIngest(target: ScrapeTarget, pageUrl: string) {
    try {
      console.log(`[Scraper] Fetching ${pageUrl}...`);
      const { data } = await axios.get(pageUrl);
      const $ = cheerio.load(data);

      // Remove noise
      $('nav, footer, aside, script, style, noscript, iframe, .sidebar, .ad').remove();

      const pageTitle = $('title').text() || $('h1').first().text() || target.projectName;
      
      // Convert HTML to simple Markdown-like text
      let markdown = '';
      $('h1, h2, h3, h4, h5, h6, p, li, pre').each((i, el) => {
        const tagName = el.tagName.toLowerCase();
        const text = $(el).text().trim();
        if (!text) return;

        if (tagName.startsWith('h')) {
          const level = parseInt(tagName.replace('h', ''), 10);
          markdown += '\n' + '#'.repeat(level) + ' ' + text + '\n\n';
        } else if (tagName === 'pre') {
          markdown += '\n```\n' + text + '\n```\n\n';
        } else if (tagName === 'li') {
          markdown += '- ' + text + '\n';
        } else {
          markdown += text + '\n\n';
        }
      });

      console.log(`[Scraper] Chunking content for ${pageUrl}...`);
      const document = chunkMarkdown(markdown, target.projectName, pageUrl, pageTitle, 'docs');

      let newChunks = 0;
      for (const chunk of document.chunks) {
        // Generate embedding
        const embedding = await embeddingService.generateEmbedding(chunk.content);
        
        // Upsert into Supabase (relies on chunkHash to avoid duplicates/unnecessary writes)
        const inserted = await dbService.insertChunk({
          projectName: target.projectName,
          sourceUrl: pageUrl,
          pageTitle: pageTitle,
          headingPath: chunk.headingPath,
          content: chunk.content,
          embedding: embedding,
          chunkHash: chunk.chunkHash,
          documentType: 'docs',
          tokenCount: chunk.tokenCount
        });

        if (inserted) newChunks++;
      }

      console.log(`[Scraper] Successfully ingested ${newChunks}/${document.chunks.length} chunks from ${pageUrl}`);
    } catch (error) {
      console.error(`[Scraper] Error scraping ${pageUrl}:`, error);
    }
  }

  /**
   * Stub for crawling a full site.
   */
  async crawlProject(target: ScrapeTarget) {
    console.log(`[Scraper] Starting crawl for ${target.projectName}...`);
    // In a full implementation, you would use a queue and link discovery here.
    // For now, we will just scrape the root URL as an example.
    await this.scrapeAndIngest(target, target.rootUrl);
  }
}

export const scraperService = new ScraperService();
