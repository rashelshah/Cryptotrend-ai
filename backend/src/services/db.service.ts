import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export class DbService {
  /**
   * Upserts a chunk into the documents table if it doesn't already exist.
   * Relies on the unique `chunk_hash` constraint.
   */
  async insertChunk(data: {
    projectName: string;
    sourceUrl: string;
    pageTitle: string;
    headingPath: string;
    content: string;
    embedding: number[];
    chunkHash: string;
    documentType: string;
    tokenCount: number;
  }): Promise<boolean> {
    const { error } = await supabase.from('documents').upsert({
      project_name: data.projectName,
      source_url: data.sourceUrl,
      page_title: data.pageTitle,
      heading_path: data.headingPath,
      content: data.content,
      embedding: data.embedding,
      chunk_hash: data.chunkHash,
      document_type: data.documentType,
      token_count: data.tokenCount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'chunk_hash' });

    if (error) {
      console.error('Error inserting chunk:', error.message);
      return false;
    }
    return true;
  }

  /**
   * Executes the hybrid search via the Postgres function.
   */
  async hybridSearch(
    queryText: string,
    queryEmbedding: number[],
    matchCount: number = 10
  ) {
    const { data, error } = await supabase.rpc('hybrid_search', {
      query_text: queryText,
      query_embedding: queryEmbedding,
      match_count: matchCount,
      full_text_weight: 1.0,
      semantic_weight: 1.0,
      rrf_k: 60
    });

    if (error) {
      console.error('Hybrid search error:', error.message);
      throw error;
    }

    return data;
  }
}

export const dbService = new DbService();
