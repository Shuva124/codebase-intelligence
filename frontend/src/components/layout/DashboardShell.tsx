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
        w-full flex items-center gap-4 px-6 py-3.5 rounded-full transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]
        active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary/50 focus-visible:ring-offset-2
        ${active 
          ? 'bg-md-secondary-container text-md-on-secondary-container font-semibold shadow-md' 
          : 'bg-transparent text-md-on-surface-variant hover:bg-md-primary/10 font-medium hover:text-md-primary'
        }
      `}
    >
      <Icon size={22} strokeWidth={2} />
      <span className="tracking-wide text-sm">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-md-background text-md-on-background font-sans relative">
      
      {/* Decorative Organic Blur Shapes for atmospheric depth */}
      <div 
        aria-hidden="true" 
        className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-md-primary/15 to-md-secondary-container/5 blur-[80px] -z-10 pointer-events-none animate-pulse"
        style={{ animationDuration: '8s' }}
      />
      <div 
        aria-hidden="true" 
        className="absolute bottom-[-15%] left-[20%] w-[450px] h-[450px] rounded-full bg-gradient-to-tr from-md-tertiary/10 to-transparent blur-[100px] -z-10 pointer-events-none animate-pulse"
        style={{ animationDuration: '12s' }}
      />

      {/* SIDEBAR: Material You Tonal Surface (Surface Container) */}
      <aside className="hidden md:flex flex-col w-72 h-full bg-md-surface-container border-r border-md-outline/10 p-6 z-20 shadow-md">
        <div className="flex items-center gap-3.5 mb-10 px-2">
          {/* Logo container with rounded shape and Primary color */}
          <div className="bg-md-primary text-md-on-primary p-2.5 rounded-2xl shadow-md transition-transform duration-300 hover:scale-105">
            <FolderGit2 size={24} strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-md-on-background">CodeIntel</h1>
        </div>

        <nav className="flex-1 space-y-2">
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
        <div className="mt-auto p-2 bg-md-surface-container-low border border-md-outline/10 rounded-full flex items-center gap-3 cursor-pointer hover:bg-md-primary/10 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:shadow-sm active:scale-98">
          <div className="w-10 h-10 rounded-full bg-md-primary text-md-on-primary flex items-center justify-center font-bold shadow-sm">
            D
          </div>
          <div className="flex flex-col pr-4 select-none">
            <span className="text-sm font-semibold leading-tight text-md-on-background">Developer</span>
            <span className="text-xs font-medium text-md-on-surface-variant/80">Pro Plan</span>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER MENU */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-xs transition-opacity duration-300" onClick={() => setIsMobileMenuOpen(false)}>
          <aside 
            className="w-72 h-full bg-md-surface-container p-6 flex flex-col shadow-xl z-50 animate-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3.5">
                <div className="bg-md-primary text-md-on-primary p-2.5 rounded-2xl shadow-sm">
                  <FolderGit2 size={24} strokeWidth={2} />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-md-on-background">CodeIntel</h1>
              </div>
              <button 
                className="p-2 rounded-full hover:bg-md-primary/10 text-md-on-background active:scale-95"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
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

            <div className="mt-auto p-2 bg-md-surface-container-low border border-md-outline/10 rounded-full flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-md-primary text-md-on-primary flex items-center justify-center font-bold">
                D
              </div>
              <div className="flex flex-col pr-4">
                <span className="text-sm font-semibold leading-tight">Developer</span>
                <span className="text-xs font-medium text-md-on-surface-variant/80">Pro Plan</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-transparent">
        
        {/* HEADER: Blurred surface container */}
        <header className="h-20 flex items-center justify-between px-6 md:px-10 bg-md-background/70 backdrop-blur-md border-b border-md-outline/10 z-10">
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2.5 rounded-full hover:bg-md-primary/10 text-md-on-background active:scale-95 transition-all"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <Menu size={22} strokeWidth={2} />
            </button>
            <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-md-on-background select-none">
              {activeTab === 'Search' && 'Semantic Search'}
              {activeTab === 'Repositories' && 'Repositories'}
              {activeTab === 'Settings' && 'System Settings'}
            </h2>
          </div>
          
          {/* THE FAB-STYLE MAIN BUTTON (Pill-shaped with active feedback & state transitions) */}
          <button className="group flex items-center gap-2.5 bg-md-primary text-md-on-primary px-6 py-3 rounded-full font-medium shadow-md hover:shadow-lg hover:bg-md-primary/95 active:scale-95 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2 focus-visible:ring-offset-md-background">
            <span>Index New Repo</span>
            <div className="bg-md-on-primary/10 text-md-on-primary rounded-full p-1 transition-transform group-hover:translate-x-1 duration-300">
              <ArrowRight size={15} strokeWidth={2.5} />
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