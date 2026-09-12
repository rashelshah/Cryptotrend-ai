-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create the documents table
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  source_url text not null,
  page_title text,
  heading_path text,
  content text not null,
  embedding vector(768),
  chunk_hash text unique not null,
  document_type text,
  token_count int,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add an index for faster pgvector searches (HNSW)
create index if not exists documents_embedding_idx 
on documents using hnsw (embedding vector_cosine_ops);

-- Add a tsvector column for full-text search (BM25 equivalent)
alter table documents add column if not exists fts tsvector generated always as (to_tsvector('english', content)) stored;
create index if not exists documents_fts_idx on documents using gin (fts);

-- Create a function for Hybrid Search (Vector + Full-Text Search)
-- We will use Reciprocal Rank Fusion (RRF) algorithm to combine ranks.
create or replace function hybrid_search(
  query_text text,
  query_embedding vector(768),
  match_count int default 10,
  full_text_weight float default 1.0,
  semantic_weight float default 1.0,
  rrf_k int default 60
)
returns table (
  id uuid,
  project_name text,
  source_url text,
  page_title text,
  heading_path text,
  content text,
  document_type text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  with full_text as (
    select
      d.id,
      row_number() over(order by ts_rank_cd(d.fts, websearch_to_tsquery('english', query_text)) desc) as rank_ix
    from documents d
    where d.fts @@ websearch_to_tsquery('english', query_text)
    limit match_count
  ),
  semantic as (
    select
      d.id,
      row_number() over(order by d.embedding <=> query_embedding) as rank_ix,
      1 - (d.embedding <=> query_embedding) as similarity_score
    from documents d
    limit match_count
  ),
  merged as (
    select
      coalesce(f.id, s.id) as id,
      (coalesce(1.0 / (rrf_k + f.rank_ix), 0.0) * full_text_weight) +
      (coalesce(1.0 / (rrf_k + s.rank_ix), 0.0) * semantic_weight) as score,
      s.similarity_score
    from full_text f
    full outer join semantic s on f.id = s.id
  )
  select
    d.id,
    d.project_name,
    d.source_url,
    d.page_title,
    d.heading_path,
    d.content,
    d.document_type,
    coalesce(m.similarity_score, 0.0) as similarity
  from merged m
  join documents d on m.id = d.id
  order by m.score desc
  limit match_count;
end;
$$;
