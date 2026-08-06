"use client";

import React, { useState, useEffect } from 'react';
import { FolderGit2, Search, Settings, Menu, GitBranch, ArrowRight, X, FileText, Terminal, Sparkles } from 'lucide-react';
import { API_BASE_URL } from "@/lib/api";
import axios from 'axios';

export default function DashboardShell({ children, hideHeader = false }: { children: React.ReactNode, hideHeader?: boolean }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Workspaces');
  const [user, setUser] = useState<{ email: string; username?: string; name?: string; avatar_url?: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    axios.get(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(response => {
      setUser(response.data);
    })
    .catch(error => {
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/";
      } else {
        console.error("Failed to fetch user profile:", error);
      }
    });
  }, []);

  const navItems = [
    { id: 'Workspaces', label: 'Workspaces', icon: FolderGit2 },
    { id: 'Docs', label: 'Docs & API', icon: FileText },
    { id: 'Status', label: 'System Status', icon: Terminal },
  ];

  const NavItem = ({ icon: Icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-4 px-6 py-3 rounded-full border-2 transition-all duration-300 ease-bounce-pop
        active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active
        ${active 
          ? 'bg-pg-tertiary border-pg-fg shadow-hard translate-x-[-2px] translate-y-[-2px] font-black text-pg-fg' 
          : 'bg-transparent border-transparent hover:border-pg-fg hover:bg-pg-secondary hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-hard text-pg-fg font-bold'
        }
      `}
    >
      <Icon size={22} strokeWidth={2.5} />
      <span className="tracking-wide text-sm">{label}</span>
    </button>
  );

  const renderDocsPanel = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white border-4 border-pg-fg rounded-2xl p-6 md:p-8 shadow-hard text-left">
          <h3 className="text-2xl font-heading font-black mb-4 flex items-center gap-2">
            <Sparkles size={24} className="text-pg-accent animate-pulse" />
            Getting Started with CodeIntel
          </h3>
          <p className="font-bold text-pg-fg/80 mb-6 leading-relaxed">
            CodeIntel allows you to index GitHub repositories, construct semantic code embeddings, and run an interactive React Flow codebase dependency visualizer and chat assistant.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border-2 border-pg-fg rounded-xl p-5 bg-pg-muted">
              <h4 className="font-heading font-black text-lg mb-2">1. Ingest your Codebase</h4>
              <p className="text-sm font-bold text-pg-fg/70">
                Paste any public or private GitHub repository URL in the search bar. The background worker will clone the files, slice them into 1000-character chunks, and compute vector embeddings using Gemini.
              </p>
            </div>
            <div className="border-2 border-pg-fg rounded-xl p-5 bg-pg-muted">
              <h4 className="font-heading font-black text-lg mb-2">2. Analyze Dependencies</h4>
              <p className="text-sm font-bold text-pg-fg/70">
                Open a workspace to render a complete topological import mapping of your files. Hover over nodes to trace outgoing file connections and see exactly what import references exist.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border-4 border-pg-fg rounded-2xl p-6 md:p-8 shadow-hard text-left">
          <h3 className="text-2xl font-heading font-black mb-4">REST API Reference</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border-2 border-pg-fg font-bold text-sm">
              <thead>
                <tr className="bg-pg-tertiary border-b-2 border-pg-fg">
                  <th className="p-3 border-r-2 border-pg-fg">Method</th>
                  <th className="p-3 border-r-2 border-pg-fg">Endpoint</th>
                  <th className="p-3">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-pg-fg">
                  <td className="p-3 border-r-2 border-pg-fg text-pg-accent font-black">GET</td>
                  <td className="p-3 border-r-2 border-pg-fg text-xs font-mono">/api/v1/repositories/my</td>
                  <td className="p-3 text-pg-fg/70">List all indexed repositories for the authenticated user.</td>
                </tr>
                <tr className="border-b-2 border-pg-fg">
                  <td className="p-3 border-r-2 border-pg-fg text-pg-mint font-black">POST</td>
                  <td className="p-3 border-r-2 border-pg-fg text-xs font-mono">/api/v1/repositories/index</td>
                  <td className="p-3 text-pg-fg/70">Register and trigger background cloning and embedding.</td>
                </tr>
                <tr className="border-b-2 border-pg-fg">
                  <td className="p-3 border-r-2 border-pg-fg text-pg-accent font-black">GET</td>
                  <td className="p-3 border-r-2 border-pg-fg text-xs font-mono">/api/v1/repositories/&#123;id&#125;/graph</td>
                  <td className="p-3 text-pg-fg/70">Retrieve parsed file dependency nodes and React Flow edges.</td>
                </tr>
                <tr className="border-b-2 border-pg-fg">
                  <td className="p-3 border-r-2 border-pg-fg text-pg-mint font-black">POST</td>
                  <td className="p-3 border-r-2 border-pg-fg text-xs font-mono">/api/v1/repositories/&#123;id&#125;/reindex</td>
                  <td className="p-3 text-pg-fg/70">Clear vectors and trigger clean codebase re-ingestion.</td>
                </tr>
                <tr>
                  <td className="p-3 border-r-2 border-pg-fg text-pg-mint font-black">POST</td>
                  <td className="p-3 border-r-2 border-pg-fg text-xs font-mono">/api/v1/repositories/&#123;id&#125;/chat</td>
                  <td className="p-3 text-pg-fg/70">Execute a RAG codebase query with Gemini fallback chain.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderStatusPanel = () => {
    return (
      <div className="space-y-6">
        <div className="bg-white border-4 border-pg-fg rounded-2xl p-6 md:p-8 shadow-hard text-left">
          <h3 className="text-2xl font-heading font-black mb-6">Service Health & Node Connections</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border-2 border-pg-fg rounded-xl p-5 bg-white shadow-hard flex items-center justify-between">
              <div>
                <h4 className="font-heading font-black text-lg">PostgreSQL Core Database</h4>
                <p className="text-xs font-bold text-pg-fg/70 mt-1">PostgreSQL Database (Metadata Storage)</p>
              </div>
              <span className="bg-pg-mint text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard">
                Connected
              </span>
            </div>

            <div className="border-2 border-pg-fg rounded-xl p-5 bg-white shadow-hard flex items-center justify-between">
              <div>
                <h4 className="font-heading font-black text-lg">Vector Database</h4>
                <p className="text-xs font-bold text-pg-fg/70 mt-1">ChromaDB Collection (Code Chunks)</p>
              </div>
              <span className="bg-pg-mint text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard">
                Connected
              </span>
            </div>

            <div className="border-2 border-pg-fg rounded-xl p-5 bg-white shadow-hard flex items-center justify-between">
              <div>
                <h4 className="font-heading font-black text-lg">AI Ingestion Pipeline</h4>
                <p className="text-xs font-bold text-pg-fg/70 mt-1">Primary: gemini-2.5-flash</p>
              </div>
              <span className="bg-pg-mint text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard">
                Online
              </span>
            </div>

            <div className="border-2 border-pg-fg rounded-xl p-5 bg-white shadow-hard flex items-center justify-between">
              <div>
                <h4 className="font-heading font-black text-lg">GitHub OAuth</h4>
                <p className="text-xs font-bold text-pg-fg/70 mt-1">OAuth Synchronizer & API Cloner</p>
              </div>
              <span className="bg-pg-mint text-pg-fg text-xs font-black border-2 border-pg-fg px-3 py-1 rounded-full shadow-hard">
                Configured
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border-4 border-pg-fg rounded-2xl p-6 md:p-8 shadow-hard text-left">
          <h3 className="text-2xl font-heading font-black mb-4">Ingestion Worker Status</h3>
          <div className="flex items-center gap-4 p-4 border-2 border-pg-fg rounded-xl bg-pg-muted">
            <div className="w-4 h-4 rounded-full bg-pg-mint border-2 border-pg-fg animate-pulse shrink-0" />
            <div>
              <p className="font-heading font-black text-sm">Background Thread Queue: Idle</p>
              <p className="text-xs font-bold text-pg-fg/70 mt-0.5">Listening to incoming repository submission events.</p>
            </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div className="flex h-screen overflow-hidden bg-pg-bg text-pg-fg font-sans relative bg-dot-grid">
      
      {/* SIDEBAR: Thick borders, flat colors */}
      <aside className="hidden md:flex flex-col w-72 h-full bg-white border-r-4 border-pg-fg p-6 z-20">
        <div className="flex items-center gap-3.5 mb-10 px-2">
          {/* Icon in a colored circle with borders and hard shadow */}
          <div className="bg-pg-mint text-pg-fg p-2.5 rounded-full border-2 border-pg-fg shadow-hard transition-transform duration-300 hover:rotate-6 hover:scale-105 cursor-pointer">
            <FolderGit2 size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-heading font-black tracking-tight text-pg-fg select-none">CodeIntel</h1>
        </div>

        <nav className="flex-1 space-y-3">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
            />
          ))}
        </nav>

        {/* User Profile - Pill shape */}
        <div className="mt-auto p-2 bg-white border-2 border-pg-fg rounded-full flex items-center gap-3 cursor-pointer hover:bg-pg-mint transition-all duration-300 ease-bounce-pop hover:shadow-hard hover:-translate-x-[2px] hover:-translate-y-[2px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-active">
          {user?.avatar_url ? (
            <img 
              src={user.avatar_url} 
              alt="Avatar" 
              className="w-10 h-10 rounded-full border-2 border-pg-fg object-cover shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-pg-tertiary border-2 border-pg-fg flex items-center justify-center font-black shadow-sm text-pg-fg">
              {user ? (user.name ? user.name.charAt(0).toUpperCase() : (user.username ? user.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase())) : 'U'}
            </div>
          )}
          <div className="flex flex-col pr-4 select-none max-w-[150px] justify-center">
            <span className="text-sm font-extrabold leading-tight text-pg-fg truncate" title={user ? (user.name || user.username || user.email) : ''}>
              {user ? (user.name || user.username || user.email.split('@')[0]) : 'Developer'}
            </span>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER MENU */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-pg-fg/40 z-40 md:hidden backdrop-blur-xs transition-opacity duration-300" onClick={() => setIsMobileMenuOpen(false)}>
          <aside 
            className="w-72 h-full bg-white border-r-4 border-pg-fg p-6 flex flex-col z-50 transition-transform duration-300 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3.5">
                <div className="bg-pg-mint text-pg-fg p-2.5 rounded-full border-2 border-pg-fg shadow-hard">
                  <FolderGit2 size={24} strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-heading font-black tracking-tight text-pg-fg">CodeIntel</h1>
              </div>
              <button 
                className="p-2.5 rounded-full border-2 border-pg-fg bg-pg-secondary hover:bg-pg-secondary/95 text-pg-fg active:translate-y-0.5 shadow-sm active:shadow-none"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <nav className="flex-1 space-y-3">
              {navItems.map((item) => (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={activeTab === item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                />
              ))}
            </nav>

            <div className="mt-auto p-2 bg-white border-2 border-pg-fg rounded-full flex items-center gap-3">
              {user?.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border-2 border-pg-fg object-cover shadow-sm"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-pg-tertiary border-2 border-pg-fg flex items-center justify-center font-black shadow-sm text-pg-fg">
                  {user ? (user.name ? user.name.charAt(0).toUpperCase() : (user.username ? user.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase())) : 'U'}
                </div>
              )}
              <div className="flex flex-col pr-4 max-w-[150px] justify-center">
                <span className="text-sm font-extrabold leading-tight text-pg-fg truncate" title={user ? (user.name || user.username || user.email) : ''}>
                  {user ? (user.name || user.username || user.email.split('@')[0]) : 'Developer'}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-transparent">
        
        {/* Playful Geometric Background Shapes */}
        <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-pg-secondary border-4 border-pg-fg rounded-full -z-10" />
        <div className="absolute bottom-10 right-10 w-32 h-32 bg-pg-tertiary border-4 border-pg-fg rounded-tl-[64px] rounded-br-[64px] rounded-tr-none rounded-bl-none -z-10 rotate-12" />
        <div className="absolute bottom-[35%] left-[10%] w-24 h-48 bg-pg-accent/10 border-4 border-pg-fg/10 rounded-full -z-10 -rotate-45" />

        {/* HEADER */}
        {!hideHeader && (
          <header className="h-24 flex items-center justify-between px-6 md:px-10 bg-white/90 border-b-4 border-pg-fg z-10">
            <div className="flex items-center gap-4">
              <button 
                className="md:hidden p-2.5 rounded-full border-2 border-pg-fg bg-pg-tertiary hover:bg-pg-tertiary/95 text-pg-fg shadow-sm active:translate-y-0.5 active:shadow-none"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open mobile menu"
              >
                <Menu size={22} strokeWidth={2.5} />
              </button>
              <h2 className="text-2xl md:text-3xl font-heading font-black text-pg-fg select-none">
                {activeTab === 'Workspaces' && 'Codebase Workspaces'}
                {activeTab === 'Docs' && 'Documentation & API'}
                {activeTab === 'Status' && 'System Status'}
              </h2>
            </div>
            
            {/* BRAND LOGO */}
            <div className="flex items-center gap-3 select-none">
              <div className="bg-pg-mint text-pg-fg p-2 rounded-full border-2 border-pg-fg shadow-hard">
                <FolderGit2 size={18} strokeWidth={2.5} />
              </div>
              <span className="text-lg md:text-xl font-heading font-black text-pg-fg">CodeIntel</span>
            </div>
          </header>
        )}

        {/* PAGE CONTENT */}
        <div className={
          hideHeader 
            ? "flex-1 w-full h-full relative z-0 overflow-hidden"
            : "flex-1 overflow-y-auto p-6 md:p-10 z-0"
        }>
          <div className={hideHeader ? "w-full h-full" : "max-w-5xl mx-auto"}>
            {activeTab === 'Workspaces' && children}
            {activeTab === 'Docs' && renderDocsPanel()}
            {activeTab === 'Status' && renderStatusPanel()}
          </div>
        </div>
      </main>
    </div>
  );
}