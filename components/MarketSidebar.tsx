import React, { useState, useEffect, useMemo } from 'react';
import { Search, Star, TrendingUp, TrendingDown } from 'lucide-react';
import { OKXService } from '../services/okxService';
import { Instrument } from '../types';

interface MarketSidebarProps {
  onSelect: (instId: string) => void;
  selectedInstId: string;
  service: OKXService;
  isOpen: boolean;
  onClose: () => void;
}

const MarketSidebar: React.FC<MarketSidebarProps> = ({ onSelect, selectedInstId, service, isOpen, onClose }) => {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'USDT' | 'USDC' | 'Favorites'>('USDT');
  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('okx_favorites');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    let mounted = true;
    
    const fetchMarketData = async () => {
      try {
        // Fetch Spot instruments (Change 'SPOT' to 'SWAP' if you want perps)
        const data = await service.getInstruments('SPOT');
        
        if (mounted) {
          // 核心修复：使用 Map 根据 instId 强制去重
          const uniqueMap = new Map();
          data.forEach(item => {
              if (!uniqueMap.has(item.instId)) {
                  uniqueMap.set(item.instId, item);
              }
          });
          // 将 Map 转回数组
          setInstruments(Array.from(uniqueMap.values()));
        }
      } catch (error) {
        console.error("Failed to fetch instruments", error);
      }
    };

    fetchMarketData();
    return () => { mounted = false; };
  }, [service]);

  const toggleFavorite = (e: React.MouseEvent, instId: string) => {
    e.stopPropagation();
    const newFavs = favorites.includes(instId)
      ? favorites.filter(id => id !== instId)
      : [...favorites, instId];
    
    setFavorites(newFavs);
    localStorage.setItem('okx_favorites', JSON.stringify(newFavs));
  };

  const filteredInstruments = useMemo(() => {
    return instruments.filter(inst => {
      const matchesSearch = inst.instId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesQuote = filter === 'Favorites' 
        ? favorites.includes(inst.instId)
        : inst.quoteCcy === filter;
      
      return matchesSearch && matchesQuote;
    }).slice(0, 50); // Performance: Limit rendering to top 50 matches
  }, [instruments, searchQuery, filter, favorites]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-80 bg-surface border-r border-border shadow-2xl z-50 flex flex-col animate-slideIn">
      {/* Header & Search */}
      <div className="p-4 border-b border-border">
        <h2 className="font-bold text-lg mb-4">Market</h2>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {(['USDT', 'USDC', 'Favorites'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                filter === f 
                  ? 'bg-primary text-white' 
                  : 'bg-slate-100 dark:bg-slate-800 text-muted hover:text-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input 
            type="text" 
            placeholder="Search coin..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredInstruments.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">
                No instruments found.
            </div>
        ) : (
            filteredInstruments.map((inst) => (
            <div 
                key={inst.instId}
                onClick={() => {
                    onSelect(inst.instId);
                    if (window.innerWidth < 768) onClose(); // Close on mobile select
                }}
                className={`flex items-center justify-between p-3 px-4 cursor-pointer transition-colors border-b border-border/50 ${
                selectedInstId === inst.instId 
                    ? 'bg-primary/10 border-l-4 border-l-primary' 
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-l-transparent'
                }`}
            >
                <div className="flex flex-col">
                    <span className="font-bold text-sm text-text">{inst.baseCcy}</span>
                    <span className="text-xs text-muted">/{inst.quoteCcy}</span>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Mock Change - normally this comes from a separate ticker API */}
                    <span className={`text-xs font-medium ${Math.random() > 0.5 ? 'text-success' : 'text-danger'}`}>
                        {Math.random() > 0.5 ? '+' : '-'}{(Math.random() * 5).toFixed(2)}%
                    </span>
                    
                    <button 
                        onClick={(e) => toggleFavorite(e, inst.instId)}
                        className={`p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${
                            favorites.includes(inst.instId) ? 'text-yellow-400' : 'text-slate-300'
                        }`}
                    >
                        <Star size={14} fill={favorites.includes(inst.instId) ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>
            ))
        )}
      </div>
      
      {/* Footer / Overlay for mobile */}
      <div className="p-3 border-t border-border text-center text-xs text-muted md:hidden">
          Tap to select a pair
      </div>
    </div>
  );
};

export default MarketSidebar;
