import React from 'react';

interface HeroProps {
  title: string;
  subtitle: string;
  icon?: string;
}

export const Hero: React.FC<HeroProps> = ({ title, subtitle, icon }) => {
  return (
    <div className="edie-hero text-white rounded-2xl p-6 sm:p-8 mb-6 shadow-md transition-all">
      <div className="flex items-center gap-3">
        {icon && <span className="text-3xl sm:text-4xl">{icon}</span>}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white m-0">
          {title}
        </h1>
      </div>
      <p className="mt-2 text-indigo-100 text-sm sm:text-base leading-relaxed max-w-3xl">
        {subtitle}
      </p>
    </div>
  );
};
