"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from "@/components/layout/DashboardShell";
import axios from 'axios';
import { 
  ReactFlow, Background, Controls, MiniMap, 
  useNodesState, useEdgesState, Position, Handle,
  ReactFlowProvider, useReactFlow, PanOnScrollMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { 
  Sparkles, Send, Loader2, Code, ArrowLeft, RefreshCw, 
  BookOpen, Terminal, CheckCircle2, AlertCircle, FileText,
  User, Calendar, ShieldAlert, Info, ZoomIn, Search, Check, Layers, ChevronRight, X
} from "lucide-react";

// Custom node styling to match the Playful Geometric theme
const CustomNode = ({ data }: { data: any }) => {
  const isHovered = data.isHovered;
  const isConnected = data.isConnected;
  
  let borderClass = "border-pg-fg";
  let shadowClass = "shadow-hard";
  
  if (isHovered) {
    borderClass = "border-pg-accent scale-105 transition-all duration-200";
    shadowClass = "shadow-[0_0_15px_rgba(139,92,246,0.8)]";
  } else if (isConnected) {
    borderClass = "border-pg-mint transition-all duration-200";
    shadowClass = "shadow-[0_0_10px_rgba(52,211,153,0.6)]";
  }

  return (
    <div 
      className={`px-4 py-3 border-4 rounded-2xl font-sans font-black text-xs text-pg-fg flex flex-col items-center select-none ${borderClass} ${shadowClass}`}
      style={{ 
        backgroundColor: data.color || '#ffffff', 
        minWidth: '160px',
        opacity: data.hasActiveHover && !isHovered && !isConnected ? 0.35 : 1.0,
        transition: 'all 200ms ease'
      }}
    >
      <span className="truncate max-w-[140px] text-sm">{data.label}</span>
      <span className="text-[9px] opacity-70 font-bold block truncate max-w-[140px] mt-0.5">{data.path}</span>
      <Handle type="target" position={Position.Top} className="!bg-pg-fg !w-2.5 !h-2.5 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!bg-pg-fg !w-2.5 !h-2.5 !border-2 !border-white" />
    </div>
  );
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ file_path: string; chunk_index: number; content?: string }>;
}

function RepoWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = React.use(params);
  const repoId = resolvedParams.id;
  
  const router = useRouter();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [token, setToken] = useState<string | null>(null);
  const [repoName, setRepoName] = useState("");
  const [allRepos, setAllRepos] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Workspace Navigation Tab
  const [activeTab, setActiveTab] = useState<'chat' | 'graph' | 'analytics' | 'audit'>('chat');

  // React Flow States
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [isLoadingGraph, setIsLoadingGraph] = useState(true);
  const [isFullscreenGraph, setIsFullscreenGraph] = useState(false);

  // Chat States
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Multi-Repository Search States
  const [selectedRepoIds, setSelectedRepoIds] = useState<number[]>([parseInt(repoId)]);
  const [showMultiRepoMenu, setShowMultiRepoMenu] = useState(false);

  // Deep File Code Navigation Drawer States
  const [activeSnippet, setActiveSnippet] = useState<{ file_path: string; chunk_index: number; content: string } | null>(null);

  // Repository Analytics States
  const [metrics, setMetrics] = useState<any>(null);
  const [contributors, setContributors] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);

  // Audit / Quality States
  const [auditData, setAuditData] = useState<any>(null);
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);
  const [duplicateScanCode, setDuplicateScanCode] = useState("");
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [duplicateScanResults, setDuplicateScanResults] = useState<any[]>([]);

  // Panning zoom ref listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn({ duration: 250 });
        } else {
          zoomOut({ duration: 250 });
        }
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [zoomIn, zoomOut, activeTab, isFullscreenGraph]);

  // Escape key global listener for fullscreen / code drawer closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeSnippet) {
          setActiveSnippet(null);
        } else if (isFullscreenGraph) {
          setIsFullscreenGraph(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenGraph, activeSnippet]);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const nodeTypes = useMemo(() => ({ customNode: CustomNode }), []);

  const styledNodes = useMemo(() => {
    if (!hoveredNodeId) return nodes;

    const connectedNodeIds = new Set<string>();
    edges.forEach((edge: any) => {
      if (edge.source === hoveredNodeId) {
        connectedNodeIds.add(edge.target);
      }
    });

    return nodes.map((node: any) => {
      const isHovered = node.id === hoveredNodeId;
      const isConnected = connectedNodeIds.has(node.id);
      return {
        ...node,
        data: {
          ...node.data,
          isHovered,
          isConnected,
          hasActiveHover: true
        }
      };
    });
  }, [nodes, edges, hoveredNodeId]);

  const styledEdges = useMemo(() => {
    if (!hoveredNodeId) return edges;

    return edges.map((edge: any) => {
      const isOutgoing = edge.source === hoveredNodeId;
      return {
        ...edge,
        animated: isOutgoing,
        style: {
          ...edge.style,
          stroke: isOutgoing ? '#F472B6' : '#cbd5e1',
          strokeWidth: isOutgoing ? 4.5 : 1.0,
          opacity: isOutgoing ? 1.0 : 0.15,
          transition: 'all 200ms ease'
        }
      };
    });
  }, [edges, hoveredNodeId]);

  // Fetch token and verification
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      router.push("/");
    } else {
      setToken(storedToken);
    }
  }, [router]);

  // Fetch API details on load
  useEffect(() => {
    if (!token || !repoId) return;

    const fetchWorkspaceData = async () => {
      try {
        // Fetch all user repositories for Multi-Repo dropdown
        const repoResponse = await axios.get("http://localhost:8000/api/v1/repositories/my", {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAllRepos(repoResponse.data);
        
        const currentRepo = repoResponse.data.find((r: any) => r.id === parseInt(repoId));
        if (currentRepo) {
          setRepoName(currentRepo.name);
        } else {
          router.push("/");
          return;
        }

        // Fetch dependency graph
        const graphResponse = await axios.get(`http://localhost:8000/api/v1/repositories/${repoId}/graph`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const rawNodes = graphResponse.data.nodes;
        const rawEdges = graphResponse.data.edges;

        // BFS Layering calculations
        const adj: Record<string, string[]> = {};
        const inDegree: Record<string, number> = {};
        rawNodes.forEach((n: any) => {
          adj[n.id] = [];
          inDegree[n.id] = 0;
        });
        
        rawEdges.forEach((e: any) => {
          if (adj[e.source]) adj[e.source].push(e.target);
          if (inDegree[e.target] !== undefined) inDegree[e.target]++;
        });
        
        const levels: Record<string, number> = {};
        const queue: string[] = [];
        
        rawNodes.forEach((n: any) => {
          if (inDegree[n.id] === 0) {
            levels[n.id] = 0;
            queue.push(n.id);
          }
        });
        
        if (queue.length === 0 && rawNodes.length > 0) {
          levels[rawNodes[0].id] = 0;
          queue.push(rawNodes[0].id);
        }
        
        while (queue.length > 0) {
          const u = queue.shift()!;
          const currentLevel = levels[u] || 0;
          
          (adj[u] || []).forEach((v: string) => {
            if (levels[v] === undefined) {
              levels[v] = currentLevel + 1;
              queue.push(v);
            } else {
              levels[v] = Math.max(levels[v], currentLevel + 1);
            }
          });
        }
        
        rawNodes.forEach((n: any) => {
          if (levels[n.id] === undefined) levels[n.id] = 0;
        });
        
        const levelGroups: Record<number, any[]> = {};
        rawNodes.forEach((n: any) => {
          const l = levels[n.id];
          if (!levelGroups[l]) levelGroups[l] = [];
          levelGroups[l].push(n);
        });
        
        const positionedNodes: any[] = [];
        Object.keys(levelGroups).forEach((levelStr) => {
          const level = parseInt(levelStr);
          const nodesInLevel = levelGroups[level];
          const totalWidth = (nodesInLevel.length - 1) * 320;
          
          nodesInLevel.forEach((node: any, idx: number) => {
            const x = idx * 320 - totalWidth / 2 + 300;
            const y = level * 220 + 80;
            positionedNodes.push({
              ...node,
              position: { x, y }
            });
          });
        });

        setNodes(positionedNodes);
        setEdges(rawEdges);
        setIsLoading(false);
        setIsLoadingGraph(false);
      } catch (error: any) {
        console.error("Failed to load workspace files:", error);
        setIsLoading(false);
        setIsLoadingGraph(false);
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          setToken(null);
          router.push("/");
        }
      }
    };

    fetchWorkspaceData();
  }, [token, repoId, router, setNodes, setEdges]);

  // Fetch Analytics & Audits details
  useEffect(() => {
    if (!token || !repoId) return;

    const fetchAnalytics = async () => {
      try {
        setIsLoadingAnalytics(true);
        // File sizes, lines, function stats
        const metricsRes = await axios.get(`http://localhost:8000/api/v1/analytics/${repoId}/analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMetrics(metricsRes.data);

        // Contributors list
        const gitRes = await axios.get(`http://localhost:8000/api/v1/analytics/${repoId}/contributors`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setContributors(gitRes.data);

        // Timeline log lists
        const timelineRes = await axios.get(`http://localhost:8000/api/v1/analytics/${repoId}/timeline`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTimeline(timelineRes.data);
        setIsLoadingAnalytics(false);
      } catch (err: any) {
        console.error("Failed to load analytics:", err);
        setIsLoadingAnalytics(false);
      }
    };

    const fetchAudit = async () => {
      try {
        setIsLoadingAudit(true);
        // Code vulnerabilities & dead code scan
        const auditRes = await axios.get(`http://localhost:8000/api/v1/analytics/${repoId}/audit`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAuditData(auditRes.data);
        setIsLoadingAudit(false);
      } catch (err: any) {
        console.error("Failed to load code audit:", err);
        setIsLoadingAudit(false);
      }
    };

    fetchAnalytics();
    fetchAudit();
  }, [token, repoId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSending) return;

    const promptText = chatInput;
    setChatInput("");
    setIsSending(true);

    const userMessage: Message = { role: 'user', content: promptText };
    setChatHistory(prev => [...prev, userMessage]);

    try {
      let response;
      if (selectedRepoIds.length > 1) {
        // Run multi-repository search
        response = await axios.post(
          `http://localhost:8000/api/v1/repositories/multi-chat`,
          {
            prompt: promptText,
            repo_ids: selectedRepoIds,
            history: chatHistory.map(m => ({ role: m.role, content: m.content }))
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        // Standard single repo hybrid search
        response = await axios.post(
          `http://localhost:8000/api/v1/repositories/${repoId}/chat`,
          {
            prompt: promptText,
            history: chatHistory.map(m => ({ role: m.role, content: m.content }))
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.data.answer,
        sources: response.data.sources
      };
      setChatHistory(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Failed to fetch response:", error);
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        setToken(null);
        router.push("/");
      } else {
        const errorMessage: Message = {
          role: 'assistant',
          content: "Sorry, I encountered an error searching the database or generating a response."
        };
        setChatHistory(prev => [...prev, errorMessage]);
      }
    } finally {
      setIsSending(false);
    }
  };

  // Triggers duplicate scanning search
  const handleDuplicateScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateScanCode.trim() || isScanningDuplicates) return;

    setIsScanningDuplicates(true);
    setDuplicateScanResults([]);
    try {
      const res = await axios.post(
        `http://localhost:8000/api/v1/repositories/${repoId}/similar-code`,
        { code_block: duplicateScanCode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDuplicateScanResults(res.data.matches || []);
    } catch (err) {
      console.error("Duplicate scan failed:", err);
      alert("Failed to run similarity match. Please try again.");
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const toggleRepoSelection = (id: number) => {
    setSelectedRepoIds(prev => 
      prev.includes(id) 
        ? (prev.length > 1 ? prev.filter(item => item !== id) : prev)
        : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pg-bg bg-dot-grid text-pg-fg flex flex-col items-center justify-center p-6 select-none">
        <Loader2 className="animate-spin text-pg-accent mb-4" size={40} strokeWidth={3} />
        <h3 className="text-xl font-heading font-black">Loading Workspace Graph...</h3>
      </div>
    );
  }

  return (
    <DashboardShell>
      
      {/* Upper Navigation Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 select-none">
        <button 
          onClick={() => router.push("/")}
          className="flex items-center gap-2 bg-white border-2 border-pg-fg px-4 py-2 rounded-full font-black shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 text-xs transition-transform duration-200"
        >
          <ArrowLeft size={14} strokeWidth={3} />
          <span>Back to Repositories</span>
        </button>

        <div className="bg-pg-muted border-2 border-pg-fg rounded-full px-5 py-2 text-xs font-black text-pg-fg flex items-center gap-2">
          <Code size={14} strokeWidth={2.5} />
          <span className="truncate max-w-xs">{repoName}</span>
        </div>
      </div>

      {/* Main Panel - Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">
        
        {/* Navigation Sidebar Tabs (3 Columns) */}
        <div className="lg:col-span-3 flex flex-col gap-4 select-none">
          <div className="bg-white border-4 border-pg-fg p-5 rounded-2xl shadow-hard">
            <h4 className="text-xs font-heading font-black uppercase text-pg-fg/60 tracking-wider mb-3">
              Workspace Modules
            </h4>
            
            <nav className="flex flex-col gap-2.5">
              <button
                onClick={() => setActiveTab('chat')}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 border-pg-fg font-black text-xs shadow-hard flex items-center gap-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5
                  ${activeTab === 'chat' ? 'bg-pg-accent text-white' : 'bg-white text-pg-fg'}
                `}
              >
                <Sparkles size={16} />
                <span>AI RAG Assistant</span>
              </button>
              
              <button
                onClick={() => setActiveTab('graph')}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 border-pg-fg font-black text-xs shadow-hard flex items-center gap-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5
                  ${activeTab === 'graph' ? 'bg-pg-mint text-pg-fg' : 'bg-white text-pg-fg'}
                `}
              >
                <Layers size={16} />
                <span>Dependency Graph</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 border-pg-fg font-black text-xs shadow-hard flex items-center gap-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5
                  ${activeTab === 'analytics' ? 'bg-pg-tertiary text-pg-fg' : 'bg-white text-pg-fg'}
                `}
              >
                <Calendar size={16} />
                <span>Repo Analytics</span>
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 border-pg-fg font-black text-xs shadow-hard flex items-center gap-3 transition-transform hover:-translate-y-0.5 active:translate-y-0.5
                  ${activeTab === 'audit' ? 'bg-pg-secondary text-pg-fg' : 'bg-white text-pg-fg'}
                `}
              >
                <ShieldAlert size={16} />
                <span>Security & Code Audit</span>
              </button>
            </nav>
          </div>

          {/* Quick-Prompt Help Deck */}
          {activeTab === 'chat' && (
            <div className="bg-white border-4 border-pg-fg p-5 rounded-2xl shadow-hard">
              <h5 className="text-[10px] font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-2">
                Quick Questions
              </h5>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setChatInput("Explain how JWT token authentication and security works in this project.")}
                  className="w-full text-left text-[11px] font-bold text-pg-fg/75 hover:text-pg-accent hover:underline leading-snug"
                >
                  * How does JWT token auth work?
                </button>
                <button
                  onClick={() => setChatInput("Onboarding checklist: explain project directories and how to contribute.")}
                  className="w-full text-left text-[11px] font-bold text-pg-fg/75 hover:text-pg-accent hover:underline leading-snug"
                >
                  * Setup local dev setup & directories?
                </button>
                <button
                  onClick={() => setChatInput("Who is the main contributor author and code owner here?")}
                  className="w-full text-left text-[11px] font-bold text-pg-fg/75 hover:text-pg-accent hover:underline leading-snug"
                >
                  * Who owns authentication code files?
                </button>
                <button
                  onClick={() => setChatInput("Impact Analysis: What breaks if I modify AuthService?")}
                  className="w-full text-left text-[11px] font-bold text-pg-fg/75 hover:text-pg-accent hover:underline leading-snug"
                >
                  * What breaks if I modify AuthService?
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Display Panel (9 Columns) */}
        <div className="lg:col-span-9">

          {/* 1. TAB: AI RAG CHAT */}
          {activeTab === 'chat' && (
            <div className="border-4 border-pg-fg rounded-[32px] bg-white shadow-hard flex flex-col h-[calc(100vh-14rem)] min-h-[500px] overflow-hidden">
              {/* Header */}
              <div className="bg-pg-muted border-b-4 border-pg-fg px-6 py-4 flex flex-wrap items-center justify-between gap-4 select-none">
                <div className="flex items-center gap-2">
                  <div className="bg-pg-accent text-white p-1.5 rounded-full border-2 border-pg-fg">
                    <Sparkles size={16} strokeWidth={2.5} />
                  </div>
                  <span className="font-heading font-black text-sm">Repo AI Chat Assistant (Hybrid Search)</span>
                </div>
                
                {/* Multi-Repo Selection Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowMultiRepoMenu(!showMultiRepoMenu)}
                    className="bg-white text-pg-fg border-2 border-pg-fg px-3.5 py-1.5 rounded-full font-black text-[10px] shadow-hard flex items-center gap-1.5 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5"
                  >
                    <span>Multi-Repo Search ({selectedRepoIds.length})</span>
                    <ChevronRight size={10} className={`transform transition-transform ${showMultiRepoMenu ? 'rotate-90' : ''}`} />
                  </button>

                  {showMultiRepoMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white border-4 border-pg-fg p-3.5 rounded-2xl shadow-hard z-30 flex flex-col gap-2 max-h-60 overflow-y-auto">
                      <h6 className="text-[9px] font-heading font-black text-pg-fg/40 uppercase tracking-wider mb-1">
                        Select Services to Chat With
                      </h6>
                      {allRepos.map((repo) => (
                        <label 
                          key={repo.id} 
                          className="flex items-center gap-2 text-xs font-bold text-pg-fg cursor-pointer hover:bg-pg-muted p-1.5 rounded-lg"
                        >
                          <input 
                            type="checkbox"
                            checked={selectedRepoIds.includes(repo.id)}
                            onChange={() => toggleRepoSelection(repo.id)}
                            className="rounded border-2 border-pg-fg accent-pg-accent cursor-pointer"
                          />
                          <span className="truncate">{repo.name.split("/").pop()}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Message Display Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-pg-bg bg-dot-grid">
                {chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-pg-fg text-center p-8 select-none">
                    <div className="bg-white border-2 border-pg-fg p-3 rounded-full shadow-hard mb-3">
                      <Sparkles size={24} className="text-pg-accent" strokeWidth={2.5} />
                    </div>
                    <h5 className="text-base font-black">Ask anything about this codebase!</h5>
                    <p className="text-xs font-bold text-pg-fg/60 max-w-xs mt-1">
                      Query vector embeddings and keyword logic. Ask questions, setup guidelines, or request impact analysis reports.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {chatHistory.map((msg, index) => {
                      const isUser = msg.role === 'user';
                      return (
                        <div key={index} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                          <div className={`max-w-[85%] border-2 border-pg-fg p-4 rounded-2xl shadow-hard font-sans text-sm leading-relaxed ${isUser ? 'bg-pg-accent text-white rounded-br-none' : 'bg-white text-pg-fg rounded-bl-none'}`}>
                            
                            <div className="whitespace-pre-wrap select-text markdown-render">{msg.content}</div>

                            {/* Citations badges linking to navigation drawer */}
                            {!isUser && msg.sources && msg.sources.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-pg-fg/10 select-none">
                                <span className="text-[10px] font-black uppercase text-pg-fg/50 flex items-center gap-1.5 mb-1.5">
                                  <Terminal size={10} />
                                  Source Reference Files:
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {msg.sources.map((s, i) => (
                                    <button 
                                      key={i}
                                      onClick={() => s.content && setActiveSnippet({
                                        file_path: s.file_path,
                                        chunk_index: s.chunk_index,
                                        content: s.content
                                      })}
                                      className="inline-flex items-center gap-1 bg-pg-muted border border-pg-fg/20 px-2 py-0.5 rounded-lg text-[9px] font-black text-pg-fg hover:bg-pg-tertiary cursor-pointer active:scale-95 transition-transform"
                                    >
                                      <FileText size={9} />
                                      <span>{s.file_path.split("/").pop()}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {isSending && (
                      <div className="flex justify-start animate-pulse">
                        <div className="bg-white border-2 border-pg-fg p-4 rounded-2xl rounded-bl-none shadow-hard text-pg-fg flex items-center gap-2 select-none">
                          <Loader2 className="animate-spin text-pg-accent" size={16} strokeWidth={3} />
                          <span className="text-xs font-black">Scanning vector databases & file ranks...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                )}
              </div>

              {/* Form Input */}
              <div className="p-4 bg-white border-t-4 border-pg-fg select-none">
                <form onSubmit={handleSendMessage} className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="Ask the AI about this codebase..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={isSending}
                    className="w-full h-14 pl-4 pr-16 bg-pg-muted text-pg-fg font-bold placeholder-pg-fg/40 rounded-xl border-2 border-pg-fg focus:outline-none focus:border-pg-accent text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !chatInput.trim()}
                    className="absolute right-2.5 top-2.5 flex items-center justify-center bg-pg-accent text-white border-2 border-pg-fg w-9 h-9 rounded-lg font-black shadow-hard hover:shadow-[1px_1px_0px_0px_rgba(30,41,59,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Send size={14} strokeWidth={2.5} />
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* 2. TAB: TOPOLOGY GRAPH */}
          {activeTab === 'graph' && (
            <div className="border-4 border-pg-fg rounded-[32px] bg-white shadow-hard h-[calc(100vh-14rem)] min-h-[500px] overflow-hidden flex flex-col relative select-none">
              
              {/* Header */}
              <div className="bg-pg-muted border-b-4 border-pg-fg px-6 py-4 flex items-center justify-between shadow-sm z-10">
                <span className="font-heading font-black text-sm flex items-center gap-2">
                  <Layers size={16} />
                  Dependency Topology Canvas
                </span>
                <button
                  onClick={() => setIsFullscreenGraph(true)}
                  className="bg-white text-pg-fg border-2 border-pg-fg px-3 py-1 rounded-full font-black text-[10px] shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5"
                >
                  Fullscreen Graph View
                </button>
              </div>

              {/* Small/Embedded Graph Render */}
              <div ref={containerRef} className="flex-1 relative bg-pg-bg">
                {isLoadingGraph ? (
                  <div className="flex flex-col items-center justify-center h-full text-pg-fg animate-pulse">
                    <RefreshCw className="animate-spin text-pg-accent mb-2" size={24} />
                    <span className="text-xs font-black">Drawing relationships...</span>
                  </div>
                ) : nodes.length > 0 ? (
                  <div className="absolute inset-0">
                    <ReactFlow
                      nodes={styledNodes}
                      edges={styledEdges}
                      nodeTypes={nodeTypes}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
                      onNodeMouseLeave={() => setHoveredNodeId(null)}
                      fitView
                      fitViewOptions={{ padding: 0.2, duration: 800 }}
                      minZoom={0.05}
                      maxZoom={4.0}
                      panOnScroll={true}
                      panOnScrollMode={PanOnScrollMode.Free}
                      zoomOnScroll={false}
                      zoomOnPinch={false}
                      panOnDrag={true}
                      preventScrolling={true}
                      zoomOnDoubleClick={true}
                    >
                      <Background color="#cbd5e1" gap={24} size={2.5} />
                      <Controls className="!border-4 !border-pg-fg !shadow-hard !rounded-xl overflow-hidden !bg-white" />
                    </ReactFlow>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-pg-fg p-6 text-center">
                    <BookOpen size={32} className="text-pg-fg/40 mb-3" />
                    <h5 className="text-base font-black">No dependencies resolved</h5>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. TAB: REPOSITORY ANALYTICS */}
          {activeTab === 'analytics' && (
            <div className="space-y-8 select-none">
              
              {/* Analytics Loading */}
              {isLoadingAnalytics ? (
                <div className="bg-white border-4 border-pg-fg p-12 rounded-[32px] shadow-hard flex flex-col items-center justify-center">
                  <Loader2 className="animate-spin text-pg-accent mb-3" size={32} />
                  <h4 className="text-sm font-black">Compiling repository history statistics...</h4>
                </div>
              ) : (
                <>
                  {/* Dashboard Metrics Grid */}
                  {metrics && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard border-l-pg-mint">
                        <span className="text-[10px] font-black uppercase text-pg-fg/40 tracking-wider">Total Indexed Files</span>
                        <h3 className="text-3xl font-heading font-black text-pg-fg mt-1">{metrics.total_files}</h3>
                      </div>
                      <div className="bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard border-l-pg-accent">
                        <span className="text-[10px] font-black uppercase text-pg-fg/40 tracking-wider">Lines of Code</span>
                        <h3 className="text-3xl font-heading font-black text-pg-fg mt-1">{metrics.total_lines.toLocaleString()}</h3>
                      </div>
                      <div className="bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard border-l-pg-tertiary">
                        <span className="text-[10px] font-black uppercase text-pg-fg/40 tracking-wider">Total Declarations</span>
                        <h3 className="text-3xl font-heading font-black text-pg-fg mt-1">{metrics.total_functions} functions</h3>
                      </div>
                    </div>
                  )}

                  {/* Languages and Module Sizes */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Language distribution progress bars */}
                    <div className="md:col-span-6 bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                      <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-4">
                        Language Distribution
                      </h5>
                      <div className="space-y-4">
                        {metrics && Object.keys(metrics.language_distribution).length > 0 ? (
                          Object.entries(metrics.language_distribution).map(([lang, pct]: any) => (
                            <div key={lang}>
                              <div className="flex justify-between text-xs font-bold mb-1">
                                <span>{lang}</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="w-full bg-pg-muted h-3.5 border-2 border-pg-fg rounded-full overflow-hidden">
                                <div className="bg-pg-accent h-full border-r-2 border-pg-fg" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          ))
                        ) : (
                          <span className="text-xs font-bold text-pg-fg/60">No files scanned.</span>
                        )}
                      </div>
                    </div>

                    {/* Largest modules list */}
                    <div className="md:col-span-6 bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                      <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-4">
                        Largest Modules (Lines of Code)
                      </h5>
                      <div className="divide-y-2 divide-pg-fg/10">
                        {metrics && metrics.largest_modules.map((m: any, idx: number) => (
                          <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                            <span className="font-bold truncate max-w-xs">{m.file_path}</span>
                            <span className="font-black text-pg-accent shrink-0">{m.lines} lines</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Contributor Git Analytics */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Top Contributors list */}
                    <div className="md:col-span-6 bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                      <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-4">
                        Repository Contributors
                      </h5>
                      <div className="space-y-3">
                        {contributors && contributors.top_contributors.map((c: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="bg-pg-muted p-2 rounded-full border border-pg-fg/30">
                              <User size={14} className="text-pg-fg/70" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black truncate">{c.contributor.split(" ")[0]}</p>
                              <p className="text-[10px] font-bold text-pg-fg/50 truncate">{c.contributor}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-pg-accent">{c.commits} commits</p>
                              <p className="text-[10px] font-bold text-pg-fg/60">{c.percentage}% ownership</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Expert finder ownership mappings */}
                    <div className="md:col-span-6 bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                      <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-4">
                        Code Ownership Matrix
                      </h5>
                      <div className="divide-y-2 divide-pg-fg/10 max-h-60 overflow-y-auto">
                        {contributors && Object.entries(contributors.expert_matrix).map(([file, details]: any, idx: number) => (
                          <div key={idx} className="py-2 flex items-center justify-between gap-4 text-xs">
                            <div className="min-w-0">
                              <p className="font-bold truncate" title={file}>{file.split("/").pop()}</p>
                              <p className="text-[10px] text-pg-fg/50 truncate" title={file}>{file}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="bg-pg-mint text-[9px] font-black border border-pg-fg px-2 py-0.5 rounded-full">
                                {details.expert}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Vertical Timeline logs */}
                  <div className="bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                    <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-6">
                      Repository Commits Timeline
                    </h5>
                    <div className="space-y-6 relative border-l-4 border-pg-fg pl-6 ml-3">
                      {timeline.map((commit, i) => (
                        <div key={i} className="relative">
                          {/* Anchor bullet */}
                          <div className="absolute -left-10 top-0.5 bg-pg-tertiary border-2 border-pg-fg w-4 h-4 rounded-full" />
                          <div className="text-xs font-bold text-pg-fg/55 flex items-center gap-1.5">
                            <Calendar size={12} />
                            <span>{commit.date}</span>
                            <span className="text-[10px] bg-pg-muted border px-2 py-0.5 rounded-full font-black text-pg-fg/75 ml-1">
                              {commit.author}
                            </span>
                          </div>
                          <p className="text-sm font-black text-pg-fg mt-1">
                            {commit.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 4. TAB: SECURITY & CODE AUDIT */}
          {activeTab === 'audit' && (
            <div className="space-y-8 select-none">
              
              {/* Duplicate Clone Scanning Tool (Item 17) */}
              <div className="bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-2">
                  Similar Code Discovery Scanner (Duplication Auditor)
                </h5>
                <p className="text-[11px] font-bold text-pg-fg/60 mb-4">
                  Paste a block of code below to search ChromaDB and locate clones or similar logic blocks within this repository.
                </p>
                <form onSubmit={handleDuplicateScan} className="space-y-4">
                  <textarea
                    rows={4}
                    placeholder="Paste a code snippet here (e.g. 'function verifyToken(token) { ... }')"
                    value={duplicateScanCode}
                    onChange={(e) => setDuplicateScanCode(e.target.value)}
                    className="w-full p-3 bg-pg-muted border-2 border-pg-fg rounded-xl font-mono text-xs focus:outline-none focus:border-pg-accent"
                  />
                  <button
                    type="submit"
                    disabled={isScanningDuplicates || !duplicateScanCode.trim()}
                    className="bg-pg-accent text-white border-2 border-pg-fg px-5 py-2.5 rounded-xl font-black text-xs shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-40"
                  >
                    {isScanningDuplicates ? "Searching codebase..." : "Scan For Duplicates"}
                  </button>
                </form>

                {duplicateScanResults.length > 0 && (
                  <div className="mt-6 space-y-4 border-t-2 border-pg-fg/10 pt-4">
                    <h6 className="text-xs font-black text-pg-fg">Matches Discovered:</h6>
                    <div className="space-y-3">
                      {duplicateScanResults.map((match, idx) => (
                        <div key={idx} className="bg-pg-muted border-2 border-pg-fg p-4 rounded-xl">
                          <div className="flex items-center justify-between text-[11px] font-black mb-2 text-pg-accent">
                            <span>File: {match.file_path}</span>
                            <span>Chunk: #{match.chunk_index}</span>
                          </div>
                          <pre className="font-mono text-[10px] overflow-x-auto text-pg-fg/80 max-h-40 bg-white p-3 border rounded border-pg-fg/20 select-text">
                            {match.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {isLoadingAudit ? (
                <div className="bg-white border-4 border-pg-fg p-12 rounded-[32px] shadow-hard flex flex-col items-center justify-center">
                  <Loader2 className="animate-spin text-pg-accent mb-3" size={32} />
                  <h4 className="text-sm font-black">Executing static security checks & dead code scan...</h4>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                  
                  {/* Vulnerability list (7 Columns) */}
                  <div className="md:col-span-7 bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                    <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-4 flex items-center gap-2">
                      <ShieldAlert size={16} className="text-pg-secondary animate-bounce" />
                      Security Audit Warnings
                    </h5>
                    
                    <div className="space-y-4">
                      {auditData && auditData.vulnerabilities.length > 0 ? (
                        auditData.vulnerabilities.map((v: any, i: number) => (
                          <div key={i} className="border-2 border-pg-fg p-4 rounded-xl bg-pg-bg flex flex-col gap-2 relative">
                            <span className={`absolute right-3 top-3 text-[9px] font-black border-2 border-pg-fg px-2.5 py-0.5 rounded-full shadow-hard
                              ${v.severity === 'High' ? 'bg-pg-secondary text-pg-fg' : 'bg-pg-tertiary text-pg-fg'}
                            `}>
                              {v.severity}
                            </span>
                            <div className="text-xs font-black text-pg-fg/50 flex items-center gap-1">
                              <FileText size={10} />
                              <span>{v.file_path}:{v.line_number}</span>
                            </div>
                            <h6 className="text-sm font-black text-pg-fg leading-none mt-1">{v.title}</h6>
                            <p className="text-[11px] font-bold text-pg-fg/70 leading-relaxed mt-1">{v.description}</p>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center gap-2 bg-pg-mint/20 border-2 border-pg-fg rounded-xl p-3.5 font-bold text-xs">
                          <CheckCircle2 size={16} className="text-pg-mint" />
                          <span>No security alerts detected. Codebase looks safe!</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dead code list (5 Columns) */}
                  <div className="md:col-span-5 bg-white border-4 border-pg-fg p-6 rounded-2xl shadow-hard">
                    <h5 className="text-xs font-heading font-black uppercase text-pg-fg/50 tracking-wider mb-4 flex items-center gap-2">
                      <Info size={16} className="text-pg-tertiary" />
                      Dead/Unused Exports Scan
                    </h5>

                    <div className="space-y-3">
                      {auditData && auditData.dead_code.length > 0 ? (
                        auditData.dead_code.map((d: any, i: number) => (
                          <div key={i} className="border border-pg-fg/20 p-3.5 rounded-xl bg-pg-muted flex flex-col gap-1.5">
                            <div className="text-[10px] font-bold text-pg-fg/50 flex items-center gap-1.5">
                              <FileText size={10} />
                              <span>{d.file_path}</span>
                            </div>
                            <p className="text-xs font-black text-pg-fg leading-none">
                              Unreferenced: <code className="bg-white border rounded px-1.5 py-0.5 text-pg-accent select-all">{d.symbol}</code>
                            </p>
                            <p className="text-[10px] font-bold text-pg-fg/60 leading-tight mt-0.5">{d.description}</p>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center gap-2 bg-pg-mint/20 border-2 border-pg-fg rounded-xl p-3.5 font-bold text-xs">
                          <CheckCircle2 size={16} className="text-pg-mint" />
                          <span>No unused exports detected. Clean compile!</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Code Navigation Drawer (Feature 12 Jump directly to Code citation chunk content) */}
      {activeSnippet && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-white border-l-8 border-pg-fg z-50 shadow-[0_0_50px_rgba(0,0,0,0.4)] flex flex-col animate-slide-in pointer-events-auto select-none">
          {/* Header */}
          <div className="bg-pg-muted border-b-4 border-pg-fg px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2 truncate pr-4">
              <FileText size={16} className="text-pg-accent shrink-0" />
              <div className="min-w-0">
                <h5 className="text-sm font-black truncate">{activeSnippet.file_path.split("/").pop()}</h5>
                <p className="text-[10px] font-bold text-pg-fg/50 truncate">{activeSnippet.file_path}</p>
              </div>
            </div>
            <button 
              onClick={() => setActiveSnippet(null)}
              className="bg-pg-secondary border-2 border-pg-fg p-1.5 rounded-full hover:scale-105 active:scale-95 transition-transform cursor-pointer"
            >
              <X size={14} strokeWidth={3} />
            </button>
          </div>

          {/* Code Viewer body */}
          <div className="flex-1 overflow-auto p-6 bg-pg-bg">
            <div className="flex items-center justify-between mb-4">
              <span className="bg-pg-tertiary text-pg-fg border border-pg-fg px-2.5 py-0.5 rounded-full text-[9px] font-black">
                Code Block Chunk: #{activeSnippet.chunk_index}
              </span>
              <span className="text-[10px] font-black text-pg-fg/45">
                Press ESC to close
              </span>
            </div>
            <pre className="font-mono text-xs text-pg-fg p-4 border-2 border-pg-fg rounded-2xl bg-white shadow-hard overflow-x-auto select-text leading-relaxed">
              {activeSnippet.content}
            </pre>
          </div>
        </div>
      )}

      {/* Fullscreen Overlay Dependency Graph Modal */}
      {isFullscreenGraph && (
        <div className="fixed inset-0 z-50 bg-pg-bg flex flex-col w-screen h-screen select-none animate-bounce-pop pointer-events-auto">
          {/* Header row in full screen */}
          <div className="bg-white border-b-4 border-pg-fg px-6 py-4 flex items-center justify-between z-30 shadow-sm pointer-events-auto">
            <div className="bg-pg-muted border-2 border-pg-fg rounded-full px-5 py-2 text-xs font-black text-pg-fg flex items-center gap-2">
              <Code size={14} strokeWidth={2.5} />
              <span className="truncate max-w-xs">{repoName} - Topology</span>
            </div>
            
            <button
              onClick={() => setIsFullscreenGraph(false)}
              className="bg-pg-secondary text-pg-fg border-2 border-pg-fg px-6 py-2 rounded-full font-black shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 text-xs transition-transform duration-200 cursor-pointer pointer-events-auto z-40"
            >
              Back to Workspace View (Esc)
            </button>
          </div>

          {/* Graph canvas */}
          <div ref={containerRef} className="flex-1 w-full bg-pg-bg relative pointer-events-auto">
            {isLoadingGraph ? (
              <div className="flex flex-col items-center justify-center h-full text-pg-fg animate-pulse">
                <RefreshCw className="animate-spin text-pg-accent mb-2" size={24} />
                <span className="text-xs font-black">Parsing references...</span>
              </div>
            ) : nodes.length > 0 ? (
              <div className="absolute inset-0 z-0">
                <ReactFlow
                  nodes={styledNodes}
                  edges={styledEdges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
                  onNodeMouseLeave={() => setHoveredNodeId(null)}
                  fitView
                  fitViewOptions={{ padding: 0.2, duration: 800 }}
                  minZoom={0.05}
                  maxZoom={4.0}
                  panOnScroll={true}
                  panOnScrollMode={PanOnScrollMode.Free}
                  zoomOnScroll={false}
                  zoomOnPinch={false}
                  panOnDrag={true}
                  preventScrolling={true}
                  zoomOnDoubleClick={true}
                >
                  <Background color="#cbd5e1" gap={24} size={2.5} />
                </ReactFlow>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-pg-fg p-6 text-center select-none z-0">
                <BookOpen size={32} className="text-pg-fg/40 mb-3" />
                <h5 className="text-base font-black">No file dependencies parsed</h5>
              </div>
            )}

            {/* Custom Neo-Brutalist Back to Workspace Floating Button */}
            <div className="absolute bottom-6 left-6 z-30 pointer-events-auto">
              <button
                onClick={() => setIsFullscreenGraph(false)}
                className="bg-pg-secondary text-pg-fg border-4 border-pg-fg px-6 py-3 rounded-2xl font-black text-sm shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-2 cursor-pointer select-none pointer-events-auto"
                title="Get Back to Workspace"
              >
                <span>← Get Back to Workspace</span>
              </button>
            </div>

            {/* Custom Neo-Brutalist Zoom Controls */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-30 pointer-events-auto">
              <button
                onClick={() => zoomIn({ duration: 300 })}
                className="w-12 h-12 bg-white text-pg-fg border-4 border-pg-fg rounded-xl font-black text-xl shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center cursor-pointer select-none pointer-events-auto"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={() => zoomOut({ duration: 300 })}
                className="w-12 h-12 bg-white text-pg-fg border-4 border-pg-fg rounded-xl font-black text-xl shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center cursor-pointer select-none pointer-events-auto"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={() => fitView({ duration: 800 })}
                className="bg-pg-mint text-pg-fg border-4 border-pg-fg px-4 py-2 rounded-xl font-black text-xs shadow-hard hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center cursor-pointer select-none pointer-events-auto"
                title="Reset View"
              >
                Reset View
              </button>
            </div>
          </div>
        </div>
      )}

    </DashboardShell>
  );
}

export default function RepoWorkspacePageWrapper(props: any) {
  return (
    <ReactFlowProvider>
      <RepoWorkspacePage {...props} />
    </ReactFlowProvider>
  );
}
