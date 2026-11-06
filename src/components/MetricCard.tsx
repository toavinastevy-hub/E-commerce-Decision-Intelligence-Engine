import React, { ReactNode } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaType?: 'positive' | 'negative' | 'neutral';
  icon: ReactNode;
  subtitle?: string;
  size?: 'hero' | 'compact';
  accentColor?: 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  delta,
  deltaType = 'neutral',
  icon,
  subtitle,
  size = 'hero',
  accentColor = 'indigo'
}) => {
  const isHero = size === 'hero';

  const accentStyles = {
    indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20',
    sky: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20',
    rose: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'
  }[accentColor];

  const deltaColor =
    deltaType === 'positive'
      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
      : deltaType === 'negative'
      ? 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20'
      : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';

  if (!isHero) {
    // Compact size for secondary metrics - exactly uniform
    return (
      <div className="sub-metric-card p-4 flex flex-col justify-between micro-interactive">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
            {label}
          </span>
          <div className={`p-1.5 rounded-lg border text-xs ${accentStyles}`}>
            {icon}
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            {value}
          </span>
          {delta && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${deltaColor}`}>
              {deltaType === 'positive' ? (
                <ArrowUpRight className="w-3 h-3" />
              ) : deltaType === 'negative' ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {delta}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  // Hero size for primary information - big and uniform
  return (
    <div className="hero-metric-card p-5 lg:p-6 flex flex-col justify-between relative overflow-hidden group micro-interactive">
      {/* Background glow accent */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/15 transition-all duration-300" />

      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
          {label}
        </span>
        <div className={`p-2.5 rounded-xl border ${accentStyles}`}>
          {icon}
        </div>
      </div>

      <div className="relative z-10">
        <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          {value}
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          {delta ? (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md border ${deltaColor}`}>
              {deltaType === 'positive' ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : deltaType === 'negative' ? (
                <ArrowDownRight className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              {delta}
            </span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">Benchmark stable</span>
          )}
          {subtitle && (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[150px]">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
