"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from "@/components/layout/DashboardShell";
import axios from 'axios';
import { 
  Sparkles, Search, Code, CheckCircle2, ChevronRight, FileText, 
  ArrowRight, Loader2, Database, LogOut, AlertCircle, RefreshCw, Trash2
} from "lucide-react";

interface GithubIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const GithubIcon = ({ size = 24, ...props }: GithubIconProps) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    width={size} 
    height={size} 
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

interface Repository {
  id: number;
  url: string;
  name: string;
  status: string;
  is_public: boolean;
  owner_id: number;
  indexed_at?: string;
}

export default function Home() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Check login state
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
  }, []);

  // Fetch repositories & continuous polling
  useEffect(() => {
    if (!token) return;

    // Define async fetch function and manage polling interval
    let pollInterval: NodeJS.Timeout | null = null;
    const fetchRepos = async () => {
      try {
        const response = await axios.get("http://localhost:8000/api/v1/repositories/my", {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRepos(response.data);
        setIsLoadingRepos(false);
        // Determine if any repo is still processing
        const hasActiveJobs = response.data.some(
          (repo: Repository) => repo.status === 'pending' || repo.status === 'indexing'
        );
        // If no active jobs, stop polling
        if (!hasActiveJobs && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (error: any) {
        console.error("Failed to fetch repositories:", error);
        setIsLoadingRepos(false);
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          setToken(null);
          router.push("/");
        }
      }
    };

    // Initial fetch
    fetchRepos();
    // Start polling interval (will be cleared when no active jobs)
    pollInterval = setInterval(fetchRepos, 3000);
    // Cleanup on unmount
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setRepos([]);
    router.push("/");
  };

  const handleDeleteRepo = async (e: React.MouseEvent, repoId: number) => {
    e.stopPropagation();
    
    if (confirmDeleteId !== repoId) {
      setConfirmDeleteId(repoId);
      // Auto-reset confirmation state after 3 seconds
      setTimeout(() => {
        setConfirmDeleteId(prev => prev === repoId ? null : prev);
      }, 3000);
      return;
    }

    setDeletingRepoId(repoId);
    setConfirmDeleteId(null);

    try {
      await axios.delete(`http://localhost:8000/api/v1/repositories/${repoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepos(prev => prev.filter(r => r.id !== repoId));
    } catch (error: any) {
      console.error("Failed to delete repository:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        setToken(null);
        router.push("/");
      } else {
        alert("Failed to delete repository. Please try again.");
      }
    } finally {
      setDeletingRepoId(null);
    }
  };

  const handleIndexRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setIsSubmitting(true);
    setSubmitError("");
    setSubmitSuccess(false);

    try {
      const response = await axios.post(
        "http://localhost:8000/api/v1/repositories/index",
        { url: repoUrl, is_public: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setRepoUrl("");
      setSubmitSuccess(true);
    } catch (error: any) {
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        setToken(null);
        router.push("/");
      } else {
        const errMsg = error.response?.data?.detail || "Failed to index repository. Make sure it is a valid GitHub URL.";
        setSubmitError(errMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter repositories based on query
  const filteredRepos = repos.filter(repo => 
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    repo.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // UN-AUTHENTICATED STATE (Vibrant Playful Geometric Connection Landing Page)
  if (!token) {
    return (
      <div className="min-h-screen bg-pg-bg bg-dot-grid text-pg-fg flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
        {/* Background Decorative Shapes */}
        <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-pg-secondary border-4 border-pg-fg rounded-full -z-10 animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute bottom-10 left-10 w-48 h-48 bg-pg-tertiary border-4 border-pg-fg rounded-3xl -z-10 rotate-12" />
        <div className="absolute top-[40%] left-[15%] w-32 h-16 bg-pg-mint border-4 border-pg-fg rounded-full -z-10 -rotate-12" />
        
        {/* Landing Card */}
        <div className="max-w-2xl w-full bg-white border-4 border-pg-fg p-10 rounded-[32px] shadow-hard text-center z-10 transition-transform hover:scale-[1.01] duration-300">
          <div className="inline-flex bg-pg-mint text-pg-fg p-4 rounded-full border-4 border-pg-fg shadow-hard mb-6 rotate-3">
            <Code size={36} strokeWidth={3} />
          </div>

          <h1 className="text-4xl md:text-5xl font-heading font-black text-pg-fg tracking-tight mb-4">
            Codebase Intelligence
          </h1>
          <p className="text-lg md:text-xl font-bold leading-relaxed text-pg-fg/80 mb-8 max-w-xl mx-auto">
            Ingest your GitHub repositories, construct semantic code embeddings, and query them in a visually dynamic React Flow dependency workspace.
          </p>

          <a 
            href="http://localhost:8000/api/v1/auth/login/github"
            className="inline-flex items-center gap-3 bg-pg-accent text-white px-8 py-4 rounded-full font-black border-4 border-pg-fg shadow-hard hover:shadow-hard-hover hover:-translate-x-[4px] hover:-translate-y-[4px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active transition-all duration-300 ease-bounce-pop text-lg mx-auto"
          >
            <GithubIcon size={24} strokeWidth={2.5} />
            <span>Connect with GitHub</span>
            <ArrowRight size={20} strokeWidth={3} />
          </a>

          {/* Staging warning fallback helper */}
          <p className="text-xs font-bold text-pg-fg/50 mt-8 max-w-xs mx-auto">
            No configuration needed. Runs automatically in developer demo mode if GitHub secrets are absent.
          </p>
        </div>
      </div>
    );
  }

  // AUTHENTICATED STATE (The Repository Hub / Dashboard)
  return (
    <DashboardShell>
      
      {/* Intro Header Sticker Card */}
      <div className="relative bg-white border-4 border-pg-fg rounded-2xl p-6 md:p-8 shadow-sticker-pink transition-all duration-300 ease-bounce-pop hover:-rotate-1 mb-10">
        <div className="absolute -top-7 left-8 bg-pg-tertiary p-3 rounded-full border-4 border-pg-fg shadow-hard">
          <Sparkles size={28} strokeWidth={2.5} className="text-pg-fg" />
        </div>
        
        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between mt-2">
          <div>
            <h3 className="text-2xl font-heading font-black text-pg-fg">Welcome, Ingest a codebase!</h3>
            <p className="text-base font-bold text-pg-fg/70 mt-1 max-w-xl">
              Paste a public GitHub URL to clone, embed, and analyze its structural imports and code logic.
            </p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 bg-pg-secondary text-pg-fg px-5 py-2.5 rounded-full font-black border-2 border-pg-fg shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 text-sm"
          >
            <LogOut size={16} strokeWidth={2.5} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Ingestion paste bar */}
      <div className="mb-10">
        <form onSubmit={handleIndexRepo} className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-pg-fg/50 group-focus-within:text-pg-accent transition-colors z-10">
            <Database size={24} strokeWidth={3} />
          </div>
          <input
            type="text"
            placeholder="Paste GitHub Repository URL (e.g. 'https://github.com/facebook/react')"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={isSubmitting}
            className="w-full h-16 pl-14 pr-32 bg-white text-pg-fg font-black placeholder-pg-fg/40 rounded-2xl border-4 border-pg-fg shadow-hard transition-all duration-300 ease-bounce-pop focus:outline-none focus:-translate-x-[2px] focus:-translate-y-[2px] focus:shadow-hard-hover text-base md:text-lg"
          />
          <button
            type="submit"
            disabled={isSubmitting || !repoUrl.trim()}
            className="absolute right-3.5 top-3 flex items-center justify-center bg-pg-mint text-pg-fg border-2 border-pg-fg px-5 h-10 rounded-full font-black shadow-hard hover:shadow-[3px_3px_0px_0px_rgba(30,41,59,1)] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all duration-300 text-sm disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={18} strokeWidth={3} />
            ) : (
              <span>Index Repo</span>
            )}
          </button>
        </form>

        {submitError && (
          <div className="mt-4 flex items-center gap-2 text-pg-fg bg-pg-secondary/20 border-2 border-pg-fg rounded-xl p-3.5 font-bold text-sm">
            <AlertCircle size={18} className="text-pg-secondary shrink-0" strokeWidth={3} />
            <span>{submitError}</span>
          </div>
        )}

        {submitSuccess && (
          <div className="mt-4 flex items-center gap-2 text-pg-fg bg-pg-mint/20 border-2 border-pg-fg rounded-xl p-3.5 font-bold text-sm">
            <CheckCircle2 size={18} className="text-pg-mint shrink-0" strokeWidth={3} />
            <span>Ingestion started! Repository has been queued for cloning and embedding.</span>
          </div>
        )}
      </div>

      {/* Search Filter input */}
      {repos.length > 0 && (
        <div className="relative mb-6 group max-w-md">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-pg-fg/50">
            <Search size={18} strokeWidth={2.5} />
          </div>
          <input
            type="text"
            placeholder="Search indexed repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 bg-white text-pg-fg font-bold rounded-xl border-2 border-pg-fg shadow-sm focus:outline-none focus:border-pg-accent text-sm"
          />
        </div>
      )}

      {/* Grid of Repository Cards */}
      <div>
        <h4 className="text-sm font-heading font-black uppercase tracking-wider text-pg-fg/70 mb-4 select-none">
          Your Codebase Workspace Hub
        </h4>

        {isLoadingRepos ? (
          <div className="flex flex-col items-center justify-center py-20 text-pg-fg select-none">
            <Loader2 size={36} className="text-pg-accent animate-spin mb-4" strokeWidth={3} />
            <span className="text-sm font-black tracking-wide">Syncing workspaces...</span>
          </div>
        ) : filteredRepos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredRepos.map((repo) => {
              const isDone = repo.status === 'completed';
              const isFailed = repo.status === 'failed';
              const isProcessing = repo.status === 'indexing' || repo.status === 'pending';

              return (
                <div 
                  key={repo.id}
                  onClick={() => {
                    if (isDone) router.push(`/repo/${repo.id}`);
                  }}
                  className={`
                    bg-white border-4 border-pg-fg rounded-2xl p-6 shadow-hard transition-all duration-300 ease-bounce-pop select-none
                    ${isDone ? 'cursor-pointer hover:shadow-hard-hover hover:-translate-x-[4px] hover:-translate-y-[4px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active' : 'opacity-85'}
                  `}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="bg-pg-muted text-pg-fg p-3 rounded-full border-2 border-pg-fg shadow-hard">
                      <Code size={20} strokeWidth={2.5} />
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status badges */}
                      {repo.status === 'pending' && (
                        <span className="bg-pg-tertiary text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard flex items-center gap-1">
                          <RefreshCw size={12} className="animate-spin" strokeWidth={3} />
                          Pending
                        </span>
                      )}
                      {repo.status === 'indexing' && (
                        <span className="bg-pg-accent text-white text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard flex items-center gap-1">
                          <RefreshCw size={12} className="animate-spin" strokeWidth={3} />
                          Indexing
                        </span>
                      )}
                      {repo.status === 'completed' && (
                        <span className="bg-pg-mint text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard flex items-center gap-1">
                          <CheckCircle2 size={12} strokeWidth={3} />
                          Completed
                        </span>
                      )}
                      {repo.status === 'failed' && (
                        <span className="bg-pg-secondary text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard flex items-center gap-1">
                          <AlertCircle size={12} strokeWidth={3} />
                          Failed
                        </span>
                      )}

                      {/* Delete button with confirmation state */}
                      <button
                        onClick={(e) => handleDeleteRepo(e, repo.id)}
                        disabled={deletingRepoId === repo.id}
                        className={`
                          flex items-center justify-center p-2 rounded-full border-2 border-pg-fg shadow-hard transition-all duration-200 text-xs font-black select-none shrink-0
                          ${confirmDeleteId === repo.id
                            ? 'bg-pg-secondary text-pg-fg px-3 rounded-xl'
                            : 'bg-white text-pg-fg hover:bg-pg-muted'
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                        title={confirmDeleteId === repo.id ? "Click again to confirm delete" : "Delete Repository"}
                      >
                        {deletingRepoId === repo.id ? (
                          <Loader2 size={14} className="animate-spin" strokeWidth={3} />
                        ) : confirmDeleteId === repo.id ? (
                          <span className="flex items-center gap-1">Confirm?</span>
                        ) : (
                          <Trash2 size={14} strokeWidth={2.5} />
                        )}
                      </button>
                    </div>
                  </div>

                  <h5 className="text-xl font-heading font-black text-pg-fg truncate mb-1" title={repo.name}>
                    {repo.name.split("/").pop()}
                  </h5>
                  <p className="text-xs font-bold text-pg-fg/60 truncate mb-4 select-all">
                    {repo.url}
                  </p>

                  <div className="flex items-center justify-between text-xs font-bold text-pg-fg/75 border-t-2 border-pg-fg/10 pt-4">
                    <span>
                      Owner ID: <span className="font-extrabold">{repo.owner_id}</span>
                    </span>
                    {isDone && (
                      <span className="text-pg-accent font-black flex items-center gap-1">
                        Open Workspace
                        <ChevronRight size={14} strokeWidth={3} />
                      </span>
                    )}
                    {isProcessing && (
                      <span className="text-pg-tertiary font-extrabold flex items-center gap-1 animate-pulse">
                        Parsing codebase...
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white border-4 border-pg-fg rounded-2xl text-center p-8 select-none shadow-hard">
            <div className="bg-pg-muted border-2 border-pg-fg p-4 rounded-full text-pg-fg shadow-sm mb-4">
              <Database size={28} strokeWidth={2.5} />
            </div>
            <h5 className="text-xl font-heading font-black text-pg-fg">No repositories found</h5>
            <p className="text-sm font-bold text-pg-fg/70 max-w-xs mt-1">
              Ingest your first GitHub repository using the URL paste bar above to construct an AI workspace.
            </p>
          </div>
        )}
      </div>

    </DashboardShell>
  );
}