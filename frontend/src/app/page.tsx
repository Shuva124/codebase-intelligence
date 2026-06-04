"use client";

import React, { useState, useEffect } from 'react';
import DashboardShell from "@/components/layout/DashboardShell";
import { 
  Sparkles, Search, Code, CheckCircle2, ChevronRight, FileText, 
    ArrowRight, Loader2, Filter, CornerDownLeft, Database, Terminal
    } from "lucide-react";
    
    interface SnippetResult {
      id: number;
        file: string;
          repo: string;
            match: string;
              snippet: string;
                language: string;
                  description: string;
}

const MOCK_RESULTS: SnippetResult[] = [
  {
    id: 1,
    file: "backend/app/api/auth.py",
    repo: "backend-core",
    match: "98% match",
    snippet: `def verify_jwt_token(token: str) -> UserClaims:\n    try:\n        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])\n        return UserClaims(**payload)\n    except JWTError as e:\n        raise HTTPException(status_code=401, detail="Invalid token")`,
    language: "Python",
    description: "Decodes and verifies JWT signature, returning token claims or throwing 401 unauthorized."
  },
  {
    id: 2,
    file: "frontend/src/components/layout/DashboardShell.tsx",
    repo: "nextjs-frontend",
    match: "94% match",
    snippet: `export default function DashboardShell({ children }) {\n  const [activeTab, setActiveTab] = useState('Search');\n  return (\n    <div className="flex h-screen bg-md-background text-md-on-background font-sans">\n      {/* ... */}\n    </div>\n  );\n}`,
    language: "TypeScript",
    description: "Main dashboard shell container providing responsive navigation, state-driven drawer layout, and Material You styled theme context."
  },
  {
    id: 3,
    file: "backend/app/services/vector_store.py",
    repo: "backend-core",
    match: "91% match",
    snippet: `class VectorStore:\n    async def search_similar_code(self, query_embedding: List[float], limit: int = 5) -> List[CodeSnippet]:\n        results = await self.db.execute(\n            "SELECT id, file_path, content, 1 - (embedding <=> :emb) as similarity FROM code_embeddings ..."\n        )\n        return [CodeSnippet(**row) for row in results]`,
    language: "Python",
    description: "Performs cosine similarity search using pgvector on embedding indices to fetch relevant code fragments."
  },
  {
    id: 4,
    file: "frontend/src/app/globals.css",
    repo: "nextjs-frontend",
    match: "87% match",
    snippet: `@layer base {\n  * {\n    @apply border-md-outline/20;\n    transition-property: color, background-color, border-color, text-decoration-color;\n    transition-timing-function: cubic-bezier(0.2, 0, 0, 1);\n    transition-duration: 300ms;\n  }\n}`,
    language: "CSS",
    description: "Global style setup enforcing Material You transitions, outlines, and accessibility reduced-motion parameters."
  }
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState("All");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SnippetResult[]>(MOCK_RESULTS);
  const [hasSearched, setHasSearched] = useState(false);

  const repos = ["All", "backend-core", "nextjs-frontend"];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    setHasSearched(true);

    // Simulate vector search latency
    setTimeout(() => {
      const filtered = MOCK_RESULTS.filter(item => {
        const matchesQuery = 
          item.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesRepo = selectedRepo === "All" || item.repo === selectedRepo;

        return matchesQuery && matchesRepo;
      });

      setResults(filtered);
      setIsLoading(false);
    }, 800);
  };

  // Filter automatically on repo selection change
  useEffect(() => {
    const filtered = MOCK_RESULTS.filter(item => {
      const matchesQuery = 
        !searchQuery.trim() ||
        item.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.snippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesRepo = selectedRepo === "All" || item.repo === selectedRepo;

      return matchesQuery && matchesRepo;
    });
    setResults(filtered);
  }, [selectedRepo]);

  return (
    <DashboardShell>
      
      {/* THE STICKER CARD */}
      <div className="relative bg-white border-4 border-pg-fg rounded-2xl p-8 shadow-sticker-pink transition-all duration-300 ease-bounce-pop hover:-rotate-1 hover:scale-[1.01] mb-10 mt-4">
        
        {/* Floating icon half-in, half-out of the top border */}
        <div className="absolute -top-7 left-8 bg-pg-mint p-3 rounded-full border-4 border-pg-fg shadow-hard transition-transform duration-300 hover:rotate-12 cursor-pointer">
          <Sparkles size={28} strokeWidth={2.5} className="text-pg-fg" />
        </div>

        <h3 className="text-2xl font-heading font-black mb-3 mt-2 text-pg-fg">Explore Semantically!</h3>
        <p className="text-base md:text-lg font-bold leading-relaxed text-pg-fg/90">
          Query your files using natural language. Try searching for <code className="bg-pg-muted border border-pg-fg/20 px-1.5 py-0.5 rounded-lg text-sm select-all">auth</code>, <code className="bg-pg-muted border border-pg-fg/20 px-1.5 py-0.5 rounded-lg text-sm select-all">vector</code>, or select a repository tag below to filter codebase chunks.
        </p>
      </div>

      {/* Interactive Form Controls */}
      <form onSubmit={handleSearch} className="space-y-6 mb-10">
        
        {/* PLAYFUL GEOMETRIC TEXT FIELD */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-pg-fg/50 group-focus-within:text-pg-accent transition-colors z-10">
            <Search size={24} strokeWidth={3} />
          </div>
          <input
            type="text"
            placeholder="Search code (e.g. 'how do we authenticate JWT tokens?', 'postgres connection pool')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-16 pl-14 pr-24 bg-white text-pg-fg font-black placeholder-pg-fg/40 rounded-2xl border-4 border-pg-fg shadow-hard transition-all duration-300 ease-bounce-pop focus:outline-none focus:-translate-x-[2px] focus:-translate-y-[2px] focus:shadow-hard-hover text-base md:text-lg"
          />
          {/* Enter key badge indicator */}
          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none select-none">
            <kbd className="hidden md:flex items-center gap-1 bg-pg-muted border-2 border-pg-fg px-2.5 py-1 rounded-xl text-xs font-black text-pg-fg shadow-sm">
              <span>Search</span>
              <CornerDownLeft size={10} strokeWidth={3} />
            </kbd>
          </div>
        </div>

        {/* Filters and Repository Chips */}
        <div className="flex flex-wrap items-center gap-3.5 select-none">
          <span className="text-xs md:text-sm font-heading font-black uppercase tracking-wider text-pg-fg mr-2 flex items-center gap-1.5">
            <Filter size={14} strokeWidth={2.5} />
            <span>Repository:</span>
          </span>
          {repos.map((repo) => (
            <button
              key={repo}
              type="button"
              onClick={() => setSelectedRepo(repo)}
              className={`
                px-5 py-2.5 rounded-full text-xs font-black border-2 border-pg-fg transition-all duration-300 active:translate-y-0.5 active:shadow-none
                ${selectedRepo === repo 
                  ? 'bg-pg-accent text-white shadow-hard translate-x-[-2px] translate-y-[-2px]' 
                  : 'bg-white hover:bg-pg-muted text-pg-fg hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[2px_2px_0px_0px_rgba(30,41,59,1)]'
                }
              `}
            >
              {repo === 'All' ? 'All Repositories' : repo}
            </button>
          ))}
        </div>
      </form>

      {/* Code Results Section */}
      <div className="space-y-6 min-h-[300px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-pg-fg">
            <Loader2 size={36} className="text-pg-accent animate-spin mb-4" strokeWidth={3} />
            <span className="text-sm font-black tracking-wide">Querying vector index & parsing relevance...</span>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-8">
            <h4 className="text-xs md:text-sm font-heading font-black uppercase tracking-wider text-pg-fg/70 mb-2">
              Semantic Search Results ({results.length})
            </h4>
            
            {results.map((item) => (
              <div 
                key={item.id} 
                className="group bg-white border-4 border-pg-fg rounded-2xl p-6 shadow-hard hover:shadow-hard-hover hover:-translate-x-[4px] hover:-translate-y-[4px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active transition-all duration-300 ease-bounce-pop"
              >
                {/* Result header */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-pg-mint text-pg-fg p-2.5 rounded-full border-2 border-pg-fg shadow-hard transition-transform duration-300 group-hover:rotate-6">
                      <Code size={18} strokeWidth={2.5} />
                    </div>
                    <div>
                      <span className="text-sm md:text-base font-black text-pg-fg hover:underline cursor-pointer block">
                        {item.file}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold text-pg-fg/70">{item.repo}</span>
                        <span className="text-xs text-pg-fg/40">•</span>
                        <span className="text-xs font-black text-pg-accent bg-pg-accent/10 border border-pg-accent/30 rounded-full px-2 py-0.5 select-none">{item.language}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-pg-secondary text-pg-fg border-2 border-pg-fg px-4 py-1.5 rounded-full font-black text-xs shadow-hard select-none">
                      {item.match}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm md:text-base font-bold text-pg-fg/90 leading-relaxed mb-4">
                  {item.description}
                </p>

                {/* Code Snippet Box */}
                <div className="relative rounded-xl bg-pg-muted border-2 border-pg-fg p-4 font-mono text-xs overflow-x-auto text-pg-fg shadow-inner select-all">
                  <pre className="whitespace-pre">{item.snippet}</pre>
                  
                  {/* Subtle terminal-like code layout details */}
                  <div className="absolute top-2.5 right-3 flex items-center gap-1.5 text-[10px] text-pg-fg/50 font-sans pointer-events-none select-none font-bold">
                    <Terminal size={11} strokeWidth={2.5} />
                    <span>Snippet</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white border-4 border-pg-fg rounded-2xl text-center p-8 select-none shadow-hard">
            <div className="bg-pg-muted border-2 border-pg-fg p-4 rounded-full text-pg-fg shadow-sm mb-4">
              <Search size={28} strokeWidth={2.5} />
            </div>
            <h5 className="text-xl font-heading font-black text-pg-fg">No matching snippets found</h5>
            <p className="text-sm md:text-base font-bold text-pg-fg/70 max-w-sm mt-1">
              We couldn't find matches for <span className="font-extrabold text-pg-accent">"{searchQuery}"</span>. Try adjusting your query keywords or changing repo filter tags.
            </p>
            <button 
              onClick={() => { setSearchQuery(""); setSelectedRepo("All"); }}
              className="mt-6 px-6 py-3 bg-pg-tertiary text-pg-fg border-2 border-pg-fg hover:bg-pg-tertiary/95 rounded-full font-black text-xs shadow-hard active:translate-y-0.5 active:shadow-none transition-all duration-300"
            >
              Reset Search Filter
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) in Playful Geometric layout */}
      <div className="fixed bottom-6 right-6 z-30 md:bottom-8 md:right-8">
        <button 
          onClick={() => {
            alert("This opens the CodeIntel Assistant. Theme compliant with Playful Geometric neo-brutalism guidelines.");
          }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pg-tertiary text-pg-fg border-4 border-pg-fg shadow-hard hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-hard-hover active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active transition-all duration-300 focus:outline-none"
          title="Open AI Chat Assistant"
          aria-label="Open AI Chat Assistant"
        >
          <Sparkles size={24} strokeWidth={2.5} />
        </button>
      </div>
    </DashboardShell>
  );
}