import React, { useState, useMemo } from 'react';
import { Hero } from '../components/Hero';
import { MetricCard } from '../components/MetricCard';
import { SalesRow, InventoryAnalysisResult } from '../types';
import { generateRecommendations } from '../engine/recommendations';
import { plain } from '../engine/helpers';
import { exportToExcel, exportToCsv } from '../engine/export_utils';
import {
  CheckSquare,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Download,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';

interface RecommendationsPageProps {
  salesData: SalesRow[];
  inventoryResult: InventoryAnalysisResult | null;
  isSimulated: boolean;
  simulatedInventory: boolean;
  excludedCount: number;
}

export const RecommendationsPage: React.FC<RecommendationsPageProps> = ({
  salesData,
  inventoryResult,
  simulatedInventory,
  excludedCount
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white dark:bg-[#111827] p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center shadow-xs">
        <p className="text-slate-500 dark:text-slate-400">No data loaded yet.</p>
      </div>
    );
  }

  const recs = useMemo(
    () => generateRecommendations(salesData, inventoryResult, excludedCount, salesData.length + excludedCount, simulatedInventory),
    [salesData, inventoryResult, excludedCount, simulatedInventory]
  );

  const counts = useMemo(() => {
    const c = { High: 0, Medium: 0, Low: 0 };
    for (const r of recs) {
      if (r.priority in c) c[r.priority]++;
    }
    return c;
  }, [recs]);

  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(['High', 'Medium', 'Low']);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (const r of recs) {
      if (r.priority === 'High') {
        initial.add(r.rank);
      }
    }
    return initial;
  });

  const toggleExpand = (rank: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(rank)) {
        next.delete(rank);
      } else {
        next.add(rank);
      }
      return next;
    });
  };

  const togglePriority = (p: string) => {
    if (selectedPriorities.includes(p)) {
      if (selectedPriorities.length > 1) {
        setSelectedPriorities(selectedPriorities.filter(item => item !== p));
      }
    } else {
      setSelectedPriorities([...selectedPriorities, p]);
    }
  };

  const filteredRecs = useMemo(() => {
    return recs.filter(r => selectedPriorities.includes(r.priority));
  }, [recs, selectedPriorities]);

  const getCleanRows = () =>
    recs.map(r => ({
      Rank: r.rank,
      Priority: r.priority,
      Area: r.area,
      Subject: r.subject,
      Issue: plain(r.issue),
      Evidence: plain(r.evidence),
      ProposedAction: plain(r.action),
      ExpectedBenefit: plain(r.expected_benefit),
      RisksAndAssumptions: plain(r.risks_assumptions),
      PriorityReason: plain(r.priority_reason)
    }));

  const handleDownloadExcel = () => {
    exportToExcel(
      [{ name: 'Executive Actions', data: getCleanRows() }],
      'Executive_Action_Recommendations.xlsx'
    );
  };

  const handleDownloadCsv = () => {
    exportToCsv(getCleanRows(), 'Executive_Action_Recommendations.csv');
  };

  return (
    <div className="space-y-6">
      <Hero
        icon={<CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />}
        title="Actionable Commercial Intelligence"
        subtitle="Ranked operational to-do list synthesized from margin health, discount ROI, product decline, and inventory stockout risks."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer micro-interactive"
              title="Download clean Excel file with genuine .xlsx format"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer micro-interactive"
            >
              <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      {/* 3 Priority Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="High Priority Actions"
          value={String(counts.High)}
          subtitle="Immediate stockout or major profit risk"
          icon={<ShieldAlert className="w-4 h-4" />}
          size="compact"
          accentColor="rose"
        />
        <MetricCard
          label="Medium Priority Actions"
          value={String(counts.Medium)}
          subtitle="Time-sensitive inventory or repricing"
          icon={<Clock className="w-4 h-4" />}
          size="compact"
          accentColor="amber"
        />
        <MetricCard
          label="Low Priority Actions"
          value={String(counts.Low)}
          subtitle="Longer-term review or promotional tests"
          icon={<CheckCircle2 className="w-4 h-4" />}
          size="compact"
          accentColor="sky"
        />
      </div>

      {/* Filter Bar */}
      <div className="exec-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-2">Filter by Priority:</span>
          {['High', 'Medium', 'Low'].map(p => {
            const isSel = selectedPriorities.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSel
                    ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white border border-indigo-200 dark:border-slate-700 font-bold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-900/40 text-slate-500 border border-transparent hover:text-slate-800 dark:hover:text-slate-300'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Showing {filteredRecs.length} of {recs.length} actions
        </span>
      </div>

      {/* Cards List */}
      <div className="space-y-3.5">
        {filteredRecs.map(r => {
          const isExpanded = expandedCards.has(r.rank);
          return (
            <div
              key={r.rank}
              className="exec-card overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all micro-interactive"
            >
              <button
                onClick={() => toggleExpand(r.rank)}
                className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 shadow-2xs">
                    #{r.rank}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      r.priority === 'High'
                        ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                        : r.priority === 'Medium'
                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {r.priority}
                  </span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    <span className="text-indigo-600 dark:text-indigo-400">{r.area}:</span> {r.subject}
                  </div>
                </div>

                <div className="shrink-0 text-slate-400">
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 pt-1 text-xs text-slate-700 dark:text-slate-300 space-y-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Identified Problem
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans">{plain(r.issue)}</p>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
                      Empirical Data Evidence
                    </span>
                    <p className="text-indigo-900 dark:text-indigo-200/90 leading-relaxed font-mono bg-white dark:bg-slate-900/90 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      {plain(r.evidence)}
                    </p>
                  </div>

                  <div className="bg-indigo-50/80 dark:bg-indigo-950/30 p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-800/40 space-y-1">
                    <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider block">
                      Recommended Action
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-sans">{plain(r.action)}</p>
                  </div>

                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                    <TrendingUp className="w-4 h-4 shrink-0" />
                    <span><b>Projected Gain:</b> {plain(r.expected_benefit)}</span>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
                      Risks &amp; Dependencies:
                    </span>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-sans">{plain(r.risks_assumptions)}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
