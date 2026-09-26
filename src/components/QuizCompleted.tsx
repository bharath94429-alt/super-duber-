import React from 'react';
import { CheckCircle2, Trophy, Clock, ShieldAlert, Award, ArrowRight } from 'lucide-react';
import { SubmitResponse } from '../services/api';

interface QuizCompletedProps {
  participantName: string;
  participantId: string;
  department?: string;
  result: SubmitResponse;
  onViewLeaderboard: () => void;
  onDone: () => void;
}

export const QuizCompleted: React.FC<QuizCompletedProps> = ({
  participantName,
  participantId,
  department,
  result,
  onViewLeaderboard,
  onDone
}) => {
  const formatTime = (seconds: number | null) => {
    if (!seconds) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isFlagged = result.status === 'flagged' || result.violations >= 3;

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-7 text-stone-900">
        {/* Status header */}
        <div className="text-center mb-6">
          <div
            className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-3 ${
              isFlagged ? 'bg-amber-100 text-amber-800' : 'bg-stone-900 text-white'
            }`}
          >
            {isFlagged ? <ShieldAlert className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
          </div>

          <h1 className="text-xl font-bold tracking-tight">
            {isFlagged ? 'Test Concluded & Flagged' : 'Test Submitted Successfully'}
          </h1>
          <p className="text-xs text-stone-600 mt-1">
            {isFlagged
              ? 'Your submission was flagged due to browser tab-switch violations.'
              : 'Your responses have been validated and recorded on the server.'}
          </p>
        </div>

        {/* Candidate Details */}
        <div className="p-4 rounded-xl bg-stone-50 border border-stone-100 mb-6">
          <div className="text-xs text-stone-600 uppercase font-mono tracking-wider mb-1">
            Participant Summary
          </div>
          <div className="font-bold text-sm text-stone-900">{participantName}</div>
          <div className="flex items-center gap-2 text-xs text-stone-600 mt-0.5">
            <span className="font-mono font-medium">{participantId}</span>
            {department && (
              <>
                <span>·</span>
                <span>{department}</span>
              </>
            )}
          </div>
        </div>

        {/* Score & Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-4 rounded-xl border border-stone-200 text-center">
            <div className="text-[11px] font-medium text-stone-600 uppercase tracking-wide">
              Official Score
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-stone-900 mt-1">
              {result.score} <span className="text-sm font-normal text-stone-600">/ {result.totalQuestions}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 text-center">
            <div className="text-[11px] font-medium text-stone-600 uppercase tracking-wide">
              Completion Time
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-stone-900 mt-1">
              {formatTime(result.completionDurationSeconds)}
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2 text-xs border-t border-b border-stone-100 py-3.5 mb-6 text-stone-600">
          <div className="flex justify-between">
            <span>Correct Answers</span>
            <span className="font-mono font-semibold text-emerald-800">+{result.correctCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Incorrect Answers</span>
            <span className="font-mono font-semibold text-rose-800">-{result.wrongCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Unanswered Questions</span>
            <span className="font-mono font-semibold text-stone-700">{result.unansweredCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Tab Switch Violations</span>
            <span
              className={`font-mono font-semibold ${
                result.violations > 0 ? 'text-amber-800' : 'text-stone-700'
              }`}
            >
              {result.violations}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onViewLeaderboard}
            className="w-full min-h-[46px] py-2.5 px-4 bg-stone-900 text-white rounded-xl text-xs sm:text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.99] transition shadow-sm"
          >
            <Trophy className="w-4 h-4" />
            <span>View Live Leaderboard</span>
          </button>

          <button
            type="button"
            onClick={onDone}
            className="w-full min-h-[44px] py-2.5 px-4 border border-stone-200 rounded-xl text-xs sm:text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
          >
            <span>Exit Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
