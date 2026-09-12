import crypto from 'crypto';

export interface Chunk {
  content: string;
  headingPath: string;
  tokenCount: number;
}

export interface ChunkedDocument {
  projectName: string;
  sourceUrl: string;
  pageTitle: string;
  documentType: string;
  chunks: Array<Chunk & { chunkHash: string }>;
}

/**
 * A basic markdown chunker that respects headings.
 * For production, we can refine the token count estimation.
 */
export function chunkMarkdown(
  markdown: string,
  projectName: string,
  sourceUrl: string,
  pageTitle: string,
  documentType: string = 'docs',
  maxTokens: number = 800,
  overlap: number = 100
): ChunkedDocument {
  const lines = markdown.split('\n');
  const chunks: Array<Chunk & { chunkHash: string }> = [];
  
  let currentHeadingPath = [pageTitle];
  let currentChunkLines: string[] = [];
  let currentTokenCount = 0;

  // Rough estimation: 1 word ~ 1.3 tokens
  const estimateTokens = (text: string) => Math.ceil(text.split(/\s+/).length * 1.3);

  const finalizeChunk = () => {
    if (currentChunkLines.length === 0) return;
    
    const content = currentChunkLines.join('\n');
    const tokenCount = estimateTokens(content);
    const headingPath = currentHeadingPath.join(' > ');
    
    // Create a hash based on the content and its URL location to ensure uniqueness
    const hashInput = `${sourceUrl}::${headingPath}::${content}`;
    const chunkHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    chunks.push({
      content,
      headingPath,
      tokenCount,
      chunkHash
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      
      // Update heading path
      currentHeadingPath = currentHeadingPath.slice(0, level);
      currentHeadingPath[level - 1] = text;
      
      // Start a new chunk if we have enough content
      if (currentTokenCount > maxTokens / 2) {
        finalizeChunk();
        
        // Keep some overlap lines (e.g. last 3 lines) if we are chunking due to size/heading
        const overlapLines = currentChunkLines.slice(-Math.max(1, Math.floor(overlap / 10)));
        currentChunkLines = [...overlapLines];
        currentTokenCount = estimateTokens(currentChunkLines.join('\n'));
      }
    }
    
    currentChunkLines.push(line);
    currentTokenCount += estimateTokens(line);
    
    if (currentTokenCount >= maxTokens) {
      finalizeChunk();
      // Keep overlap
      const overlapLines = currentChunkLines.slice(-Math.max(1, Math.floor(overlap / 10)));
      currentChunkLines = [...overlapLines];
      currentTokenCount = estimateTokens(currentChunkLines.join('\n'));
    }
  }

  // Finalize any remaining text
  finalizeChunk();

  return {
    projectName,
    sourceUrl,
    pageTitle,
    documentType,
    chunks
  };
}
