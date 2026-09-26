import React, { useEffect, useState } from 'react';
import { Trophy, Clock, ShieldAlert, RefreshCw, ArrowLeft, Lock } from 'lucide-react';
import { api } from '../services/api';
import { LeaderboardEntry } from '../shared/types';

interface LeaderboardViewProps {
  onBack: () => void;
  isAdmin?: boolean;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ onBack, isAdmin = false }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLeaderboard();
      setIsPublic(data.leaderboardPublic);
      setEntries(data.leaderboard || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load leaderboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 transition text-stone-700"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
              <span>Leaderboard</span>
              <Trophy className="w-5 h-5 text-stone-700" />
            </h1>
            <p className="text-xs text-stone-600 mt-0.5">
              Ranked by official score and validated completion duration
            </p>
          </div>
        </div>

        <button
          onClick={loadLeaderboard}
          disabled={loading}
          className="p-2 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 transition"
          title="Refresh rankings"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* If hidden by organizer and not admin */}
      {!isPublic && !isAdmin ? (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8 text-center max-w-md mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-700 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-stone-900 mb-1">
            Leaderboard Currently Withheld
          </h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            The event organizers have kept live rankings private until all competition slots conclude. Please check back later.
          </p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-center">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center mx-auto mb-3">
            <Trophy className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-stone-900 mb-1">No Submissions Yet</h3>
          <p className="text-xs text-stone-600 max-w-sm mx-auto">
            As candidates finalize and submit their tests, real-time rankings will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 w-16 text-center">Rank</th>
                  <th className="py-3.5 px-4">Participant</th>
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4 text-center">Score</th>
                  <th className="py-3.5 px-4 text-center">Duration</th>
                  <th className="py-3.5 px-4 text-center">Violations</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {entries.map((entry) => {
                  const isTop3 = entry.rank <= 3;
                  return (
                    <tr
                      key={entry.participantId}
                      className={`hover:bg-stone-50/80 transition-colors ${
                        entry.rank === 1 ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-mono font-bold text-xs ${
                            entry.rank === 1
                              ? 'bg-amber-400 text-stone-950 shadow-xs'
                              : entry.rank === 2
                              ? 'bg-stone-300 text-stone-950'
                              : entry.rank === 3
                              ? 'bg-amber-700/20 text-amber-900'
                              : 'text-stone-600'
                          }`}
                        >
                          {entry.rank}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-stone-900">
                        {entry.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-stone-600">
                        {entry.participantId}
                      </td>
                      <td className="py-3.5 px-4 text-stone-600">
                        {entry.department || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-sm text-stone-900">
                        {entry.score} <span className="text-xs font-normal text-stone-500">/ {entry.totalQuestions}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-stone-700">
                        {entry.completionTimeFormatted}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">
                        {entry.violations > 0 ? (
                          <span className="text-amber-700 font-semibold">{entry.violations}</span>
                        ) : (
                          <span className="text-stone-500">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`text-[11px] font-semibold uppercase ${
                            entry.status === 'flagged'
                              ? 'text-rose-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Rows */}
          <div className="sm:hidden divide-y divide-stone-100">
            {entries.map((entry) => (
              <div key={entry.participantId} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      entry.rank === 1
                        ? 'bg-amber-400 text-stone-950'
                        : entry.rank === 2
                        ? 'bg-stone-300 text-stone-950'
                        : entry.rank === 3
                        ? 'bg-amber-700/20 text-amber-900'
                        : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {entry.rank}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-stone-900">{entry.name}</div>
                    <div className="text-[11px] font-mono text-stone-600 mt-0.5">
                      {entry.participantId} {entry.department && `· ${entry.department}`}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono font-bold text-xs text-stone-900">
                    {entry.score} / {entry.totalQuestions}
                  </div>
                  <div className="text-[11px] font-mono text-stone-600">
                    {entry.completionTimeFormatted}
                  </div>
                  {entry.violations > 0 && (
                    <div className="text-[10px] text-amber-700 font-semibold">
                      {entry.violations} viol.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
