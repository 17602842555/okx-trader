import React, { useMemo, useState, useEffect } from 'react';
import { AssetBalance, Position, AssetHistory, TimePeriod, CurrencyUnit, Order } from '../types';
import { OKXService } from '../services/okxService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Wallet, TrendingUp, DollarSign, ChevronDown, ChevronUp, Activity, ArrowRightLeft, Eye, EyeOff } from 'lucide-react';
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

  const totalBalanceUsd = useMemo(() => {
    return balances.reduce((acc, curr) => acc + parseFloat(curr.eqUsd), 0);
  }, [balances]);

  const displayBalance = useMemo(() => {
     return totalBalanceUsd * service.exchangeRates[unit];
  }, [totalBalanceUsd, unit, service.exchangeRates]);

  const percentageChange = useMemo(() => {
      if (assetHistory.length < 2) return 0;
      const startEq = assetHistory[0].totalEq;
      if (startEq === 0) return 0;
      const currentEq = assetHistory[assetHistory.length - 1].totalEq;
      return ((currentEq - startEq) / startEq) * 100;
  }, [assetHistory]);

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
        // FIX: Replaced potentially corrupted template string with clean string template syntax
        onAction?.(, 'success'); 
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
        
        onAction?.(, 'success');
      } catch(e:any) {
          onAction?.(e.message, 'error');
      }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-10">
      {/* 优化: 确保所有顶部卡片在横屏下垂直填充一致 (Req #3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-surface p-6 rounded-xl border border-border shadow-lg transition-colors min-h-[150px] flex flex-col justify-center">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-3 text-muted">
                <Wallet size={20} />
                <span className="text-sm font-medium">{t.totalAssets}</span>
            </div>
            <div className="flex items-center gap-2 relative">
                <button 
                    onClick={() => setHideBalance(!hideBalance)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-muted"
                >
                    {hideBalance ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                
                <button 
                    onClick={() => setIsUnitOpen(!isUnitOpen)}
                    className="flex items-center gap-1 text-xs bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                    {unit} <ArrowRightLeft size={12}/>
                </button>
                {isUnitOpen && (
                    <div className="absolute right-0 top-full mt-1 w-24 bg-surface border border-border rounded shadow-xl z-20">
                        {(['USD', 'CNY', 'BTC'] as CurrencyUnit[]).map(u => (
                            <button 
                                key={u}
                                onClick={() => {
                                    setUnit(u);
                                    setIsUnitOpen(false);
                                }}
                                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                                {u}
                            </button>
                        ))}
                    </div>
                )}
            </div>
          </div>
          <div className="text-3xl font-bold text-text">
            {hideBalance ? '******' : (
                <>
                {unit === 'USD' && '$'}
                {unit === 'CNY' && '¥'}
                {unit === 'BTC' && '₿'}
                {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: unit === 'BTC' ? 6 : 2 })}
                </>
            )}
          </div>
          <div className={`mt-2 text-xs flex items-center ${percentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
            <TrendingUp size={14} className="mr-1" /> {formatPct(percentageChange)} ({period})
          </div>
          {unit !== 'USD' && (
              <div className="mt-1 text-[10px] text-muted">
                  {t.rate}: 1 USD ≈ {service.exchangeRates[unit]} {unit}
              </div>
          )}
        </div>
        
        {/* 占位卡片 1: 每日盈亏 (确保与总资产卡片对齐) */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-lg transition-colors min-h-[150px] flex flex-col justify-center">
          <div className="flex items-center space-x-3 mb-2 text-muted">
            <DollarSign size={20} />
            <span className="text-sm font-medium">{t.dailyPnl}</span>
          </div>
          <div className="text-3xl font-bold text-success">
            {hideBalance ? '******' : '--'}
          </div>
        </div>

        {/* 占位卡片 2: 账户状态 (确保与总资产卡片对齐) */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-lg flex flex-col justify-center items-start transition-colors min-h-[150px]">
             <div className="text-muted text-sm mb-2">{t.accountStatus}</div>
             <div className="px-3 py-1 bg-success/20 text-success rounded-full text-xs font-bold uppercase tracking-wide">
                Active
             </div>
        </div>
      </div>

      {/* Asset Trend Chart (Real Data) */}
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
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            period === p 
                            ? 'bg-primary text-white shadow-sm' 
                            : 'text-muted hover:text-text'
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
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#334155" : "#e2e8f0"} vertical={false} />
                        <XAxis 
                            dataKey="ts" 
                            tickFormatter={(ts) => {
                                const date = new Date(parseInt(ts));
                                return period === '1D' ? date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : date.toLocaleDateString();
                            }}
                            stroke="#94a3b8"
                            fontSize={10}
                            minTickGap={30}
                        />
                        <YAxis 
                            stroke="#94a3b8"
                            fontSize={10}
                            domain={['auto', 'auto']}
                            tickFormatter={(val) => hideBalance ? '***' : `$${val/1000}k`}
                        />
                        <RechartsTooltip 
                            contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: '#334155', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}
                            labelFormatter={(ts) => new Date(parseInt(ts)).toLocaleString()}
                            formatter={(value: number) => [hideBalance ? '******' : `$${value.toLocaleString()}`, 'Equity']}
                        />
                        <Area type="monotone" dataKey="totalEq" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEq)" />
                    </AreaChart>
                </ResponsiveContainer>
            )}
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
                        <tr><td colSpan={6} className="p-6 text-center text-muted">No open positions</td></tr>
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
                                {/* 优化: 使用 whitespace-nowrap 修复换行不一致 (Req #4) */}
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

      {/* 资产列表和饼图 (Req #2: 它们在手机横屏下也并排显示) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
        {/* Asset List */}
        <div className="bg-surface rounded-xl border border-border shadow-lg overflow-hidden transition-colors">
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h3 className="font-semibold text-lg">{t.myAssets}</h3>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-100 dark:bg-slate-900/50 text-muted text-xs uppercase sticky top-0 backdrop-blur-md">
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
