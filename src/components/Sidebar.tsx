import React, { useState } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Percent,
  Sliders,
  Boxes,
  CheckSquare,
  FileSpreadsheet,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
  Trash2
} from 'lucide-react';
import { GLOSSARY_ITEMS } from '../engine/helpers';

export type PageId =
  | 'Dashboard'
  | 'Executive summary'
  | 'Products'
  | 'Discounts'
  | 'Simulator'
  | 'Inventory'
  | 'Recommendations'
  | 'Data';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  sourceLabel: string | null;
  isSimulated: boolean;
  validRowCount: number;
  inventoryRowCount: number;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onClearData?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  sourceLabel,
  validRowCount,
  inventoryRowCount,
  theme = 'light',
  onToggleTheme,
  onClearData
}) => {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const navItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'Dashboard', label: 'Sales Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'Executive summary', label: 'Executive Report', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'Products', label: 'Product Analytics', icon: <Package className="w-4 h-4" /> },
    { id: 'Discounts', label: 'Discount Payoff', icon: <Percent className="w-4 h-4" /> },
    { id: 'Simulator', label: 'Price & Volume Simulator', icon: <Sliders className="w-4 h-4" /> },
    { id: 'Inventory', label: 'Inventory Health', icon: <Boxes className="w-4 h-4" /> },
    { id: 'Recommendations', label: 'Actionable Intelligence', icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'Data', label: 'Data Hub & Import', icon: <FileSpreadsheet className="w-4 h-4" /> }
  ];

  return (
    <aside className="w-full md:w-64 lg:w-72 bg-white dark:bg-[#0d121f] border-r border-slate-200 dark:border-slate-800/80 p-4 sm:p-5 flex flex-col justify-between shrink-0 h-full md:h-screen md:sticky md:top-0 overflow-y-auto select-none shadow-xs">
      <div>
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-500/20 shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-100" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight leading-none">
              EDIE Analytics
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">
              Decision Intelligence Engine
            </p>
          </div>
        </div>

        {/* Dataset Status: Live Active Card or Clean Blank Canvas Indicator */}
        {sourceLabel && validRowCount > 0 ? (
          <div className="mb-5 p-3 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Active Dataset</span>
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20 font-mono">
                LIVE
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 truncate font-mono text-[11px]" title={sourceLabel}>
              {sourceLabel}
            </p>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 font-mono">
                {validRowCount.toLocaleString()} records
              </span>
              {inventoryRowCount > 0 && (
                <span className="text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/60 font-mono">
                  {inventoryRowCount} SKUs
                </span>
              )}
            </div>
            {onClearData && (
              <button
                onClick={onClearData}
                className="w-full mt-1.5 py-1.5 px-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 micro-interactive"
                title="Wipe current data and reset application to blank"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear &amp; Reset to Blank</span>
              </button>
            )}
          </div>
        ) : (
          <div className="mb-5 p-3 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Database className="w-3.5 h-3.5 text-slate-400" />
                <span>Dataset Status</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                BLANK
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              No data active. Ready for new workbook upload.
            </p>
            <button
              onClick={() => onSelectPage('Data')}
              className="w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-[11px] transition-colors cursor-pointer text-center block shadow-2xs micro-interactive"
            >
              Upload Dataset
            </button>
          </div>
        )}

        {/* Navigation list */}
        <div className="space-y-1 mb-6">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-2">
            Analytics Modules
          </p>
          {navItems.map(item => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer text-left transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent hover:translate-x-0.5'
                }`}
              >
                <span className={`${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Glossary Expander */}
        <div className="border border-slate-200 dark:border-slate-800/80 rounded-xl bg-slate-50 dark:bg-slate-900/60 overflow-hidden mb-6">
          <button
            onClick={() => setGlossaryOpen(!glossaryOpen)}
            className="w-full flex items-center justify-between p-3 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>KPI Glossary</span>
            </div>
            {glossaryOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {glossaryOpen && (
            <div className="p-3 pt-0 text-xs text-slate-600 dark:text-slate-400 space-y-3 max-h-60 overflow-y-auto border-t border-slate-200 dark:border-slate-800">
              {GLOSSARY_ITEMS.map((item, idx) => (
                <div key={idx} className="pb-2 border-b border-slate-200 dark:border-slate-800/60 last:border-0 last:pb-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{item.term}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {item.definition}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer & Theme Switcher */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer micro-interactive"
          >
            <div className="flex items-center gap-2">
              {theme === 'light' ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-400" />
              )}
              <span>{theme === 'light' ? 'Light Theme' : 'Dark Mode'}</span>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">
              Switch
            </span>
          </button>
        )}

        <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between px-1">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Decision Intelligence</span>
          </span>
          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-600">v1.3</span>
        </div>
      </div>
    </aside>
  );
};
