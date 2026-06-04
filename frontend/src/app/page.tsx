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
      {/* Introduction Banner Card */}
      <div className="relative bg-md-surface-container rounded-3xl p-6 md:p-8 shadow-md-elevation-1 mb-8 overflow-hidden">
        {/* Glow light effect behind icon */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-md-primary/10 to-transparent blur-2xl pointer-events-none -z-10" />
        
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="flex gap-4 items-start md:items-center">
            <div className="bg-md-secondary-container text-md-on-secondary-container p-3.5 rounded-2xl shadow-sm">
              <Sparkles size={24} className="text-md-primary" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-md-on-background">Explore Semantically</h3>
              <p className="text-sm md:text-base text-md-on-surface-variant/90 mt-1 max-w-xl">
                Search your codebase using natural language. Query logic, structure, database setups, or API endpoints.
              </p>
            </div>
          </div>
          <div className="bg-md-primary/5 text-md-primary border border-md-primary/20 rounded-full px-4 py-1.5 text-xs font-semibold select-none flex items-center gap-1.5">
            <Database size={13} />
            <span>Indexed: 4,892 files</span>
          </div>
        </div>
      </div>

      {/* Interactive Form Controls */}
      <form onSubmit={handleSearch} className="space-y-6 mb-10">
        
        {/* MATERIAL YOU FILLED TEXT FIELD */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-md-on-surface-variant/70 group-focus-within:text-md-primary transition-colors">
            <Search size={22} strokeWidth={2} />
          </div>
          <input
            type="text"
            placeholder="Search code (e.g. 'how do we authenticate JWT tokens?', 'postgres connection pool')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-14 pr-24 bg-md-surface-container-low text-md-on-background font-medium placeholder-md-on-surface-variant/50 rounded-t-xl border-b-2 border-md-outline/30 focus:border-md-primary focus:outline-none transition-all duration-200 text-base"
          />
          {/* Enter key badge indicator */}
          <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none select-none">
            <kbd className="hidden md:flex items-center gap-1 bg-md-surface-container border border-md-outline/20 px-2.5 py-1 rounded-lg text-xs font-semibold text-md-on-surface-variant/75">
              <span>Search</span>
              <CornerDownLeft size={10} />
            </kbd>
          </div>
        </div>

        {/* Filters and Repository Chips */}
        <div className="flex flex-wrap items-center gap-3.5 select-none">
          <span className="text-xs font-bold text-md-on-surface-variant/80 uppercase tracking-wider flex items-center gap-1.5 mr-1">
            <Filter size={13} />
            <span>Repository:</span>
          </span>
          {repos.map((repo) => (
            <button
              key={repo}
              type="button"
              onClick={() => setSelectedRepo(repo)}
              className={`
                px-5 py-2 rounded-full text-xs font-semibold transition-all duration-300 active:scale-95 focus-visible:ring-2 focus-visible:ring-md-primary/30 focus-visible:ring-offset-2
                ${selectedRepo === repo 
                  ? 'bg-md-primary text-md-on-primary shadow-sm' 
                  : 'bg-md-surface-container hover:bg-md-primary/10 text-md-on-surface-variant'
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
          <div className="flex flex-col items-center justify-center py-20 text-md-on-surface-variant animate-pulse">
            <Loader2 size={36} className="text-md-primary animate-spin mb-4" />
            <span className="text-sm font-semibold tracking-wide">Querying vector index & parsing relevance...</span>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-md-on-surface-variant/70 mb-2">
              Semantic Search Results ({results.length})
            </h4>
            
            {results.map((item) => (
              <div 
                key={item.id} 
                className="group bg-md-surface-container rounded-3xl p-6 shadow-md-elevation-1 hover:shadow-md-elevation-2 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] border border-transparent hover:border-md-primary/10"
              >
                {/* Result header */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-md-primary/10 text-md-primary p-2 rounded-xl">
                      <Code size={18} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-md-on-background hover:underline cursor-pointer">
                        {item.file}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-semibold text-md-on-surface-variant/70">{item.repo}</span>
                        <span className="text-xs text-md-on-surface-variant/40">•</span>
                        <span className="text-xs font-semibold text-md-primary">{item.language}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-md-secondary-container text-md-on-secondary-container text-xs px-3.5 py-1.5 rounded-full font-bold shadow-sm select-none">
                      {item.match}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-md-on-surface-variant/90 leading-relaxed mb-4">
                  {item.description}
                </p>

                {/* Code Snippet Box */}
                <div className="relative rounded-2xl bg-md-surface-container-low border border-md-outline/10 p-4 font-mono text-xs overflow-x-auto text-md-on-background/90 max-h-48 shadow-inner select-all">
                  <pre>{item.snippet}</pre>
                  
                  {/* Subtle terminal-like code layout details */}
                  <div className="absolute top-2.5 right-3 flex items-center gap-1.5 text-[10px] text-md-on-surface-variant/50 font-sans pointer-events-none select-none">
                    <Terminal size={11} />
                    <span>Copyable snippet</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-md-surface-container/30 border border-dashed border-md-outline/30 rounded-3xl text-center p-8 select-none">
            <div className="bg-md-surface-container p-4 rounded-full text-md-on-surface-variant/50 shadow-sm mb-4">
              <Search size={28} />
            </div>
            <h5 className="text-lg font-semibold text-md-on-background">No matching snippets found</h5>
            <p className="text-sm text-md-on-surface-variant/70 max-w-sm mt-1">
              We couldn't find matches for <span className="font-semibold text-md-primary">"{searchQuery}"</span>. Try adjusting your query keywords or changing repo filter tags.
            </p>
            <button 
              onClick={() => { setSearchQuery(""); setSelectedRepo("All"); }}
              className="mt-6 px-6 py-2.5 bg-md-surface-container text-md-primary hover:bg-md-primary/10 rounded-full font-semibold text-xs transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 focus-visible:ring-offset-md-background"
            >
              Reset Search Filter
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) at bottom-right of page layout context to show standard compliance */}
      <div className="fixed bottom-6 right-6 z-30 md:bottom-8 md:right-8">
        <button 
          onClick={() => {
            alert("This FAB opens a semantic AI assistant chat. Implementation compliant with Material 3 floating actions.");
          }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-md-tertiary text-white shadow-md hover:shadow-lg hover:bg-md-tertiary/90 hover:scale-105 active:scale-95 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 focus-visible:ring-offset-md-background"
          title="Open AI Chat Assistant"
          aria-label="Open AI Chat Assistant"
        >
          <Sparkles size={24} />
        </button>
      </div>
    </DashboardShell>
  );
}