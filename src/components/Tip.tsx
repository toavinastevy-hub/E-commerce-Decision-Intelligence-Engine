import React from 'react';
import { Lightbulb } from 'lucide-react';

interface TipProps {
  text: string;
  label?: string;
  variant?: 'tip' | 'warning' | 'info';
}

export const Tip: React.FC<TipProps> = ({ text, label = 'In plain words', variant = 'tip' }) => {
  if (variant === 'warning') {
    return (
      <div className="edie-sim-warning p-4 rounded-xl mb-4 flex items-start gap-3 text-sm">
        <span className="text-amber-600 font-bold mt-0.5">⚠️</span>
        <div>
          <span className="font-semibold text-amber-900">{label}: </span>
          <span className="text-amber-800" dangerouslySetInnerHTML={{ __html: text }} />
        </div>
      </div>
    );
  }

  return (
    <div className="edie-tip p-4 rounded-xl mb-4 flex items-start gap-3 text-sm text-slate-800">
      <Lightbulb className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
      <div>
        <span className="font-bold text-indigo-900">{label}: </span>
        <span className="text-slate-700" dangerouslySetInnerHTML={{ __html: text }} />
      </div>
    </div>
  );
};
