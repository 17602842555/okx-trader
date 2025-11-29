import React, { useMemo, useState, useEffect } from 'react';
import { AssetBalance, Position, AssetHistory, TimePeriod, CurrencyUnit, Order } from '../types';
import { OKXService } from '../services/okxService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceDot, Label } from 'recharts';
import { Wallet, TrendingUp, DollarSign, ChevronDown, ChevronUp, Activity, ArrowRightLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import TradingChart from './TradingChart';
import { formatPrice, formatAmount, formatPct } from '../utils/formatting';

interface DashboardProps {
  balances: AssetBalance[];
  service: OKXService;
  t: any;
  theme: 'dark' | 'light';
  onAction?: (msg: string, type: 'success' | 'error') => void;
  refreshInterval?: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ balances, service, t, theme, onAction, refreshInterval = 10000 }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([]);
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<TimePeriod>('1M');
  const [unit, setUnit] = useState<CurrencyUnit>('USD');
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  useEffect(() => {
    service.getPositions().then(setPositions);
  }, [service, balances]); 

  useEffect(() => {
    service.getAssetHistory(period).then(setAssetHistory);
  }, [service, period, balances]);

  useEffect(() => {
    if (!expandedPosition) {
        setExpandedOrders([]);
        return;
    }

    let isMounted = true;
    const fetchOrders = async () => {
        try {
            const ords = await service.getOpenOrders(expandedPosition);
            if (isMounted) setExpandedOrders(ords);
        } catch (e) {
            console.error("Failed to fetch orders for dashboard chart", e);
        }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); 

    return () => {
        isMounted = false;
        clearInterval(interval);
    };
  }, [expandedPosition, service]);

  // --- Currency & Rate Logic ---
  const rate = useMemo(() => service.exchangeRates[unit] || 1, [unit, service.exchangeRates]);
  
  const currencySymbol = useMemo(() => {
      switch(unit) {
          case 'CNY': return '¥';
          case 'BTC': return '₿';
          default: return '$';
      }
  }, [unit]);

  // --- Data Processing for Chart & Stats ---
  // FIX: Implement 10-minute sampling interval while keeping the last point real-time
  const processedHistory = useMemo(() => {
      if (assetHistory.length === 0) return [];

      // 1. Map to standard format and sort by time
      const raw = assetHistory.map(item => ({
          ...item,
          tsNum: parseInt(item.ts), 
          val: parseFloat(item.totalEq) * rate
      })).sort((a, b) => a.tsNum - b.tsNum);

      // 2. Filter logic
      const interval = 10 * 60 * 1000; // 10 minutes in ms
      const filtered = [];
      let lastTs = 0;

      raw.forEach((item, index) => {
          const isLast = index === raw.length - 1;
          
          // Always include the first point
          if (index === 0) {
              filtered.push(item);
              lastTs = item.tsNum;
              return;
          }

          // Always include the last point (Real-time status)
          if (isLast) {
              // Avoid duplicates if the last point is too close to the last sampled point
              // but strictly speaking, user wants the last point.
              if (item.tsNum > lastTs) {
                  filtered.push(item);
              }
              return;
          }

          // Sample intermediate points every 10 minutes
          if (item.tsNum - lastTs >= interval) {
              filtered.push(item);
              lastTs = item.tsNum;
          }
      });

      return filtered;
  }, [assetHistory, rate]);

  const { minPoint, maxPoint, periodPnL, periodPnLPct } = useMemo(() => {
      if (processedHistory.length < 2) return { 
          minPoint: null, maxPoint: null, periodPnL: 0, periodPnLPct: 0 
      };
      
      let min = processedHistory[0];
      let max = processedHistory[0];
      
      processedHistory.forEach(h => {
          if (h.val < min.val) min = h;
          if (h.val > max.val) max = h;
      });

      const start = processedHistory[0].val;
      const end = processedHistory[processedHistory.length - 1].val;
      const change = end - start;
      const pct = start === 0 ? 0 : (change / start) * 100;

      return { 
          minPoint: min, 
          maxPoint: max, 
          periodPnL: change, 
          periodPnLPct: pct,
      };
  }, [processedHistory]);

  // Dynamic Color based on Trend
  const isTrendUp = periodPnL >= 0;
  const trendColor = isTrendUp ? '#10b981' : '#ef4444';

  const totalBalanceUsd = useMemo(() => {
    return balances.reduce((acc, curr) => acc + parseFloat(curr.eqUsd), 0);
  }, [balances]);

  const displayBalance = useMemo(() => {
     return totalBalanceUsd * rate;
  }, [totalBalanceUsd, rate]);

  const chartData = useMemo(() => {
    return balances
      .filter(b => parseFloat(b.eqUsd) > 10)
      .map(b => ({
        name: b.ccy,
        value: parseFloat(b.eqUsd) * rate
      }))
      .sort((a, b) => b.value - a.value);
  }, [balances, rate]);

  const handleCancelOrder = async (order: Order) => {
    try {
        await service.cancelOrder(order.instId, order.ordId, order.algoId);
        onAction?.(t.orderCancelled, 'success');
        setExpandedOrders(prev => prev.filter(o => (o.ordId !== order.ordId && o.algoId !== order.algoId)));
    } catch (e: any) {
        onAction?.(e.message || t.cancelFailed, 'error');
    }
  };

  const handleModifyOrder = async (order: Order, newPx: string) => {
    if (!newPx) {
         onAction?.(t.invalidPrice, 'error');
         return;
    }
    try {
        const req: any = { 
            instId: order.instId,
            ordId: order.ordId,
            algoId: order.algoId
        };
        if (order.algoId) delete req.ordId;

        if (order.ordType === 'sl') {
            req.newSlTriggerPx = newPx;
        } else if (order.ordType === 'tp') {
            req.newTpTriggerPx = newPx;
        } else if (order.ordType === 'conditional' || order.ordType === 'trigger') {
            req.newTriggerPx = newPx;
        } else if (order.ordType === 'limit') {
            req.newPx = newPx;
        } else {
            if (order.triggerPx) req.newTriggerPx = newPx;
            else req.newPx = newPx;
        }

        const hasChanges = Object.keys(req).some(k => k.startsWith('new') && !!req[k]);
        if (!hasChanges) {
               return;
        }

        await service.amendOrder(req);
        onAction?.(`${t.orderModified} ${newPx}`, 'success'); 
    } catch (e: any) {
         onAction?.(e.message || t.modifyFailed, 'error');
    }
  };

  const handleAddAlgo = async (type: 'sl' | 'tp', priceVal: string) => {
      const pos = positions.find(p => p.instId === expandedPosition);
      if (!pos) return;

      try {
        const isSwap = pos.instId.includes('SWAP');
        const closeSide = pos.posSide === 'long' ? 'sell' : (pos.posSide === 'short' ? 'buy' : (parseFloat(pos.pos) > 0 ? 'sell' : 'buy'));
        
        await service.placeOrder({
            instId: pos.instId,
            tdMode: isSwap ? pos.mgnMode : 'cash',
            side: closeSide,
            posSide: isSwap ? pos.posSide : undefined,
            ordType: 'conditional',
            triggerPx: priceVal,
            px: '-1',
            sz: pos.pos 
        });
        
        onAction?.(`${t.addedAlgo} ${type.toUpperCase()} @ ${priceVal}`, 'success');
      } catch(e:any) {
          onAction?.(e.message, 'error');
      }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      
      {/* Unified Overview Card */}
      <div className="bg-surface rounded-xl border border-border shadow-lg transition-colors overflow-hidden flex flex-col
            landscape:h-[95vh] landscape:min-h-[350px] 
            portrait:min-h-auto
      ">
        
        {/* Top Stats Section */}
        <div className="p-6 pb-2 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-border/50">
            
            {/* 1. Total Assets */}
            <div className="flex flex-col justify-center relative">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2 text-muted">
                        <Wallet size={18} />
                        <span className="text-sm font-medium">{t.totalAssets}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setHideBalance(!hideBalance)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-muted"
                        >
                            {hideBalance ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button 
                            onClick={() => setIsUnitOpen(!isUnitOpen)}
                            className="flex items-center gap-1 text-[10px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors font-bold"
                        >
                            {unit} <ArrowRightLeft size={10}/>
                        </button>
                         {isUnitOpen && (
                            <div className="absolute right-0 top-8 mt-1 w-20 bg-surface border border-border rounded shadow-xl z-50">
                                {(['USD', 'CNY', 'BTC'] as CurrencyUnit[]).map(u => (
                                    <button 
                                        key={u}
                                        onClick={() => { setUnit(u); setIsUnitOpen(false); }}
                                        className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                                    >
                                        {u}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="text-2xl md:text-3xl font-bold text-text tracking-tight">
                    {hideBalance ? '******' : (
                        <>
                        {currencySymbol}
                        {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: unit === 'BTC' ? 6 : 2 })}
                        </>
                    )}
                </div>
                <div className={`mt-1 text-xs flex items-center font-medium ${periodPnLPct >= 0 ? 'text-success' : 'text-danger'}`}>
                    <TrendingUp size={14} className="mr-1" /> {formatPct(periodPnLPct)} ({period})
                </div>
            </div>

            {/* 2. Period PnL */}
            <div className="flex flex-col justify-center pt-4 md:pt-0 md:border-l md:border-border md:pl-6">
                 <div className="flex items-center space-x-2 text-muted mb-1">
                    <DollarSign size={18} />
                    <span className="text-sm font-medium">
                        {period === '1D' ? '今日盈亏' : `${period} 盈亏`}
                    </span>
                 </div>
                 <div className={`text-2xl font-bold tracking-tight ${periodPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                    {hideBalance ? '******' : (
                        <>
                        {periodPnL > 0 ? '+' : ''}{currencySymbol}{formatAmount(periodPnL)}
                        </>
                    )}
                 </div>
                 <div className="text-xs text-muted mt-1">
                    {period === '1D' ? '包含今日已实现 & 未实现盈亏' : `${period} 内资产净值变化`}
                 </div>
            </div>

            {/* 3. Account Status */}
            <div className="flex flex-col justify-center pt-4 md:pt-0 md:border-l md:border-border md:pl-6">
                <div className="flex items-center space-x-2 text-muted mb-1">
                    <ShieldCheck size={18} />
                    <span className="text-sm font-medium">{t.accountStatus}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1 bg-success/10 text-success rounded-full text-xs font-bold uppercase tracking-wide border border-success/20">
                        安全
                    </div>
                    <span className="text-xs text-muted">保证金风险: 低</span>
                </div>
            </div>
        </div>

        {/* Bottom Chart Section */}
        <div className="flex-1 p-6 flex flex-col min-h-0">
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-sm md:text-base flex items-center gap-2 text-muted">
                    <Activity size={16}/> 
                    {t.assetTrend}
                </h3>
                <div className="flex bg-slate-100 dark:bg-slate-900/50 p-0.5 rounded-lg border border-border">
                    {(['1D', '1W', '1M', '3M'] as TimePeriod[]).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                period === p 
                                ? 'bg-surface text-primary shadow-sm border border-border' 
                                : 'text-muted hover:text-text'
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 w-full min-h-[180px]">
                 {processedHistory.length < 2 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted text-sm border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                        <p>暂无历史数据</p>
                        <p className="text-[10px] mt-1 text-muted">请保持应用开启以积累数据</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={processedHistory}>
                            <defs>
                                <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={trendColor} stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor={trendColor} stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#334155" : "#e2e8f0"} vertical={false} />
                            <XAxis 
                                dataKey="tsNum" 
                                type="number"
                                domain={['dataMin', 'dataMax']}
                                tickFormatter={(ts) => {
                                    const date = new Date(ts);
                                    return period === '1D' ? date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : date.toLocaleDateString(undefined, {month:'numeric', day:'numeric'});
                                }}
                                stroke="#94a3b8"
                                fontSize={10}
                                minTickGap={40}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis 
                                stroke="#94a3b8"
                                fontSize={10}
                                domain={['auto', 'auto']}
                                tickFormatter={(val) => hideBalance ? '***' : `${currencySymbol}${val >= 1000 ? (val/1000).toFixed(1) + 'k' : val.toFixed(0)}`}
                                tickLine={false}
                                axisLine={false}
                                width={35}
                            />
                            <RechartsTooltip 
                                contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: '#334155', color: theme === 'dark' ? '#f1f5f9' : '#0f172a', fontSize: '12px' }}
                                labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                formatter={(value: number) => [hideBalance ? '******' : `${currencySymbol}${formatAmount(value)}`, '总权益']}
                            />
                            <Area type="linear" dataKey="totalEq" stroke={trendColor} strokeWidth={2} fillOpacity={1} fill="url(#colorEq)" />
                            
                            {/* Max Point Marker */}
                            {maxPoint && (
                                <ReferenceDot x={maxPoint.tsNum} y={maxPoint.val} r={4} fill="#10b981" stroke={theme==='dark'?'#1e293b':'#fff'} strokeWidth={2} isFront={true}>
                                    <Label value={hideBalance ? '***' : formatAmount(maxPoint.val)} position="top" offset={10} fill="#10b981" fontSize={10} fontWeight="bold" />
                                </ReferenceDot>
                            )}
                            
                            {/* Min Point Marker */}
                            {minPoint && (
                                <ReferenceDot x={minPoint.tsNum} y={minPoint.val} r={4} fill="#ef4444" stroke={theme==='dark'?'#1e293b':'#fff'} strokeWidth={2} isFront={true}>
                                    <Label value={hideBalance ? '***' : formatAmount(minPoint.val)} position="bottom" offset={10} fill="#ef4444" fontSize={10} fontWeight="bold" />
                                </ReferenceDot>
                            )}
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
      </div>

      {/* Positions Section */}
      <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden transition-colors">
        <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-lg">{t.positions}</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted text-xs uppercase">
                    <tr>
                        <th className="px-6 py-3 whitespace-nowrap">{t.symbol}</th>
                        <th className="px-6 py-3 whitespace-nowrap">Side</th>
                        <th className="px-6 py-3 whitespace-nowrap">{t.size}</th>
                        <th className="px-6 py-3 text-right whitespace-nowrap">{t.entryPrice}</th>
                        <th className="px-6 py-3 text-right whitespace-nowrap">{t.pnl}</th>
                        <th className="px-6 py-3 text-right whitespace-nowrap">{t.action}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {positions.length === 0 ? (
                        <tr><td colSpan={6} className="p-6 text-center text-muted">暂无持仓</td></tr>
                    ) : positions.map((pos) => {
                        let sizeDisplay = '';
                        let suffix = '';
                        
                        if (pos.instId.includes('SWAP') && pos.ctVal) {
                             sizeDisplay = `${(parseFloat(pos.pos) * parseFloat(pos.ctVal)).toFixed(4)}`;
                             suffix = pos.instId.split('-')[0]; // e.g. BTC
                        } else {
                             sizeDisplay = formatAmount(pos.pos);
                             suffix = pos.ccy;
                        }

                        return (
                        <React.Fragment key={pos.instId}>
                            <tr className="hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-medium flex items-center gap-2 whitespace-nowrap">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pos.instId.includes('SWAP') ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {pos.instId.includes('SWAP') ? t.contract : t.spot}
                                    </span>
                                    {pos.instId}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`uppercase font-bold text-xs px-2 py-1 rounded ${pos.posSide === 'short' ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'}`}>
                                        {pos.posSide}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono whitespace-nowrap">{sizeDisplay} <span className="text-muted text-xs">{suffix}</span></td>
                                <td className="px-6 py-4 text-right font-mono whitespace-nowrap">{formatPrice(pos.avgPx)}</td>
                                <td className={`px-6 py-4 text-right font-mono font-bold whitespace-nowrap ${parseFloat(pos.upl) >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {hideBalance ? '****' : (
                                        <>
                                        {parseFloat(pos.upl) > 0 ? '+' : ''}{formatPrice(pos.upl)}
                                        </>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => setExpandedPosition(expandedPosition === pos.instId ? null : pos.instId)}
                                        className="text-primary hover:text-blue-400 flex items-center justify-end gap-1 ml-auto text-xs bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded"
                                    >
                                        {t.viewChart} {expandedPosition === pos.instId ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                    </button>
                                </td>
                            </tr>
                            {expandedPosition === pos.instId && (
                                <tr>
                                    <td colSpan={6} className="p-4 bg-slate-50 dark:bg-slate-900/50 h-[450px]">
                                        <div className="w-full h-full rounded-lg overflow-hidden border border-border bg-surface">
                                            <TradingChart 
                                                instId={pos.instId} 
                                                theme={theme} 
                                                service={service} 
                                                position={pos}
                                                orders={expandedOrders}
                                                onCancelOrder={handleCancelOrder}
                                                onModifyOrder={handleModifyOrder}
                                                onAddAlgo={handleAddAlgo}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    )})}
                </tbody>
            </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asset List */}
        <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden transition-colors">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold text-lg">{t.myAssets}</h3>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted text-xs uppercase sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap">{t.symbol}</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">{t.balance}</th>
                  <th className="px-6 py-3 text-right whitespace-nowrap">{t.value} ({unit})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balances.map((asset) => (
                  <tr key={asset.ccy} className="hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-muted border border-border">
                        {asset.ccy[0]}
                      </div>
                      {asset.ccy}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm">
                      {hideBalance ? '****' : formatAmount(asset.availBal)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-sm">
                      {hideBalance ? '****' : `${currencySymbol}${formatAmount(parseFloat(asset.eqUsd) * rate)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Portfolio Pie Chart */}
        <div className="bg-surface rounded-xl border border-border shadow-lg p-6 flex flex-col transition-colors">
          <h3 className="font-semibold text-lg mb-4">{t.allocation}</h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: '#334155', borderRadius: '8px', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}
                  itemStyle={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}
                  formatter={(value: number) => hideBalance ? '******' : value.toFixed(2)}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
