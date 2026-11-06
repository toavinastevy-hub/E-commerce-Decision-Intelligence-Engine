import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Hero } from '../components/Hero';
import { Tip } from '../components/Tip';
import { MetricCard } from '../components/MetricCard';
import { SalesRow, InventoryAnalysisResult, Recommendation } from '../types';
import { generateRecommendations } from '../engine/recommendations';
import { plain, EXPLAIN_TEXTS } from '../engine/helpers';
import { Download, ChevronDown, ChevronUp, AlertCircle, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

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
  isSimulated,
  simulatedInventory,
  excludedCount
}) => {
  if (salesData.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
        <p className="text-slate-600">No data confirmed yet. Go to the Data page to start.</p>
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
  const [showLogic, setShowLogic] = useState(false);

  // Expanded card tracking
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

  const handleDownloadCsv = () => {
    const cleanRows = recs.map(r => ({
      Rank: r.rank,
      Priority: r.priority,
      Area: r.area,
      Subject: r.subject,
      Issue: plain(r.issue),
      Evidence: plain(r.evidence),
      'Proposed action': plain(r.action),
      'Expected benefit': plain(r.expected_benefit),
      'Risks and assumptions': plain(r.risks_assumptions),
      'Priority reason': plain(r.priority_reason)
    }));
    const csv = Papa.unparse(cleanRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recommendations.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'High':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getPriorityIcon = (p: string) => {
    switch (p) {
      case 'High':
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case 'Medium':
        return <Clock className="w-4 h-4 text-amber-600" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <Hero
        icon="✅"
        title="What to do next"
        subtitle="A short, ranked to-do list built from your numbers. Start at the top."
      />

      <Tip
        text="Each card shows: what is wrong, the proof, what to do, what you might gain, what could go wrong, and why it ranks where it does."
      />

      {!inventoryResult && (
        <div className="p-3.5 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl text-blue-900 text-xs">
          No usable inventory data is loaded, so there are no stock recommendations. Load inventory on the Inventory page to add them.
        </div>
      )}

      {(isSimulated || simulatedInventory) && (
        <div className="p-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl text-amber-900 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            These recommendations are based on SIMULATED data. They show how the engine works; do not act on them as real findings.
          </span>
        </div>
      )}

      <p className="text-xs text-slate-600">
        Each action comes from rules applied to your data. Benefits are estimates from past data, not promises. Check the risks before acting.
      </p>

      {/* Explainer on priorities */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <button
          onClick={() => setShowLogic(!showLogic)}
          className="w-full p-3.5 text-left text-xs font-semibold text-slate-700 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
        >
          <span>How priorities are decided</span>
          {showLogic ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showLogic && (
          <div className="p-4 border-t border-slate-100 text-xs text-slate-600 space-y-2 bg-slate-50/50">
            <p>• <b>Stockout risk</b> is always <b>High</b>: sales are likely to be lost within days.</p>
            <p>• <b>Reorder now</b> is <b>Medium</b>.</p>
            <p>• Items with a profit estimate: <b>High</b> if the estimate is 5% or more of total profit before overheads, <b>Medium</b> from 1% to under 5%, <b>Low</b> below 1%.</p>
            <p>• <b>Excess stock</b> is never High (the stock is not lost): Medium if cash tied up is 1% or more of sales after discounts, else Low.</p>
            <p>• Items with no money estimate are <b>Low</b>.</p>
            <p>• Cross-checks: a product at stock risk is never suggested for promotion or discount, and excess-stock advice depends on whether discounts pay off.</p>
          </div>
        )}
      </div>

      {/* 3 Priority Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="High priority"
          value={String(counts.High)}
          help={EXPLAIN_TEXTS['High']}
          variant="danger"
        />
        <MetricCard
          label="Medium priority"
          value={String(counts.Medium)}
          help={EXPLAIN_TEXTS['Medium']}
          variant="warning"
        />
        <MetricCard
          label="Low priority"
          value={String(counts.Low)}
          help={EXPLAIN_TEXTS['Low']}
          variant="primary"
        />
      </div>

      {/* Priority Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 mr-2">Show priorities:</span>
          {['High', 'Medium', 'Low'].map(p => {
            const isSel = selectedPriorities.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isSel ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleDownloadCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>Download recommendations (CSV)</span>
        </button>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {filteredRecs.length === 0 ? (
          <div className="p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-500 text-sm">
            No recommendations match the selected priority filters.
          </div>
        ) : (
          filteredRecs.map(r => {
            const isExpanded = expandedCards.has(r.rank);
            return (
              <div
                key={r.rank}
                className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition-all hover:border-indigo-200"
              >
                {/* Header clickable */}
                <button
                  onClick={() => toggleExpand(r.rank)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                      #{r.rank}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${getPriorityBadge(
                        r.priority
                      )}`}
                    >
                      {getPriorityIcon(r.priority)}
                      <span>{r.priority}</span>
                    </span>
                    <div className="text-sm font-bold text-slate-900">
                      <span className="text-indigo-600">{r.area}:</span> {r.subject}
                    </div>
                  </div>

                  <div className="shrink-0 text-slate-400">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 text-xs text-slate-700 space-y-3.5 border-t border-slate-100 bg-slate-50/30">
                    <div>
                      <b className="text-slate-900 font-bold block mb-0.5">Issue:</b>
                      <p className="text-slate-700 leading-relaxed">{plain(r.issue)}</p>
                    </div>

                    <div>
                      <b className="text-slate-900 font-bold block mb-0.5">Evidence:</b>
                      <p className="text-slate-700 leading-relaxed font-mono bg-white p-2.5 rounded-lg border border-slate-200">
                        {plain(r.evidence)}
                      </p>
                    </div>

                    <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                      <b className="text-indigo-950 font-bold block mb-1">Proposed action:</b>
                      <p className="text-indigo-900 leading-relaxed">{plain(r.action)}</p>
                    </div>

                    <div>
                      <b className="text-slate-900 font-bold block mb-0.5">Expected benefit:</b>
                      <p className="text-emerald-800 font-medium leading-relaxed">{plain(r.expected_benefit)}</p>
                    </div>

                    <div>
                      <b className="text-slate-900 font-bold block mb-0.5">Risks and assumptions:</b>
                      <p className="text-slate-600 leading-relaxed">{plain(r.risks_assumptions)}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                      <b className="text-slate-800">Priority: {r.priority}. </b>
                      <span>{plain(r.priority_reason)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
