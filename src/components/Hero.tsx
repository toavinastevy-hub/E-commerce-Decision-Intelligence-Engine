import React, { ReactNode } from 'react';

interface HeroProps {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export const Hero: React.FC<HeroProps> = ({ title, subtitle, icon, actions }) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-5 border-b border-slate-200 dark:border-slate-800/80">
      <div className="flex items-start sm:items-center gap-3.5">
        {icon && (
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700/60 shadow-xs shrink-0 micro-interactive">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white m-0">
            {title}
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400 text-xs sm:text-sm leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        </div>
      </div>
      {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
};
