import React, { useState, useEffect, useCallback } from 'react';
import { ApiConfig, ViewMode, AssetBalance, ToastMessage } from './types';
import { OKXService } from './services/okxService';
import Dashboard from './components/Dashboard';
import TradeInterface from './components/TradeInterface';
import HistoryAnalysis from './components/HistoryAnalysis';
import Settings from './components/Settings';
import { translations } from './utils/locales';
import { LayoutDashboard, CandlestickChart, Settings as SettingsIcon, AlertCircle, X, History as HistoryIcon, Moon, Sun, Languages, Link, Menu, ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_CONFIG: ApiConfig = {
  apiKey: '',
  secretKey: '',
  passphrase: '',
  language: 'en',
  theme: 'dark',
  refreshInterval: 10000,
  colorMode: 'standard',
  alerts: []
};

const App: React.FC = () => {
  const [config, setConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem('okx_config');
    const parsed = saved ? JSON.parse(saved) : DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...parsed };
  });
  
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [service, setService] = useState<OKXService>(new OKXService(config));
  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1, CNY: 7.2, BTC: 0.000015 });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const t = translations[config.language] || translations.en;

  useEffect(() => {
    setService(new OKXService(config));
    localStorage.setItem('okx_config', JSON.stringify(config));
    
    const root = document.documentElement;
    if (config.theme === 'light') {
        root.classList.remove('dark');
    } else {
        root.classList.add('dark');
    }
  }, [config]);

  useEffect(() => {
      if (config.githubToken) {
          service.syncHistoryWithGitHub()
              .then(() => {
                  addToast(t.syncSuccess, 'success');
                  refreshData();
              })
              .catch(e => {
                  console.warn("Startup sync failed", e);
              });
      }
  }, [service]);

  const addToast = (text: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const checkAlerts = (currentBalances: AssetBalance[]) => {
    if (!config.alerts || config.alerts.length === 0) return;

    config.alerts.forEach(alert => {
        const asset = currentBalances.find(b => b.ccy === alert.ccy);
        if (asset) {
            const bal = parseFloat(asset.availBal);
            const min = parseFloat(alert.min);
            const max = parseFloat(alert.max);
            if (bal < min) {
                addToast(`Alert: ${alert.ccy} balance (${bal}) is below minimum (${min})!`, 'error');
            } else if (bal > max) {
                 addToast(`Alert: ${alert.ccy} balance (${bal}) is above maximum (${max})!`, 'info');
            }
        }
    });
  };

  const refreshData = useCallback(async () => {
    try {
      const data = await service.getBalances();
      setBalances(data);
      checkAlerts(data);
      const newRates = await service.fetchExchangeRates();
      setRates(newRates);
    } catch (error) {}
  }, [service]);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, config.refreshInterval || 10000); 
    return () => clearInterval(interval);
  }, [refreshData, config.refreshInterval]);

  const toggleTheme = () => {
      setConfig(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  };

  const toggleLang = () => {
      setConfig(prev => ({ ...prev, language: prev.language === 'en' ? 'zh' : 'en' }));
  };

  const NavButton = ({ mode, icon: Icon, label }: { mode: ViewMode, icon: any, label: string }) => (
    <button
      onClick={() => {
          setCurrentView(mode);
          setIsMobileMenuOpen(false);
      }}
      className={`flex items-center p-3 rounded-xl transition-all w-full mb-1
        ${currentView === mode 
          ? 'bg-primary text-white shadow-lg shadow-blue-500/25' 
          : 'text-muted hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-text'}
        ${!isSidebarOpen ? 'justify-center' : 'justify-start gap-3'}
      `}
      title={label}
    >
      <Icon size={24} strokeWidth={currentView === mode ? 2.5 : 2} />
      <span className={`font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ${!isSidebarOpen ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          {label}
      </span>
    </button>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <div className="p-4 md:p-0 flex-1">
            <Dashboard balances={balances} service={service} t={t} theme={config.theme} onAction={addToast} refreshInterval={config.refreshInterval} />
          </div>
        );
      case 'trade':
        return (
          <div className="h-full">
            <TradeInterface service={service} onPlaceOrder={addToast} t={t} theme={config.theme} refreshInterval={config.refreshInterval} colorMode={config.colorMode} />
          </div>
        );
      case 'history':
        return (
          <div className="p-4 md:p-0 flex-1">
            {/* Updated: Passing colorMode to HistoryAnalysis */}
            <HistoryAnalysis service={service} t={t} colorMode={config.colorMode} />
          </div>
        );
      case 'settings':
        return (
          <div className="p-4 md:p-0 flex-1">
            <Settings 
              config={config} 
              onSave={(newConfig) => {
                setConfig(newConfig);
                addToast(t.save, 'success');
              }} 
              t={t} 
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col md:flex-row h-screen-safe overflow-hidden transition-colors duration-300 pt-safe pb-safe ${config.theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-background text-text'}`}>
      
      <div className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-slate-700 z-30 shrink-0">
          <div className="flex items-center gap-2 font-bold text-lg">
             <div className="w-8 h-8 bg-gradient-to-tr from-primary to-blue-400 rounded-lg flex items-center justify-center text-white">O</div>
             TraderPro
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-text">
              {isMobileMenuOpen ? <X size={24}/> : <Menu size={24}/>}
          </button>
      </div>

      <aside 
        className={`
            fixed md:relative z-20 shrink-0 flex flex-col h-full
            transition-all duration-300 ease-in-out border-r
            ${config.theme === 'light' ? 'bg-white border-slate-200' : 'bg-surface border-slate-700'}
            ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'} 
            ${isSidebarOpen ? 'md:w-64' : 'md:w-20'}
            pb-safe md:pb-0
        `}
      >
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className={`flex items-center gap-3 px-4 py-6 mb-2 ${!isSidebarOpen ? 'justify-center' : ''}`}>
                <div className="w-10 h-10 min-w-[2.5rem] bg-gradient-to-tr from-primary to-blue-400 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-lg shrink-0">
                    O
                </div>
                <h1 className={`text-xl font-bold tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300 ${!isSidebarOpen ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                    Trader<span className="text-primary">Pro</span>
                </h1>
            </div>

            <nav className="flex flex-col px-4 flex-1">
                <NavButton mode="dashboard" icon={LayoutDashboard} label={t.dashboard} />
                <NavButton mode="trade" icon={CandlestickChart} label={t.trade} />
                <NavButton mode="history" icon={HistoryIcon} label={t.history} />
                <NavButton mode="settings" icon={SettingsIcon} label={t.settings} />
            </nav>

            <div className="p-4 mt-auto space-y-3">
                <div className={`flex gap-2 ${!isSidebarOpen ? 'flex-col' : ''}`}>
                    <button 
                        onClick={toggleTheme}
                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-colors ${config.theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                        title="Toggle Theme"
                    >
                        {config.theme === 'dark' ? <Moon size={16}/> : <Sun size={16}/>}
                        {isSidebarOpen && (config.theme === 'dark' ? 'Dark' : 'Light')}
                    </button>
                    <button 
                        onClick={toggleLang}
                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-medium transition-colors ${config.theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}`}
                        title="Switch Language"
                    >
                        <Languages size={16}/>
                        {isSidebarOpen && config.language.toUpperCase()}
                    </button>
                </div>

                <div className={`p-3 rounded-xl border text-xs text-muted flex items-center ${config.theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-700'} ${!isSidebarOpen ? 'justify-center' : 'gap-2'}`}>
                    <Link size={14} className="shrink-0 text-success" />
                    {isSidebarOpen && (
                         <span className="font-semibold text-success truncate">Connected API</span>
                    )}
                </div>
            </div>
        </div>

        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`hidden md:flex absolute -right-3 top-20 bg-primary text-white p-1 rounded-full shadow-lg border border-surface hover:scale-110 transition-transform z-50`}
        >
            {isSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-transparent relative">
        <div className="flex-1 overflow-y-auto p-0 md:p-6 custom-scrollbar">
            <div className="max-w-[1600px] mx-auto h-full flex flex-col">
              {renderContent()}
            </div>
        </div>
      </main>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none pb-safe pr-4">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`pointer-events-auto min-w-[280px] p-4 rounded-lg shadow-2xl flex items-center justify-between border-l-4 animate-slideIn ${
              toast.type === 'success' ? 'bg-surface border-success text-white' : 
              toast.type === 'error' ? 'bg-surface border-danger text-white' : 
              'bg-surface border-blue-500 text-white'
            }`}
            style={{ backgroundColor: config.theme === 'light' ? '#1e293b' : undefined }}
          >
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className={
                toast.type === 'success' ? 'text-success' : 
                toast.type === 'error' ? 'text-danger' : 'text-blue-500'
              } />
              <span className="text-sm font-medium text-white">{toast.text}</span>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="text-slate-400 hover:text-white">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      
      {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
      )}

    </div>
  );
};

export default App;
