import React from 'react';
import { Home, Search, Heart, User } from 'lucide-react';
import { motion } from 'framer-motion';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  favoritesCount: number;
  userAvatar: string;
  userName: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  favoritesCount,
  userAvatar,
  userName
}) => {
  const menuItems = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'search', label: 'Explorar', icon: Search },
    { id: 'favorites', label: 'Favoritos', icon: Heart, badge: favoritesCount > 0 ? favoritesCount : undefined },
    { id: 'profile', label: 'Minha Conta', icon: User }
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 h-screen w-64 bg-obsidian-card/90 border-r border-obsidian-border/50 backdrop-blur-xl z-30 p-6 justify-between">
        <div className="flex flex-col gap-10">
          {/* Logo Brand */}
          <div className="flex items-center gap-3 px-2">
            <div>
              <h1 className="font-outfit font-bold text-xl tracking-wide bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">
                BAIXO <span className="text-cinemaGold text-glow">CUSTO</span>
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest -mt-1 font-semibold">Exclusivo</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 text-left group ${
                    isActive
                      ? 'text-cinemaGold font-medium bg-cinemaGold/5'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                  }`}
                >
                  {/* Left Highlight Indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 top-3 bottom-3 w-[3px] bg-cinemaGold rounded-r-full"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}

                  <Icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-cinemaGold' : 'text-slate-400 group-hover:text-slate-200'}`} />
                  
                  <span className="font-outfit text-sm tracking-wide">{item.label}</span>

                  {item.badge !== undefined && (
                    <span className="ml-auto bg-cinemaGold text-obsidian text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Quick Info */}
        <div 
          onClick={() => setActiveTab('profile')}
          className="flex items-center gap-3 p-3 rounded-xl border border-obsidian-border/30 bg-cinemaCharcoal/40 hover:bg-cinemaCharcoal/70 transition-all duration-300 cursor-pointer group"
        >
          <img
            src={userAvatar}
            alt="User Avatar"
            className="w-10 h-10 rounded-xl border border-cinemaGold/30 group-hover:border-cinemaGold transition-all duration-300 object-cover"
          />
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-slate-400">Bem-vindo</span>
            <span className="text-sm font-semibold text-slate-200 truncate group-hover:text-cinemaGold transition-all duration-300">{userName}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-obsidian-card/95 border-t border-obsidian-border/50 backdrop-blur-xl z-30 px-6 flex justify-around items-center">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 transition-all duration-300 ${
                isActive ? 'text-cinemaGold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-2 -right-2 bg-cinemaGold text-obsidian text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 font-outfit font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
