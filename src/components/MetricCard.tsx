import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  help?: string;
  variant?: 'primary' | 'warning' | 'danger' | 'success';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  delta,
  deltaType = 'neutral',
  help,
  variant = 'primary'
}) => {
  const [showHelp, setShowHelp] = useState(false);

  const borderClass =
    variant === 'warning'
      ? 'border-l-amber-500'
      : variant === 'danger'
      ? 'border-l-rose-500'
      : variant === 'success'
      ? 'border-l-emerald-500'
      : 'border-l-indigo-600';

  const deltaColor =
    deltaType === 'positive'
      ? 'text-emerald-600'
      : deltaType === 'negative'
      ? 'text-rose-600'
      : 'text-slate-500';

  return (
    <div
      className={`relative bg-white border border-slate-200 border-l-[6px] ${borderClass} rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all`}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-xs sm:text-sm font-semibold text-slate-500 tracking-wide">
          {label}
        </span>
        {help && (
          <div className="relative">
            <button
              type="button"
              className="text-slate-400 hover:text-indigo-600 p-0.5 rounded cursor-pointer"
              onMouseEnter={() => setShowHelp(true)}
              onMouseLeave={() => setShowHelp(false)}
              onClick={() => setShowHelp(!showHelp)}
              title={help}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            {showHelp && (
              <div className="absolute right-0 top-6 z-50 w-56 p-2.5 bg-slate-900 text-white text-xs rounded-xl shadow-xl pointer-events-none transition-opacity">
                {help}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          {value}
        </span>
        {delta && (
          <span className={`text-xs sm:text-sm font-medium ${deltaColor}`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
};
