import React, { useState } from 'react';
import {
  FileSpreadsheet,
  LayoutDashboard,
  TrendingUp,
  Tag,
  Percent,
  FlaskConical,
  Package,
  CheckSquare,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database
} from 'lucide-react';
import { GLOSSARY_ITEMS } from '../engine/helpers';

export type PageId =
  | 'Data'
  | 'Executive summary'
  | 'Dashboard'
  | 'Products'
  | 'Discounts'
  | 'Simulator'
  | 'Inventory'
  | 'Recommendations';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  sourceLabel: string | null;
  isSimulated: boolean;
  validRowCount: number;
  inventoryRowCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  sourceLabel,
  isSimulated,
  validRowCount,
  inventoryRowCount
}) => {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const navItems: { id: PageId; label: string; icon: string; iconComp: React.ComponentType<{ className?: string }> }[] = [
    { id: 'Data', label: 'Start here', icon: '🏁', iconComp: FileSpreadsheet },
    { id: 'Executive summary', label: 'The big picture', icon: '📊', iconComp: LayoutDashboard },
    { id: 'Dashboard', label: 'Explore your sales', icon: '📈', iconComp: TrendingUp },
    { id: 'Products', label: 'Your products', icon: '🏷️', iconComp: Tag },
    { id: 'Discounts', label: 'Do discounts pay off?', icon: '💸', iconComp: Percent },
    { id: 'Simulator', label: 'Try a price change', icon: '🧪', iconComp: FlaskConical },
    { id: 'Inventory', label: 'Stock check', icon: '📦', iconComp: Package },
    { id: 'Recommendations', label: 'What to do next', icon: '✅', iconComp: CheckSquare }
  ];

  return (
    <aside className="w-full md:w-64 lg:w-72 bg-[#F1F2FB] border-r border-indigo-100/60 p-4 sm:p-5 flex flex-col justify-between shrink-0 h-auto md:min-h-screen">
      <div>
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-xs">
            📊
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight leading-none">
              EDIE
            </h2>
            <p className="text-xs text-indigo-700 font-medium mt-1">
              Decision Intelligence Engine
            </p>
          </div>
        </div>

        {/* Data Status Badge */}
        {sourceLabel && (
          <div className="mb-5 p-3 bg-white/80 backdrop-blur-xs rounded-xl border border-indigo-100 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1">
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>Loaded Data</span>
            </div>
            <p className="text-slate-600 truncate font-mono text-[11px]" title={sourceLabel}>
              {sourceLabel}
            </p>
            <div className="flex items-center gap-2 mt-1.5 text-[11px]">
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                {validRowCount.toLocaleString()} sales rows
              </span>
              {inventoryRowCount > 0 && (
                <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                  {inventoryRowCount} inventory items
                </span>
              )}
            </div>
            {isSimulated && (
              <p className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                ⚠️ SIMULATED Demo Data
              </p>
            )}
          </div>
        )}

        {/* Navigation list */}
        <div className="space-y-1 mb-6">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-2">
            Navigation
          </p>
          {navItems.map(item => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer text-left ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                    : 'text-slate-700 hover:bg-white hover:text-indigo-700'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Glossary Expander */}
        <div className="border border-indigo-100 rounded-xl bg-white/70 overflow-hidden mb-6">
          <button
            onClick={() => setGlossaryOpen(!glossaryOpen)}
            className="w-full flex items-center justify-between p-3 text-xs font-semibold text-slate-800 hover:bg-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-indigo-900">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>📖 Words explained</span>
            </div>
            {glossaryOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {glossaryOpen && (
            <div className="p-3 pt-0 text-xs text-slate-600 space-y-3 max-h-80 overflow-y-auto border-t border-indigo-50">
              {GLOSSARY_ITEMS.map((item, idx) => (
                <div key={idx} className="pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="font-bold text-indigo-950 text-xs">{item.term}</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    {item.definition}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer disclaimer */}
      <div className="pt-4 border-t border-indigo-100/80 text-[11px] text-slate-500 text-center">
        Built for MBA Business Analytics
        <div className="text-[10px] text-slate-400 mt-1">
          Demo uses made-up (simulated) data.
        </div>
      </div>
    </aside>
  );
};
