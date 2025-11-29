import React, { useMemo, useState, useEffect } from 'react';
import { AssetBalance, Position, AssetHistory, TimePeriod, CurrencyUnit, Order } from '../types';
import { OKXService } from '../services/okxService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Wallet, TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronUp, Activity, ArrowRightLeft, Eye, EyeOff } from 'lucide-react';
import TradingChart from './TradingChart';
import { formatPrice, formatAmount, formatPct } from '../utils/formatting';

interface DashboardProps {
  balances: AssetBalance[];
  service: OKXService;
  t: any;
  theme: 'dark' | 'light';
  colorMode?: 'standard' | 'reverse';
  onAction?: (msg: string, type: 'success' | 'error') => void;
  refreshInterval?: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ balances, service, t, theme, colorMode = 'standard', onAction, refreshInterval = 10000 }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistory[]>([]);
  const [expandedPosition, setExpandedPosition] = useState<string | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Order[]>([]);
  const [period, setPeriod] = useState<TimePeriod>('1M');
  const [unit, setUnit] = useState<CurrencyUnit>('USD');
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  // 1. 仓位更新
  useEffect(() => {
    service.getPositions().then(setPositions);
  }, [service, balances]);

  // 2. 资产趋势图更新 (恢复为依赖 balances，确保图表实时跳动)
  useEffect(() => {
    service.getAssetHistory(period).then(setAssetHistory);
  }, [service, period, balances]); 

  // Fetch orders for the expanded position
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

  const totalBalanceUsd = useMemo(() => {
    return balances.reduce((acc, curr) => acc + parseFloat(curr.eqUsd), 0);
  }, [balances]);

  const displayBalance = useMemo(() => {
     return totalBalanceUsd * service.exchangeRates[unit];
  }, [totalBalanceUsd, unit, service.exchangeRates]);

  // 计算涨跌幅
  const percentageChange = useMemo(() => {
      if (assetHistory.length < 2) return 0;
      const startEq = assetHistory[0].totalEq;
      if (startEq === 0) return 0;
      const currentEq = assetHistory[assetHistory.length - 1].totalEq;
      return ((currentEq - startEq) / startEq) * 100;
  }, [assetHistory]);

  // 计算绝对盈亏
  const periodPnl = useMemo(() => {
      if (assetHistory.length < 2) return 0;
      const startEq = assetHistory[0].totalEq;
      const currentEq = assetHistory[assetHistory.length - 1].totalEq;
      return (currentEq - startEq) * service.exchangeRates[unit];
  }, [assetHistory, unit, service.exchangeRates]);

  // 确定图表颜色
  const chartColor = useMemo(() => {
      const isProfit = percentageChange >= 0;
      if (colorMode === 'reverse') {
          return isProfit ? '#ef4444' : '#10b981';
      }
      return isProfit ? '#10b981' : '#ef4444';
  }, [percentageChange, colorMode]);

  const chartData = useMemo(() => {
    return balances
      .filter(b => parseFloat(b.eqUsd) > 10)
      .map(b => ({
        name: b.ccy,
        value: parseFloat(b.eqUsd)
      }))
      .sort((a, b) => b.value - a.value);
  }, [balances]);

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
      
      {/* Merged Asset Overview Card */}
      <div className="bg-surface rounded-xl border border-border shadow-lg transition-colors overflow-hidden relative">
        <div className="p-6 pb-0 flex items-center justify-between">
            <div className="flex items-center space-x-3 text-muted">
                <Wallet size={20} />
                <span className="text-sm font-medium">{t.totalAssets}</span>
            </div>
            
            <div className="flex items-center gap-2 relative z-10">
                <button 
                    onClick={() => setHideBalance(!hideBalance)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-muted transition-colors"
                >
                    {hideBalance ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
                
                <button 
                    onClick={() => setIsUnitOpen(!isUnitOpen)}
                    className="flex items-center gap-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    {unit} <ArrowRightLeft size={12}/>
                </button>
                
                {isUnitOpen && (
                    <div className="absolute right-0 top-full mt-2 w-24 bg-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden py-1">
                        {(['USD', 'CNY', 'BTC'] as CurrencyUnit[]).map(u => (
                            <button 
                                key={u}
                                onClick={() => {
                                    setUnit(u);
                                    setIsUnitOpen(false);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                            >
                                {u}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <div className="text-4xl font-bold text-text tracking-tight mb-2">
                    {hideBalance ? '******' : (
                        <>
                        {unit === 'USD' && '$'}
                        {unit === 'CNY' && '¥'}
                        {unit === 'BTC' && '₿'}
                        {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: unit === 'BTC' ? 6 : 2 })}
                        </>
                    )}
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                   {unit !== 'USD' && (
                        <div className="text-muted text-xs">
                            1 USD ≈ {service.exchangeRates[unit]} {unit}
                        </div>
                    )}
                    <div className="inline-flex items-center px-2 py-0.5 bg-success/10 text-success rounded-full text-[10px] font-bold border border-success/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-success mr-1.5 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></div>
                        ACTIVE
                     </div>
                </div>
            </div>

            <div className="flex items-center gap-8 md:border-l border-border md:pl-8">
                <div className="flex-1">
                    <div className="flex items-center gap-1.5 text-muted text-xs font-medium mb-1">
                        <DollarSign size={14} />
                        {period} PnL
                    </div>
                    <div className={`text-xl font-bold tracking-tight ${periodPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                        {hideBalance ? '****' : (
                            <span className="flex items-center gap-1">
                                {periodPnl > 0 ? '+' : ''}{periodPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {unit !== 'BTC' && unit}
                            </span>
                        )}
                    </div>
                    <div className={`text-xs flex items-center mt-1 ${percentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
                        {percentageChange >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                        {formatPct(percentageChange)}
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Asset Trend Chart */}
      <div className="bg-surface rounded-xl border border-border shadow-lg p-6 transition-colors">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
                <Activity size={18} className="text-primary"/> 
                {t.assetTrend}
            </h3>
            <div className="flex bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg border border-border">
                {(['1D', '1W', '1M', '3M'] as TimePeriod[]).map((p) => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all duration-200 ${
                            period === p 
                            ? 'bg-surface text-primary shadow-sm border border-border/50 font-bold' 
                            : 'text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                    >
                        {p}
                    </button>
                ))}
            </div>
        </div>
        
        <div className="h-[250px] w-full">
            {assetHistory.length < 2 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted text-sm border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                    <p>Not enough history data collected yet.</p>
                    <p>Keep the app open to record asset trends.</p>
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={assetHistory}>
                        <defs>
                            <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={chartColor} stopOpacity={0.2}/>
                                <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? "#334155" : "#e2e8f0"} opacity={0.3} />
                        <XAxis 
                            dataKey="ts" 
                            tickFormatter={(ts) => {
                                const date = new Date(parseInt(ts));
                                return period === '1D' 
                                    ? date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) 
                                    : `${date.getMonth()+1}/${date.getDate()}`;
                            }}
                            stroke="#94a3b8"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={40}
                        />
                        <YAxis hide={true} domain={['auto', 'auto']} />
                        <RechartsTooltip 
                            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                            contentStyle={{ 
                                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', 
                                borderColor: '#334155', 
                                color: theme === 'dark' ? '#f1f5f9' : '#0f172a',
                                borderRadius: '8px',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                            labelFormatter={(ts) => new Date(parseInt(ts)).toLocaleString()}
                            formatter={(value: number) => [
                                hideBalance ? '******' : `$${value.toLocaleString()}`, 
                                'Equity'
                            ]}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="totalEq" 
                            stroke={chartColor} 
                            strokeWidth={2} 
                            fillOpacity={1} 
                            fill="url(#colorEq)" 
                            animationDuration={1000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden transition-colors">
        <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-lg">{t.positions}</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted text-xs uppercase">
                    <tr>
                        <th className="px-6 py-3">{t.symbol}</th>
                        <th className="px-6 py-3">Side</th>
                        <th className="px-6 py-3">{t.size}</th>
                        <th className="px-6 py-3 text-right">{t.entryPrice}</th>
                        <th className="px-6 py-3 text-right">{t.pnl}</th>
                        <th className="px-6 py-3 text-right">{t.action}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {positions.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-muted">No open positions</td></tr>
                    ) : positions.map((pos) => {
                        let sizeDisplay = '';
                        let suffix = '';
                        
                        if (pos.instId.includes('SWAP') && pos.ctVal) {
                             sizeDisplay = `${(parseFloat(pos.pos) * parseFloat(pos.ctVal)).toFixed(4)}`;
                             suffix = pos.instId.split('-')[0];
                        } else {
                             sizeDisplay = formatAmount(pos.pos);
                             suffix = pos.ccy;
                        }

                        return (
                        <React.Fragment key={pos.instId}>
                            <tr className="hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-medium flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pos.instId.includes('SWAP') ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                        {pos.instId.includes('SWAP') ? t.contract : t.spot}
                                    </span>
                                    {pos.instId}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`uppercase font-bold text-xs px-2 py-1 rounded ${pos.posSide === 'short' ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'}`}>
                                        {pos.posSide}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono">{sizeDisplay} <span className="text-muted text-xs">{suffix}</span></td>
                                <td className="px-6 py-4 text-right font-mono">{formatPrice(pos.avgPx)}</td>
                                <td className={`px-6 py-4 text-right font-mono font-bold ${parseFloat(pos.upl) >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {hideBalance ? '****' : (
                                        <>
                                        {parseFloat(pos.upl) > 0 ? '+' : ''}{formatPrice(pos.upl)}
                                        </>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => setExpandedPosition(expandedPosition === pos.instId ? null : pos.instId)}
                                        className="text-primary hover:text-blue-400 flex items-center justify-end gap-1 ml-auto text-xs bg-slate-200 dark:bg-slate-800 px-3 py-1.5 rounded-md transition-colors"
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
        <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden transition-colors">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold text-lg">{t.myAssets}</h3>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted text-xs uppercase sticky top-0 backdrop-blur-md z-10">
                <tr>
                  <th className="px-6 py-3">{t.symbol}</th>
                  <th className="px-6 py-3 text-right">{t.balance}</th>
                  <th className="px-6 py-3 text-right">{t.value} (USD)</th>
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
                      {hideBalance ? '****' : `$${formatAmount(asset.eqUsd)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

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
