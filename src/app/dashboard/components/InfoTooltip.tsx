'use client';

import { useState, useRef, useEffect } from 'react';

interface InfoTooltipProps {
  text: string;
  detail?: string;
  className?: string;
}

export default function InfoTooltip({ text, detail, className = '' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const iconRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setAbove(rect.top > 200);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node) &&
          iconRef.current && !iconRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={iconRef}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-bold
                   bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300
                   transition-all cursor-help ml-1 leading-none"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <div
          ref={tipRef}
          className={`absolute z-50 w-64 px-3 py-2.5 rounded-lg
                     bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/60 shadow-xl
                     text-[11px] leading-relaxed
                     ${above
                       ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
                       : 'top-full mt-2 left-1/2 -translate-x-1/2'
                     }`}
        >
          <p className="text-zinc-300">{text}</p>
          {detail && <p className="text-zinc-500 mt-1 text-[10px]">{detail}</p>}
        </div>
      )}
    </span>
  );
}
