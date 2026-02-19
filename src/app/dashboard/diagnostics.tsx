'use client';

import { useState } from 'react';

interface EndpointResult {
  name: string;
  endpoint: string;
  status: 'ok' | 'failed';
  code: number;
  detail?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DiagnosticReport {
  summary: { ok: number; failed: number; total: number };
  results: EndpointResult[];
  deep?: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function Diagnostics({ accessToken }: { accessToken: string }) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);

  const runDiagnostics = async (deep = false) => {
    if (deep) {
      setDeepLoading(true);
    } else {
      setLoading(true);
      setReport(null);
    }
    setExpanded(true);

    try {
      const url = deep ? '/api/debug?deep=1' : '/api/debug';
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setReport(data);
    } catch {
      setReport({
        summary: { ok: 0, failed: 1, total: 1 },
        results: [{ name: 'Debug endpoint', endpoint: '/api/debug', status: 'failed', code: 0, detail: 'Network error' }],
      });
    } finally {
      setLoading(false);
      setDeepLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          onClick={() => runDiagnostics(false)}
          disabled={loading || deepLoading}
          className="text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'API Diagnostics'}
        </button>
        <button
          onClick={() => runDiagnostics(true)}
          disabled={loading || deepLoading}
          className="text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {deepLoading ? 'Analyzing...' : 'Deep Diagnostics'}
        </button>
        {report && !loading && !deepLoading && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {expanded ? 'Hide' : 'Show'}
          </button>
        )}
      </div>

      {(loading || deepLoading) && (
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-green-500"></div>
          <p className="text-zinc-500 text-sm mt-2">
            {deepLoading ? 'Running deep analysis (building heard profile + test searches)...' : 'Testing Spotify API endpoints...'}
          </p>
        </div>
      )}

      {report && !loading && !deepLoading && expanded && (
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Endpoint status table */}
          <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 overflow-hidden">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <span className="font-medium text-sm">API Endpoint Status</span>
              <span className="text-sm">
                <span className="text-green-400">{report.summary.ok} ok</span>
                {' / '}
                <span className="text-red-400">{report.summary.failed} failed</span>
              </span>
            </div>
            <div className="divide-y divide-zinc-700/50">
              {report.results.map((r) => (
                <div key={r.endpoint} className="px-4 py-2 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={r.status === 'ok' ? 'text-green-400' : 'text-red-400'}>
                      {r.status === 'ok' ? '✓' : '✗'}
                    </span>
                    <span className="text-zinc-300">{r.name}</span>
                  </div>
                  <span className={`font-mono text-xs ${r.code === 200 ? 'text-green-500' : 'text-red-500'}`}>
                    {r.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Deep diagnostics */}
          {report.deep && (
            <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 overflow-hidden">
              <div className="p-4 border-b border-zinc-700">
                <span className="font-medium text-sm">Deep Analysis</span>
              </div>
              <div className="p-4 space-y-4 text-sm">
                {/* Heard Profile summary */}
                <div>
                  <h4 className="text-zinc-400 font-medium mb-2">Heard Profile</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-zinc-700/30 rounded p-2">
                      <div className="text-lg font-bold">{report.deep.heardProfile?.trackCount ?? '?'}</div>
                      <div className="text-zinc-500 text-xs">Tracks</div>
                    </div>
                    <div className="bg-zinc-700/30 rounded p-2">
                      <div className="text-lg font-bold">{report.deep.heardProfile?.artistCount ?? '?'}</div>
                      <div className="text-zinc-500 text-xs">Artists</div>
                    </div>
                    <div className="bg-zinc-700/30 rounded p-2">
                      <div className="text-lg font-bold">{report.deep.heardProfile?.genreCount ?? '?'}</div>
                      <div className="text-zinc-500 text-xs">Genres</div>
                    </div>
                    <div className="bg-zinc-700/30 rounded p-2">
                      <div className="text-lg font-bold">{report.deep.heardProfile?.isrcCount ?? '?'}</div>
                      <div className="text-zinc-500 text-xs">ISRCs</div>
                    </div>
                  </div>
                  {report.deep.heardProfile?.topGenres?.length > 0 && (
                    <div className="mt-2">
                      <span className="text-zinc-500 text-xs">Top genres: </span>
                      <span className="text-green-400 text-xs">{report.deep.heardProfile.topGenres.join(', ')}</span>
                    </div>
                  )}
                  {report.deep.heardProfile?.genreCount === 0 && (
                    <div className="mt-2 text-red-400 text-xs">
                      No genres detected — top artists may have empty genre arrays
                    </div>
                  )}
                </div>

                {/* Top Artists Sample */}
                {report.deep.topArtistsSample && (
                  <div>
                    <h4 className="text-zinc-400 font-medium mb-2">Top Artists Sample (raw from Spotify)</h4>
                    {report.deep.topArtistsSample.length === 0 ? (
                      <p className="text-red-400 text-xs">No top artists returned by Spotify</p>
                    ) : (
                      <div className="space-y-1">
                        {report.deep.topArtistsSample.map((a: { name: string; genres: string[]; id: string }) => (
                          <div key={a.id} className="text-xs">
                            <span className="text-zinc-300">{a.name}</span>
                            <span className="text-zinc-600"> — </span>
                            <span className={a.genres?.length > 0 ? 'text-green-400' : 'text-red-400'}>
                              {a.genres?.length > 0 ? a.genres.join(', ') : 'NO GENRES'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sample Search */}
                {report.deep.sampleSearch && (
                  <div>
                    <h4 className="text-zinc-400 font-medium mb-2">
                      Sample Search: <code className="text-purple-400">{report.deep.sampleSearch.query}</code>
                    </h4>
                    <p className="text-xs text-zinc-500 mb-1">
                      {report.deep.sampleSearch.totalReturned} returned, {report.deep.sampleSearch.unheardCount} unheard
                    </p>
                    <div className="space-y-1">
                      {report.deep.sampleSearch.tracks?.map((t: { name: string; artist: string; id: string; inProfile: boolean }) => (
                        <div key={t.id} className="text-xs flex items-center gap-2">
                          <span className={t.inProfile ? 'text-red-400' : 'text-green-400'}>
                            {t.inProfile ? '✗ heard' : '✓ new'}
                          </span>
                          <span className="text-zinc-300">{t.name}</span>
                          <span className="text-zinc-600">by {t.artist}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Broad Search Analysis */}
                {report.deep.broadSearch && (
                  <div>
                    <h4 className="text-zinc-400 font-medium mb-2">
                      Broad Search: <code className="text-purple-400">{report.deep.broadSearch.query}</code>
                    </h4>
                    <p className="text-xs text-zinc-500 mb-1">
                      {report.deep.broadSearch.totalReturned} returned, {report.deep.broadSearch.unheardCount} unheard
                    </p>
                    <div className="space-y-1">
                      {report.deep.broadSearch.analysis?.map((t: { track: string; artist: string; artistId: string; artistKnown: boolean; trackHeard: boolean; isrcMatch: boolean }, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-2 flex-wrap">
                          <span className={t.trackHeard ? 'text-red-400' : t.isrcMatch ? 'text-yellow-400' : 'text-green-400'}>
                            {t.trackHeard ? '✗ ID match' : t.isrcMatch ? '✗ ISRC match' : '✓ unheard'}
                          </span>
                          <span className="text-zinc-300">{t.track}</span>
                          <span className="text-zinc-600">by {t.artist}</span>
                          <span className={t.artistKnown ? 'text-yellow-500' : 'text-green-500'}>
                            [{t.artistKnown ? 'known artist' : 'new artist'}]
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
