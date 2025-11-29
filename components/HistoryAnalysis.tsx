import React, { useEffect, useState, useMemo } from 'react';
import { OKXService } from '../services/okxService';
import { TradeHistoryItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Download, History, Calculator, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatPrice, formatAmount, formatPct } from '../utils/formatting';

interface HistoryProps {
  service: OKXService;
  t: any;
  colorMode?: 'standard' | 'reverse';
}

const HistoryAnalysis: React.FC<HistoryProps> = ({ service, t, colorMode = 'standard' }) => {
  const [history, setHistory] = useState<TradeHistoryItem[]>([]);
  // Req #1: Starting the calendar 3 months ago for better scope
  const [calendarDate, setCalendarDate] = useState(() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 2); // Start 2 months back
      return d;
  });

  useEffect(() => {
    service.getTradeHistory().then(setHistory);
  }, [service]);

  // Fix NaN: Safe Parse Logic & Total PnL Calculation
  const totalPnl = useMemo(() => {
    return history.reduce((acc, curr) => {
        // Ensure pnl is a number, treat NaN/null as 0
        const val = parseFloat(curr.pnl);
        return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [history]);

  const winRate = useMemo(() => {
      if (history.length === 0) return 0;
      const validTrades = history.filter(h => !isNaN(parseFloat(h.pnl)));
      if (validTrades.length === 0) return 0;
      const wins = validTrades.filter(h => parseFloat(h.pnl) > 0).length;
      return (wins / validTrades.length) * 100;
  }, [history]);

  // Transform data for PnL Chart
  const pnlData = history.map(h => ({
    name: new Date(parseInt(h.ts)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
    pnl: parseFloat(h.pnl) || 0
  })).reverse();

  // --- Calendar Logic ---
  const dailyPnlMap = useMemo(() => {
    const map: Record<string, number> = {};
    history.forEach(item => {
        const date = new Date(parseInt(item.ts));
        // Key: YYYY-Month-Day to ensure correct aggregation
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; 
        const val = parseFloat(item.pnl) || 0;
        map[key] = (map[key] || 0) + val;
    });
    return map;
  }, [history]);

  const calendarDays = useMemo(() => {
      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
      
      const days = [];
      // Empty slots for days before 1st
      for (let i = 0; i < firstDay; i++) days.push(null);
      // Actual days
      for (let i = 1; i <= daysInMonth; i++) days.push(i);
      return days;
  }, [calendarDate]);

  const changeMonth = (delta: number) => {
      setCalendarDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const isReverse = colorMode === 'reverse';
  const colorUp = isReverse ? 'text-danger' : 'text-success';
  const colorDown = isReverse ? 'text-success' : 'text-danger';
  const bgUp = isReverse ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
  const bgDown = isReverse ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30';
  const bgZero = 'bg-slate-500/10 border-slate-500/10 text-slate-400'; // Req #1: Style for Zero PnL days

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-muted mb-2">
            <Calculator size={18} />
            <span className="text-sm font-medium">{t.cumulativePnl}</span>
          </div>
          <div className={`text-2xl font-bold ${totalPnl >= 0 ? colorUp : colorDown}`}>
            ${totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
          <div className="flex items-center gap-2 text-muted mb-2">
             <span className="text-sm font-medium">{t.winRate}</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">
            {winRate.toFixed(1)}%
          </div>
        </div>
        <div className="bg-surface p-6 rounded-xl border border-slate-700 shadow-lg">
           <div className="flex items-center gap-2 text-muted mb-2">
             <span className="text-sm font-medium">{t.totalTrades}</span>
          </div>
          <div className="text-2xl font-bold text-text">
            {history.length}
          </div>
        </div>
      </div>

      {/* Calendar & Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* PnL Calendar */}
          <div className="bg-surface rounded-xl border border-slate-700 p-6 shadow-lg">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold flex items-center gap-2">
                     <CalendarIcon size={18} className="text-primary"/> PnL Calendar
                 </h3>
                 <div className="flex items-center gap-4 text-sm font-medium">
                     <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-700 rounded"><ChevronLeft size={16}/></button>
                     <span>{calendarDate.toLocaleDateString(undefined, {year: 'numeric', month: 'long'})}</span>
                     <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-700 rounded"><ChevronRight size={16}/></button>
                 </div>
             </div>
             
             <div className="grid grid-cols-7 gap-2 text-center mb-2">
                 {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                     <div key={d} className="text-xs text-muted">{d}</div>
                 ))}
             </div>
             <div className="grid grid-cols-7 gap-2">
                 {calendarDays.map((day, idx) => {
                     if (!day) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                     
                     const key = `${calendarDate.getFullYear()}-${calendarDate.getMonth()}-${day}`;
                     const pnl = dailyPnlMap[key];
                     
                     return (
                         <div key={key} className={`aspect-square rounded-lg border flex flex-col items-center justify-center p-1 ${
                             pnl === undefined || pnl === 0 
                                ? bgZero // Req #1: Zero PnL style
                                : (pnl > 0 ? bgUp : bgDown)
                         }`}>
                             <span className="text-xs text-muted">{day}</span>
                             {pnl !== undefined && (
                                 <span className={`text-[10px] font-bold ${pnl > 0 ? colorUp : colorDown}`}>
                                     {pnl > 0 ? '+' : ''}{pnl.toFixed(1)}
                                 </span>
                             )}
                         </div>
                     );
                 })}
             </div>
          </div>

          {/* PnL Chart */}
          <div className="bg-surface rounded-xl border border-slate-700 p-6 shadow-lg">
            <h3 className="text-lg font-bold mb-4">{t.pnlAnalysis}</h3>
            <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} minTickGap={30} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                    cursor={{fill: '#334155', opacity: 0.2}}
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Bar dataKey="pnl" fill="#3b82f6">
                    {pnlData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? (isReverse ? '#ef4444' : '#10b981') : (isReverse ? '#10b981' : '#ef4444')} />
                    ))}
                </Bar>
                </BarChart>
            </ResponsiveContainer>
            </div>
          </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-slate-700 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2 font-semibold">
            <History size={18} />
            {t.tradeHistory}
          </div>
          <button className="text-xs text-primary flex items-center gap-1 hover:text-white">
            <Download size={14} /> Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 text-muted uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Time</th>
                <th className="px-6 py-3 text-left">Symbol</th>
                <th className="px-6 py-3 text-left">Side</th>
                <th className="px-6 py-3 text-right">Avg Price</th>
                <th className="px-6 py-3 text-right">Filled</th>
                <th className="px-6 py-3 text-right">Fee</th>
                <th className="px-6 py-3 text-right">PnL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {history.map((h) => (
                <tr key={h.fillId} className="hover:bg-slate-700/50 transition-colors">
                   <td className="px-6 py-4 text-muted">{new Date(parseInt(h.ts)).toLocaleString()}</td>
                   <td className="px-6 py-4 font-bold">{h.instId}</td>
                   <td className={`px-6 py-4 uppercase font-bold ${h.side === 'buy' ? 'text-success' : 'text-danger'}`}>{h.side}</td>
                   <td className="px-6 py-4 text-right font-mono">{h.fillPx}</td>
                   <td className="px-6 py-4 text-right font-mono">{h.fillSz}</td>
                   <td className="px-6 py-4 text-right text-muted">{h.fee}</td>
                   <td className={`px-6 py-4 text-right font-mono ${parseFloat(h.pnl) >= 0 ? 'text-success' : 'text-danger'}`}>
                     {parseFloat(h.pnl) > 0 ? '+' : ''}{h.pnl}
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoryAnalysis;
