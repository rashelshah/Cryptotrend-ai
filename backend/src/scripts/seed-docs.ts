import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { chunkMarkdown } from '../utils/chunking';
import { embeddingService } from '../services/embedding.service';
import { dbService } from '../services/db.service';
import URL from 'url';

const TARGETS = [
  { projectName: 'Bitcoin', rootUrl: 'https://developer.bitcoin.org/devguide/intro.html', type: 'docs' },
  { projectName: 'Ethereum', rootUrl: 'https://ethereum.org/en/developers/docs/', type: 'docs' },
  { projectName: 'Solana', rootUrl: 'https://solana.com/docs', type: 'docs' },
  { projectName: 'Polygon', rootUrl: 'https://docs.polygon.technology/', type: 'docs' },
  { projectName: 'Chainlink', rootUrl: 'https://docs.chain.link/', type: 'docs' },
  { projectName: 'Uniswap', rootUrl: 'https://docs.uniswap.org/', type: 'docs' },
  { projectName: 'Arbitrum', rootUrl: 'https://docs.arbitrum.io/', type: 'docs' },
  { projectName: 'Optimism', rootUrl: 'https://docs.optimism.io/', type: 'docs' },
  { projectName: 'Avalanche', rootUrl: 'https://docs.avax.network/', type: 'docs' },
  { projectName: 'Polkadot', rootUrl: 'https://wiki.polkadot.network/', type: 'docs' }
];

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function crawlAndIngest() {
  console.log('Starting deep documentation scraper (Puppeteer)...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (const target of TARGETS) {
    console.log(`\n======================================================`);
    console.log(`Starting crawl for ${target.projectName}`);
    
    // We will do a shallow crawl (just the root page and immediate children) to save time,
    // as a full deep crawl of 10 doc sites would take hours and tens of thousands of LLM API calls.
    const visited = new Set<string>();
    const queue = [target.rootUrl];
    let maxPagesPerProject = 20; // Cap at 20 pages per project for deeper context

    while (queue.length > 0 && maxPagesPerProject > 0) {
      const currentUrl = queue.shift()!;
      if (visited.has(currentUrl)) continue;
      
      visited.add(currentUrl);
      maxPagesPerProject--;

      console.log(`[${target.projectName}] Fetching: ${currentUrl}`);
      
      let page;
      try {
        page = await browser.newPage();
        await page.setUserAgent('CryptonAI-Bot/1.0 (contact@crypton.ai)');
        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Wait a tiny bit for JS to render
        await sleep(2000);
        
        const html = await page.content();
        const $ = cheerio.load(html);

        // Remove typical noise
        $('nav, footer, aside, script, style, noscript, iframe, .sidebar, .ad, header, svg, button').remove();

        // Extract main content area if possible, otherwise use body
        const mainContent = $('main').length > 0 ? $('main').html() : $('body').html();
        if (!mainContent) {
          await page.close();
          continue;
        }

        const $main = cheerio.load(mainContent);
        const pageTitle = $('title').text() || $main('h1').first().text() || target.projectName;

        let markdown = '';
        $main('h1, h2, h3, h4, h5, h6, p, li, pre, code').each((i, el) => {
          const tagName = el.tagName.toLowerCase();
          const text = $(el).text().trim().replace(/\s+/g, ' ');
          if (!text || text.length < 10) return; // Skip very short noisy tags

          if (tagName.startsWith('h')) {
            const level = parseInt(tagName.replace('h', ''), 10);
            markdown += '\n' + '#'.repeat(level) + ' ' + text + '\n\n';
          } else if (tagName === 'pre' || tagName === 'code') {
            markdown += '\n```\n' + text + '\n```\n\n';
          } else if (tagName === 'li') {
            markdown += '- ' + text + '\n';
          } else {
            markdown += text + '\n\n';
          }
        });

        // Add internal links to queue
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (href) {
            try {
              const absoluteUrl = new URL.URL(href, currentUrl).href;
              // Only follow links within the same root path
              if (absoluteUrl.startsWith(target.rootUrl) && !visited.has(absoluteUrl) && !absoluteUrl.includes('#')) {
                queue.push(absoluteUrl);
              }
            } catch(e) {}
          }
        });

        if (markdown.trim().length > 50) {
          const document = chunkMarkdown(markdown, target.projectName, currentUrl, pageTitle, target.type);
          let insertedChunks = 0;
          for (const chunk of document.chunks) {
            // Optional: You can filter out bad chunks here based on token count
            if (chunk.tokenCount < 20) continue; 

            // Rate limit mitigation for Embedding API
            await sleep(500);
            const embedding = await embeddingService.generateEmbedding(chunk.content);
            const inserted = await dbService.insertChunk({
              projectName: target.projectName,
              sourceUrl: currentUrl,
              pageTitle: pageTitle,
              headingPath: chunk.headingPath,
              content: chunk.content,
              embedding: embedding,
              chunkHash: chunk.chunkHash,
              documentType: target.type,
              tokenCount: chunk.tokenCount
            });
            if (inserted) insertedChunks++;
          }
          console.log(`✅ Ingested ${insertedChunks} chunks from ${currentUrl}`);
        }
      } catch (err: any) {
        console.error(`❌ Error scraping ${currentUrl}:`, err.message);
      } finally {
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch(e) {}
        }
      }
    }
  }

  await browser.close();
  console.log('\n🎉 Finished crawling documentation sources!');
  process.exit(0);
}

crawlAndIngest();
