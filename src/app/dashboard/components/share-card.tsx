'use client';

import { useRef, useState } from 'react';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'earlove';

interface ShareCardProps {
  userName: string;
  explorerScore: number;
  explorerLabel: string;
  mainstreamScore: number;
  mainstreamLabel: string;
  topGenres: string[];
  totalTracks: number;
  totalArtists: number;
  totalGenres: number;
  peakDecade: string | null;
  medianYear: number | null;
}

export default function ShareCard({
  userName,
  explorerScore,
  explorerLabel,
  mainstreamScore,
  mainstreamLabel,
  topGenres,
  totalTracks,
  totalArtists,
  totalGenres,
  peakDecade,
  medianYear,
}: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const copyToClipboard = async () => {
    // Try to use the Canvas API for a clean image copy
    try {
      if (cardRef.current) {
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor: '#09090b',
          scale: 2,
        });
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Fallback: download the image
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${APP_NAME}-${userName || 'profile'}.png`;
              a.click();
              URL.revokeObjectURL(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }
        });
      }
    } catch {
      // If html2canvas is not available, just show a message
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full py-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-green-500/30 hover:bg-green-500/5 transition-all group"
      >
        <div className="flex items-center justify-center gap-3">
          <svg className="w-5 h-5 text-zinc-600 group-hover:text-green-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors font-medium">
            Generate Your Shareable Profile Card
          </span>
          <svg className="w-4 h-4 text-zinc-600 group-hover:text-green-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    );
  }

  // Explorer score color
  const esColor = explorerScore >= 65 ? 'text-green-400' : explorerScore >= 35 ? 'text-yellow-400' : 'text-red-400';
  // Mainstream score color
  const msColor = mainstreamScore >= 55 ? 'text-blue-400' : mainstreamScore >= 35 ? 'text-purple-400' : 'text-orange-400';

  return (
    <div className="space-y-4">
      {/* The card itself */}
      <div
        ref={cardRef}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-md mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-5">
          <h3 className="text-xl font-bold">
            {APP_NAME === 'earlove' ? <>ear<span className="text-green-500">love</span></> : APP_NAME}
          </h3>
          {userName && (
            <p className="text-zinc-500 text-xs mt-1">{userName}&apos;s listening profile</p>
          )}
        </div>

        {/* Scores row */}
        <div className="flex justify-center gap-8 mb-5">
          <div className="text-center">
            <div className={`text-2xl font-bold ${esColor}`}>{explorerScore}</div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Explorer</div>
            <div className={`text-xs font-medium ${esColor}`}>{explorerLabel}</div>
          </div>
          {mainstreamScore > 0 && (
            <div className="text-center">
              <div className={`text-2xl font-bold ${msColor}`}>{mainstreamScore}</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Mainstream</div>
              <div className={`text-xs font-medium ${msColor}`}>{mainstreamLabel}</div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-6 text-center mb-5">
          <div>
            <div className="text-lg font-bold text-white">{totalTracks.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500">tracks</div>
          </div>
          <div>
            <div className="text-lg font-bold text-white">{totalArtists.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-500">artists</div>
          </div>
          <div>
            <div className="text-lg font-bold text-white">{totalGenres}</div>
            <div className="text-[10px] text-zinc-500">genres</div>
          </div>
        </div>

        {/* Top genres */}
        {topGenres.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-5">
            {topGenres.slice(0, 6).map((genre) => (
              <span
                key={genre}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        {/* Era */}
        {(peakDecade || medianYear) && (
          <p className="text-center text-xs text-zinc-500">
            {peakDecade && <>Most music from the <span className="text-zinc-300">{peakDecade}</span></>}
            {peakDecade && medianYear && <> · </>}
            {medianYear && <>Median year: <span className="text-zinc-300">{medianYear}</span></>}
          </p>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-zinc-600 mt-4">
          {typeof window !== 'undefined' ? window.location.host : APP_NAME}
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <button
          onClick={copyToClipboard}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
        >
          {copied ? 'Saved!' : 'Copy as image'}
        </button>
        <button
          onClick={() => setExpanded(false)}
          className="px-4 py-2 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
