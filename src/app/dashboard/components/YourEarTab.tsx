'use client';

import RadarChart from './radar-chart';
import Timeline from './timeline';
import ExplorerScore from './explorer-score';
import ShareCard from './share-card';
import SpotifyLink from './SpotifyLink';
import InfoTooltip from './InfoTooltip';

type PhaseStatus = 'idle' | 'loading' | 'done' | 'error';

interface GenreRadarPoint {
  genre: string;
  weight: number;
  rawCount: number;
  artists: string[];
}

interface DecadeBucket {
  decade: string;
  count: number;
  percentage: number;
}

interface DiscographyAlbum {
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  albumImage?: string;
  releaseDate?: string;
  totalTracks: number;
  unheardCount: number;
  spotifyUrl?: string;
}

interface MainstreamGenreResult {
  genre: string;
  searchedTracks: number;
  heardTracks: number;
  knownArtistTracks: number;
  overlapPercent: number;
  unheardExamples: { name: string; artist: string; url: string; trackId?: string }[];
}

interface MainstreamResult {
  overallScore: number;
  label: string;
  genres: MainstreamGenreResult[];
  totalSearched: number;
  totalOverlap: number;
  buildTime: number;
}

interface TasteDriftRange {
  id: string;
  name: string;
  genres: string[];
}

export interface YourEarTabProps {
  user: { id: string; name: string; image: string } | null;
  heardTracks: Set<string>;
  heardArtists: Set<string>;
  allGenres: { genre: string; count: number }[];
  sources: {
    topTracksShort: number; topTracksMedium: number; topTracksLong: number;
    recentlyPlayed: number; followedArtists: number;
    savedTotal: number; ownedPlaylists: number; playlistTracks: number;
  };
  basicsStatus: PhaseStatus;
  libraryStatus: PhaseStatus;
  playlistsStatus: PhaseStatus;
  genresStatus: PhaseStatus;
  discographyStatus: PhaseStatus;
  phaseError: string | null;
  warnings: string[];
  loadLibrary: () => void;
  loadGenres: () => void;
  loadDiscography: () => void;
  loadMainstream: () => void;
  handleRefresh: () => void;
  loadBasics: () => void;
  timeline: DecadeBucket[];
  stats: {
    peakDecade: string | null;
    medianYear: number | null;
    [key: string]: unknown;
  };
  genreRadar: GenreRadarPoint[];
  explorerScore: number;
  explorerLabel: string;
  trackPopularities: number[];
  mainstreamResult: MainstreamResult | null;
  mainstreamStatus: PhaseStatus;
  discographyAlbums: DiscographyAlbum[];
  discographyArtistsScanned: number;
  onGenreClick: (genre: string) => void;
  onDecadeClick: (decade: string) => void;
  bannerDismissed: boolean;
  onDismissBanner: () => void;
  tasteDriftRanges: TasteDriftRange[] | null;
  trackDurations: number[];
  explicitCount: number;
  totalProcessed: number;
  recentPlayedTimes: string[];
  earliestSavedAt: string | null;
  latestSavedAt: string | null;
}

export default function YourEarTab(props: YourEarTabProps) {
  const {
    user, heardTracks, heardArtists, allGenres, sources,
    basicsStatus, libraryStatus, playlistsStatus, genresStatus, discographyStatus,
    phaseError, warnings,
    loadLibrary, loadGenres, loadDiscography, loadMainstream,
    handleRefresh, loadBasics,
    timeline, stats, genreRadar, explorerScore, explorerLabel,
    trackPopularities, mainstreamResult, mainstreamStatus,
    discographyAlbums, discographyArtistsScanned,
    onGenreClick, onDecadeClick,
    bannerDismissed, onDismissBanner,
    tasteDriftRanges,
    trackDurations, explicitCount, totalProcessed,
    recentPlayedTimes, earliestSavedAt, latestSavedAt,
  } = props;

  // Derived metrics from enriched data
  const avgDurationMs = trackDurations.length > 0
    ? Math.round(trackDurations.reduce((a, b) => a + b, 0) / trackDurations.length)
    : 0;
  const totalDurationMs = trackDurations.reduce((a, b) => a + b, 0);
  const explicitPercent = totalProcessed > 0 ? Math.round((explicitCount / totalProcessed) * 100) : 0;

  const listeningByHour = computeListeningByHour(recentPlayedTimes);

  const libraryAgeLabel = earliestSavedAt ? formatLibraryAge(earliestSavedAt) : null;

  return (
    <>
      {/* Hero */}
      <section className="text-center pt-4 pb-2">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          {user?.name ? `${user.name.split(' ')[0]}'s` : 'Your'} <span className="text-green-400">Ear</span>
        </h1>
        <div className="flex items-center justify-center gap-1 text-zinc-500 text-xs font-mono tracking-wider">
          <span>{heardTracks.size.toLocaleString()} tracks</span>
          <InfoTooltip
            text="Unique tracks found across your top tracks (short/medium/long-term), recently played, saved library, and owned playlists."
            detail="Each track is counted once even if it appears in multiple sources."
          />
          <span>&middot; {heardArtists.size.toLocaleString()} artists</span>
          <InfoTooltip
            text="Unique artists across all your tracked music. Includes artists from top tracks, saved library, playlists, and followed artists."
          />
          {allGenres.length > 0 && (
            <>
              <span>&middot; {allGenres.length} genres</span>
              <InfoTooltip
                text="Genres identified from your artists' Spotify profiles plus our genre probe analysis, which searches Spotify for genre-tagged tracks matching your artists."
                detail="Spotify's dev API sometimes returns empty genre arrays, so we supplement with search-based detection."
              />
            </>
          )}
        </div>
      </section>

      {/* Warnings */}
      {warnings.length > 0 && (
        <section className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-yellow-400 text-lg">&#x26A0;</span>
            <div className="flex-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-yellow-300/80 text-sm">{w}</p>
              ))}
              <button
                onClick={() => loadBasics()}
                className="mt-2 text-xs px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition-colors"
              >
                Retry basics
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Data loaders — prominent onboarding when incomplete, collapsed when done */}
      {libraryStatus === 'done' && genresStatus === 'done' && discographyStatus === 'done' ? (
        <div className="flex items-center justify-center">
          <button
            onClick={handleRefresh}
            className="text-[10px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            [refresh all data]
          </button>
        </div>
      ) : (
        <section className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-zinc-200 tracking-tight mb-1">Build Your Profile</h2>
            <p className="text-zinc-500 text-xs max-w-md mx-auto">
              Run these three steps to unlock all of earlove&apos;s features. Each step scans a different part of your Spotify data.
            </p>
          </div>
          <div className="space-y-2">
            <OnboardingStep
              step={1}
              label="Scan Library"
              description="Index your saved and liked tracks"
              status={libraryStatus}
              doneLabel={sources.savedTotal > 0 ? `${sources.savedTotal.toLocaleString()} tracks indexed` : '0 tracks found'}
              onClick={loadLibrary}
            />
            <OnboardingStep
              step={2}
              label="Analyze Genres"
              description="Map your genre DNA, explorer score, and blind spots"
              status={heardArtists.size === 0 ? 'idle' : genresStatus}
              doneLabel={allGenres.length > 0 ? `${allGenres.length} genres mapped` : '0 genres'}
              onClick={loadGenres}
              disabled={heardArtists.size === 0}
              lockedReason={heardArtists.size === 0 ? 'complete step 1 first' : undefined}
            />
            <OnboardingStep
              step={3}
              label="Scan Discographies"
              description="Find unheard albums from your top artists"
              status={genresStatus !== 'done' ? 'idle' : discographyStatus}
              doneLabel={discographyAlbums.length > 0 ? `${discographyAlbums.length} albums found` : 'no gaps found'}
              onClick={loadDiscography}
              disabled={genresStatus !== 'done'}
              lockedReason={genresStatus !== 'done' ? 'complete step 2 first' : undefined}
            />
          </div>
          {phaseError && (libraryStatus === 'error' || playlistsStatus === 'error' || genresStatus === 'error' || discographyStatus === 'error') && (
            <p className="text-red-400/70 text-[10px] font-mono text-center">{phaseError}</p>
          )}
          <div className="text-center">
            <button
              onClick={handleRefresh}
              className="text-[10px] font-mono text-zinc-700 hover:text-zinc-500 transition-colors"
            >
              [refresh all]
            </button>
          </div>
        </section>
      )}

      {/* Personality banner */}
      {!bannerDismissed && (
        <section className="relative border border-dashed border-zinc-800/60 rounded-xl px-5 py-4">
          <button
            onClick={onDismissBanner}
            className="absolute top-2.5 right-3 text-zinc-700 hover:text-zinc-500 transition-colors text-sm leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
          <p className="text-zinc-400 text-xs leading-relaxed pr-4">
            <span className="text-green-400 font-medium">psst.</span>{' '}
            earlove runs on Spotify&apos;s dev API, which is kind of like borrowing your friend&apos;s Netflix password &mdash;
            it works, but there are house rules. 5 users max, some data gets withheld (playlists, genre tags),
            and if you click too fast, Spotify puts us in timeout. What you see here is our best interpretation
            of what they&apos;ll actually share with us. We work with what we&apos;ve got.
          </p>
          {heardTracks.size > 0 && (
            <p className="text-zinc-600 mt-2 text-[10px] leading-relaxed font-mono">
              data sources: top tracks (4wk + 6mo + all-time), last 50 plays,
              {sources.savedTotal > 0 ? ` ${sources.savedTotal.toLocaleString()} saved tracks` : ' saved library (not scanned)'}
              {' '}&middot; songs you heard at parties and never saved? those slipped through.
            </p>
          )}
        </section>
      )}

      {/* Scores row (Timeline + Explorer) */}
      {(timeline.length > 0 || trackPopularities.length > 0) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {timeline.length > 0 && (
            <div className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-5">
              <div className="flex items-center justify-center gap-1 mb-1">
                <h3 className="text-sm font-bold text-zinc-300 tracking-tight">
                  Music by Decade
                </h3>
                <InfoTooltip
                  text="Distribution of your tracks by their album release decade. Based on release_date from Spotify's track metadata."
                  detail="Tracks without release dates are excluded. Tap any decade bar to discover more music from that era."
                />
              </div>
              <p className="text-xs text-zinc-400 text-center mb-4">tap a decade to discover tracks from that era</p>
              <Timeline data={timeline} medianYear={stats.medianYear} onDecadeClick={onDecadeClick} />
              {stats.peakDecade && (
                <p className="text-center text-[10px] text-zinc-600 mt-3 font-mono">
                  peak era: <span className="text-zinc-400">{stats.peakDecade}</span>
                  {stats.medianYear && (
                    <>
                      <span className="mx-1.5">&middot;</span>
                      median: <span className="text-zinc-400">{stats.medianYear}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {genresStatus === 'done' && genreRadar.length > 0 && (
            <div className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-5 flex flex-col items-center">
              <div className="flex items-center gap-1 mb-4">
                <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.2em]">
                  Explorer Score
                </h3>
                <InfoTooltip
                  text="Measures how diverse and evenly spread your listening is across genres. Combines Shannon entropy (how evenly distributed, 60% weight) with genre breadth (how many genres out of 30, 40% weight)."
                  detail="80+ Sonic Nomad · 65+ Adventurous Ear · 45+ Curious Listener · 25+ Comfort Cruiser · <25 Deep Specialist"
                />
              </div>
              <ExplorerScore
                score={explorerScore}
                label={explorerLabel}
                totalGenres={allGenres.length}
                totalArtists={heardArtists.size}
              />
            </div>
          )}
        </section>
      )}

      {/* Listening DNA — enriched metrics from existing API data */}
      {(trackDurations.length > 0 || listeningByHour.length > 0 || libraryAgeLabel) && (
        <section className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-5">
          <div className="flex items-center justify-center gap-1 mb-5">
            <h3 className="text-sm font-bold text-zinc-300 tracking-tight">
              Listening DNA
            </h3>
            <InfoTooltip
              text="Additional insights extracted from data Spotify already includes in your track and library responses — no extra API calls needed."
              detail="Duration, explicit flags, play timestamps, and library save dates are all free fields in existing responses."
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {avgDurationMs > 0 && (
              <MetricCard
                value={formatDuration(avgDurationMs)}
                label="avg track length"
                tooltip="Average duration across all unique tracks in your profile. Calculated from Spotify's duration_ms field."
              />
            )}
            {totalDurationMs > 0 && (
              <MetricCard
                value={formatTotalTime(totalDurationMs)}
                label="est. total playtime"
                tooltip="Sum of all unique track durations in your profile. This is a lower bound — it doesn't count repeated listens."
                detail="Based on unique tracks only, not total plays."
              />
            )}
            {totalProcessed > 0 && (
              <MetricCard
                value={`${explicitPercent}%`}
                label="explicit"
                tooltip="Percentage of your tracks flagged as explicit by Spotify."
              />
            )}
            {libraryAgeLabel && (
              <MetricCard
                value={libraryAgeLabel}
                label="oldest save"
                tooltip="How long ago you saved your oldest track in your library. Based on the added_at timestamp from Spotify's saved tracks endpoint."
                detail={earliestSavedAt ? `First save: ${new Date(earliestSavedAt).toLocaleDateString()}` : undefined}
              />
            )}
          </div>

          {/* Listening time-of-day heatmap */}
          {listeningByHour.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-center gap-1 mb-3">
                <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.15em]">
                  When You Listen
                </h4>
                <InfoTooltip
                  text="Distribution of your last 50 plays by hour of day (your local time). Based on the played_at timestamp from Spotify's recently-played endpoint."
                  detail="Only reflects your most recent listening session — Spotify limits this to 50 plays."
                />
              </div>
              <HourHeatmap data={listeningByHour} />
            </div>
          )}
        </section>
      )}

      {/* Taste Drift */}
      {tasteDriftRanges && tasteDriftRanges.length > 0 && (
        <TasteDriftSection ranges={tasteDriftRanges} />
      )}

      {/* Mainstream Analysis */}
      <section className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-5">
        <div className="flex items-center justify-center gap-1 mb-1">
          <h3 className="text-sm font-bold text-zinc-300 tracking-tight">
            How Mainstream Are You?
          </h3>
          <InfoTooltip
            text="Compares your library against Spotify's top search results for each of your genres. Spotify's search ranking reflects popularity, so the first results are the most-played tracks."
            detail="Overlap = tracks you've heard + tracks by artists you know (weighted 0.5x). Score is a weighted average across genres. 70+ Chart Chaser · 55+ Crowd Favorite · 40+ Balanced · 25+ Crate Digger · <25 Deep Underground"
          />
        </div>

        {mainstreamResult ? (
          <>
            <p className="text-xs text-zinc-400 text-center mb-5">
              we searched spotify&apos;s top results for your {mainstreamResult.genres.length} genres and checked how much you already knew
            </p>

            <div className="text-center mb-6">
              <div className={`text-4xl font-bold ${
                mainstreamResult.overallScore >= 55 ? 'text-blue-400' :
                mainstreamResult.overallScore >= 35 ? 'text-purple-400' : 'text-orange-400'
              }`}>
                {mainstreamResult.overallScore}
              </div>
              <div className="text-zinc-500 text-xs mt-1">{mainstreamResult.label}</div>
              <p className="text-[10px] text-zinc-600 font-mono mt-1">
                {mainstreamResult.totalOverlap} of {mainstreamResult.totalSearched} popular tracks were already in your library
              </p>
            </div>

            <div className="space-y-2.5">
              {mainstreamResult.genres.map((g) => (
                <div key={g.genre} className="group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-400 font-medium">{g.genre}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">
                      {g.overlapPercent}%
                      {g.heardTracks > 0 && (
                        <span className="text-zinc-700"> · {g.heardTracks} heard</span>
                      )}
                      {g.knownArtistTracks > 0 && (
                        <span className="text-zinc-700"> · {g.knownArtistTracks} known artists</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        g.overlapPercent >= 60 ? 'bg-blue-500/60' :
                        g.overlapPercent >= 30 ? 'bg-purple-500/60' : 'bg-orange-500/60'
                      }`}
                      style={{ width: `${Math.max(g.overlapPercent, 2)}%` }}
                    />
                  </div>
                  {g.unheardExamples.length > 0 && (
                    <div className="mt-1.5 hidden group-hover:block">
                      <p className="text-[9px] text-zinc-600 font-mono mb-1">popular tracks you haven&apos;t heard:</p>
                      {g.unheardExamples.map((ex, i) => {
                        const trackId = ex.trackId || extractTrackId(ex.url);
                        return trackId ? (
                          <SpotifyLink
                            key={i}
                            type="track"
                            id={trackId}
                            className="block text-[10px] text-zinc-500 hover:text-green-400 font-mono truncate"
                          >
                            {ex.name} — {ex.artist}
                          </SpotifyLink>
                        ) : (
                          <a
                            key={i}
                            href={ex.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[10px] text-zinc-500 hover:text-green-400 font-mono truncate"
                          >
                            {ex.name} — {ex.artist}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : genresStatus === 'done' && allGenres.length > 0 ? (
          <div className="text-center mt-3 space-y-3">
            <p className="text-[10px] text-zinc-600 font-mono">
              we&apos;ll compare your library against spotify&apos;s most popular tracks in each of your genres
            </p>
            <button
              onClick={loadMainstream}
              disabled={mainstreamStatus === 'loading'}
              className={`
                px-4 py-2 rounded-lg text-xs font-medium transition-all border
                ${mainstreamStatus === 'loading'
                  ? 'bg-zinc-800/30 border-zinc-700/30 text-zinc-500 cursor-wait'
                  : 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20 cursor-pointer'
                }
              `}
            >
              {mainstreamStatus === 'loading' ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3 w-3 border-b border-green-500" />
                  analyzing {allGenres.length > 8 ? 8 : allGenres.length} genres...
                </span>
              ) : mainstreamStatus === 'error' ? (
                'retry analysis'
              ) : (
                'run the test'
              )}
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-zinc-600 text-center mt-3 font-mono">
            analyze your genres first to unlock this
          </p>
        )}
      </section>

      {/* Genre Radar */}
      {genresStatus === 'done' && genreRadar.length > 0 && (
        <section className="flex flex-col items-center -mx-6 sm:-mx-10 md:-mx-16 py-8">
          <div className="flex items-center gap-1 mb-2">
            <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.2em]">
              Genre Radar
            </h3>
            <InfoTooltip
              text="Your top 10 genres visualized by relative weight. The size of each point reflects how many of your artists are tagged with that genre, normalized against your top genre."
              detail="Click any genre to discover new tracks in that style."
            />
          </div>
          <RadarChart data={genreRadar} size={580} onGenreClick={onGenreClick} />
        </section>
      )}

      {/* Share Card */}
      {genresStatus === 'done' && (
        <section className="border-t border-zinc-800/20 pt-6">
          <ShareCard
            userName={user?.name ?? ''}
            explorerScore={explorerScore}
            explorerLabel={explorerLabel}
            mainstreamScore={mainstreamResult?.overallScore ?? 0}
            mainstreamLabel={mainstreamResult?.label ?? ''}
            topGenres={allGenres.slice(0, 6).map((g) => g.genre)}
            totalTracks={heardTracks.size}
            totalArtists={heardArtists.size}
            totalGenres={allGenres.length}
            peakDecade={stats.peakDecade}
            medianYear={stats.medianYear}
          />
        </section>
      )}
    </>
  );
}

function extractTrackId(url: string): string | null {
  const m = url.match(/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// ─── Enriched metric helpers ──────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatTotalTime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  }
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatLibraryAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const years = Math.floor(diff / (365.25 * 86_400_000));
  if (years >= 1) return `${years}y`;
  const months = Math.floor(diff / (30.44 * 86_400_000));
  return months > 0 ? `${months}mo` : '<1mo';
}

function computeListeningByHour(timestamps: string[]): { hour: number; count: number }[] {
  if (timestamps.length === 0) return [];
  const counts = new Array(24).fill(0);
  for (const ts of timestamps) {
    const hour = new Date(ts).getHours();
    counts[hour]++;
  }
  const hasData = counts.some(c => c > 0);
  if (!hasData) return [];
  return counts.map((count, hour) => ({ hour, count }));
}

function MetricCard({ value, label, tooltip, detail }: {
  value: string;
  label: string;
  tooltip: string;
  detail?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold text-white">{value}</p>
      <div className="flex items-center justify-center gap-0.5">
        <p className="text-[10px] text-zinc-500">{label}</p>
        <InfoTooltip text={tooltip} detail={detail} />
      </div>
    </div>
  );
}

function HourHeatmap({ data }: { data: { hour: number; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const labels = ['12a', '', '', '3a', '', '', '6a', '', '', '9a', '', '', '12p', '', '', '3p', '', '', '6p', '', '', '9p', '', ''];

  return (
    <div className="flex items-end gap-px h-12 justify-center">
      {data.map(({ hour, count }) => {
        const intensity = count / maxCount;
        const bg = count === 0
          ? 'bg-zinc-800/40'
          : intensity >= 0.7
            ? 'bg-green-400'
            : intensity >= 0.3
              ? 'bg-green-500/60'
              : 'bg-green-600/30';

        return (
          <div key={hour} className="flex flex-col items-center group" style={{ width: '100%', maxWidth: 20 }}>
            <div
              className={`w-full rounded-sm ${bg} transition-all group-hover:ring-1 group-hover:ring-green-400/40`}
              style={{ height: `${Math.max(count === 0 ? 15 : (intensity * 100), 15)}%`, minHeight: 4 }}
              title={`${hour === 0 ? '12' : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'am' : 'pm'}: ${count} play${count !== 1 ? 's' : ''}`}
            />
            {labels[hour] && (
              <span className="text-[7px] text-zinc-600 mt-1 font-mono">{labels[hour]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Taste Drift Section ─────────────────────────────────────

function TasteDriftSection({ ranges }: { ranges: TasteDriftRange[] }) {
  const rangeMap = new Map(ranges.map((r) => [r.id, r]));
  const short = rangeMap.get('short');
  const long = rangeMap.get('long');

  if (!short || !long) return null;

  const shortGenres = new Set(short.genres);
  const longGenres = new Set(long.genres);

  const emerging = short.genres.filter((g) => !longGenres.has(g));
  const fading = long.genres.filter((g) => !shortGenres.has(g));

  if (emerging.length === 0 && fading.length === 0) return null;

  return (
    <section className="bg-zinc-900/30 border border-zinc-800/30 rounded-xl p-5">
      <div className="flex items-center justify-center gap-1 mb-1">
        <h3 className="text-sm font-bold text-zinc-300 tracking-tight">
          Taste Drift
        </h3>
        <InfoTooltip
          text="Compares genres from your top artists in the last 4 weeks vs. all-time. 'Rising' genres appear in recent listening but not in your all-time profile. 'Fading' genres are in your all-time but absent from recent plays."
          detail="Based on Spotify's short_term (4 weeks) and long_term (all-time) top artist data."
        />
      </div>
      <p className="text-[10px] text-zinc-600 text-center mb-5 font-mono">
        how your genre palette is shifting over time
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {emerging.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold text-green-400/80 uppercase tracking-[0.2em] mb-2">
              Rising in your rotation
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {emerging.slice(0, 8).map((g) => (
                <span key={g} className="px-2.5 py-1 rounded-full text-[10px] bg-green-500/10 text-green-400 border border-green-500/20">
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}
        {fading.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.2em] mb-2">
              Fading from recent plays
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {fading.slice(0, 8).map((g) => (
                <span key={g} className="px-2.5 py-1 rounded-full text-[10px] bg-zinc-800/60 text-zinc-500 border border-zinc-700/30">
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Phase Button ─────────────────────────────────────────────

function PhaseButton({
  label, description, status, doneLabel, onClick, disabled,
}: {
  label: string;
  description: string;
  status: PhaseStatus;
  doneLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const isDisabled = disabled || status === 'loading' || status === 'done';
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        px-3.5 py-3 rounded-lg text-left transition-all border
        ${status === 'done'
          ? 'bg-green-500/5 border-green-500/20 cursor-default'
          : status === 'loading'
            ? 'bg-zinc-800/30 border-zinc-800/50 cursor-wait'
            : status === 'error'
              ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10 cursor-pointer'
              : disabled
                ? 'bg-zinc-900/20 border-zinc-800/20 cursor-not-allowed opacity-40'
                : 'bg-zinc-900/30 border-zinc-800/30 hover:border-zinc-700/50 hover:bg-zinc-800/30 cursor-pointer'
        }
      `}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-xs font-medium ${status === 'done' ? 'text-green-400/80' : 'text-zinc-300'}`}>
          {label}
        </span>
        {status === 'loading' && (
          <div className="animate-spin rounded-full h-3 w-3 border-b border-green-500" />
        )}
        {status === 'done' && (
          <span className="text-green-500/60 text-[10px]">{'\u2713'}</span>
        )}
        {status === 'error' && (
          <span className="text-red-400/60 text-[10px] font-mono">retry</span>
        )}
      </div>
      <p className={`text-[10px] ${status === 'done' ? 'text-green-500/40 font-mono' : 'text-zinc-600'}`}>
        {status === 'done' ? doneLabel : description}
      </p>
    </button>
  );
}

// ─── Onboarding Step ──────────────────────────────────────────

function OnboardingStep({
  step, label, description, status, doneLabel, onClick, disabled, lockedReason,
}: {
  step: number;
  label: string;
  description: string;
  status: PhaseStatus;
  doneLabel: string;
  onClick: () => void;
  disabled?: boolean;
  lockedReason?: string;
}) {
  const isDone = status === 'done';
  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isLocked = disabled && !isDone && !isLoading;

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading || isDone}
      className={`
        w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-left transition-all border
        ${isDone
          ? 'bg-green-500/5 border-green-500/15'
          : isLoading
            ? 'bg-zinc-800/30 border-zinc-700/40 cursor-wait'
            : isError
              ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10 cursor-pointer'
              : isLocked
                ? 'bg-zinc-900/20 border-zinc-800/20 cursor-not-allowed opacity-50'
                : 'bg-green-500/5 border-green-500/20 hover:bg-green-500/10 hover:border-green-500/30 cursor-pointer'
        }
      `}
    >
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
        ${isDone
          ? 'bg-green-500/20 text-green-400'
          : isLoading
            ? 'bg-zinc-700/40 text-zinc-400'
            : isLocked
              ? 'bg-zinc-800/40 text-zinc-600'
              : 'bg-green-500/15 text-green-400'
        }
      `}>
        {isDone ? '\u2713' : isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-500" />
        ) : step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isDone ? 'text-green-400/80' : isLocked ? 'text-zinc-500' : 'text-zinc-200'}`}>
            {label}
          </span>
          {isError && (
            <span className="text-[10px] text-red-400/70 font-mono">tap to retry</span>
          )}
        </div>
        <p className={`text-[10px] ${isDone ? 'text-green-500/40 font-mono' : 'text-zinc-500'}`}>
          {isDone ? doneLabel : isLocked && lockedReason ? lockedReason : description}
        </p>
      </div>
      {!isDone && !isLoading && !isLocked && (
        <span className="text-green-400/60 text-xs font-mono flex-shrink-0">run &rarr;</span>
      )}
    </button>
  );
}
