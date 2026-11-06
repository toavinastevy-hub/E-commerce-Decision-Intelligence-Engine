import React from 'react';
import { Lightbulb, AlertTriangle, Info } from 'lucide-react';

interface TipProps {
  text: string;
  label?: string;
  variant?: 'tip' | 'warning' | 'info';
}

export const Tip: React.FC<TipProps> = ({ text, label = 'Key Insight', variant = 'tip' }) => {
  if (variant === 'warning') {
    return (
      <div className="p-3.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl mb-4 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-800 dark:text-amber-300">{label}: </span>
          <span className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
        </div>
      </div>
    );
  }

  if (variant === 'info') {
    return (
      <div className="p-3.5 bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 rounded-xl mb-4 flex items-start gap-3 text-xs text-sky-900 dark:text-sky-200">
        <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-sky-800 dark:text-sky-300">{label}: </span>
          <span className="text-sky-900/90 dark:text-sky-200/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3.5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl mb-4 flex items-start gap-3 text-xs text-indigo-900 dark:text-indigo-200">
      <Lightbulb className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
      <div>
        <span className="font-semibold text-indigo-800 dark:text-indigo-300">{label}: </span>
        <span className="text-indigo-900/90 dark:text-indigo-200/90 leading-relaxed" dangerouslySetInnerHTML={{ __html: text }} />
      </div>
    </div>
  );
};
