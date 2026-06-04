"use client";

import React, { useState } from 'react';
import { FolderGit2, Search, Settings, Menu, GitBranch, ArrowRight, X } from 'lucide-react';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Search');

  const navItems = [
    { id: 'Search', label: 'Search', icon: Search },
    { id: 'Repositories', label: 'Repositories', icon: GitBranch },
    { id: 'Settings', label: 'Settings', icon: Settings },
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
          <div className="w-10 h-10 rounded-full bg-pg-tertiary border-2 border-pg-fg flex items-center justify-center font-black shadow-sm text-pg-fg">
            U
          </div>
          <div className="flex flex-col pr-4 select-none">
            <span className="text-sm font-extrabold leading-tight text-pg-fg">Developer</span>
            <span className="text-xs font-bold text-pg-fg/70">Pro Plan</span>
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
              <div className="w-10 h-10 rounded-full bg-pg-tertiary border-2 border-pg-fg flex items-center justify-center font-black">
                U
              </div>
              <div className="flex flex-col pr-4">
                <span className="text-sm font-extrabold leading-tight text-pg-fg">Developer</span>
                <span className="text-xs font-bold text-pg-fg/70">Pro Plan</span>
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
              {activeTab === 'Search' && 'Semantic Search'}
              {activeTab === 'Repositories' && 'Repositories'}
              {activeTab === 'Settings' && 'System Settings'}
            </h2>
          </div>
          
          {/* THE CANDY BUTTON */}
          <button className="flex items-center gap-2 bg-pg-accent text-white px-6 py-3.5 rounded-full font-bold border-2 border-pg-fg shadow-hard transition-all duration-300 ease-bounce-pop hover:shadow-hard-hover hover:-translate-x-[2px] hover:-translate-y-[2px] active:shadow-hard-active active:translate-x-[2px] active:translate-y-[2px]">
            <span>Index New Repo</span>
            <div className="bg-white text-pg-accent rounded-full p-1 border-2 border-pg-fg">
              <ArrowRight size={14} strokeWidth={3} />
            </div>
          </button>
        </header>

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 z-0">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}