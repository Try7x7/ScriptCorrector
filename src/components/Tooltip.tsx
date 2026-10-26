import React from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'center' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  placement = 'top',
  align = 'center',
  className = '',
}) => {
  if (!content) return <>{children}</>;

  const getPlacementAndAlignClasses = () => {
    if (placement === 'top') {
      const alignClass = 
        align === 'left' ? 'left-0' :
        align === 'right' ? 'right-0' :
        'left-1/2 -translate-x-1/2';
      return `bottom-full ${alignClass} mb-2`;
    }
    if (placement === 'bottom') {
      const alignClass = 
        align === 'left' ? 'left-0' :
        align === 'right' ? 'right-0' :
        'left-1/2 -translate-x-1/2';
      return `top-full ${alignClass} mt-2`;
    }
    if (placement === 'left') {
      return 'right-full top-1/2 -translate-y-1/2 mr-2';
    }
    return 'left-full top-1/2 -translate-y-1/2 ml-2';
  };

  const getArrowClasses = () => {
    if (placement === 'top') {
      const alignClass = 
        align === 'left' ? 'left-4' :
        align === 'right' ? 'right-4' :
        'left-1/2 -translate-x-1/2';
      return `top-full ${alignClass} -mt-1 border-t-zinc-900 border-x-transparent border-b-transparent`;
    }
    if (placement === 'bottom') {
      const alignClass = 
        align === 'left' ? 'left-4' :
        align === 'right' ? 'right-4' :
        'left-1/2 -translate-x-1/2';
      return `bottom-full ${alignClass} -mb-1 border-b-zinc-900 border-x-transparent border-t-transparent`;
    }
    if (placement === 'left') {
      return 'left-full top-1/2 -translate-y-1/2 -ml-1 border-l-zinc-900 border-y-transparent border-r-transparent';
    }
    return 'right-full top-1/2 -translate-y-1/2 -mr-1 border-r-zinc-900 border-y-transparent border-l-transparent';
  };

  return (
    <div className={`relative group/tooltip inline-flex ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute ${getPlacementAndAlignClasses()} z-50 hidden group-hover/tooltip:flex flex-col items-center opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150 w-max max-w-[320px] sm:max-w-[360px]`}
      >
        <div className="bg-zinc-900/95 backdrop-blur-xs text-white text-xs px-3.5 py-2.5 rounded-xl shadow-2xl font-sans text-left leading-relaxed font-normal border border-zinc-700/60 break-words whitespace-normal">
          {content}
        </div>
        <div className={`w-0 h-0 border-4 ${getArrowClasses()}`} />
      </div>
    </div>
  );
};
