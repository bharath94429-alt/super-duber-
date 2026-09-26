import React from 'react';
import { ArrowRight, Clock, AlertTriangle, HelpCircle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface ParticipantInstructionsProps {
  participantName: string;
  participantId: string;
  department?: string;
  timeLimitMinutes: number;
  totalQuestions: number;
  onStart: () => void;
}

export const ParticipantInstructions: React.FC<ParticipantInstructionsProps> = ({
  participantName,
  participantId,
  department,
  timeLimitMinutes,
  totalQuestions,
  onStart
}) => {
  return (
    <div className="w-full max-w-lg mx-auto px-4 py-8">
      {/* Participant info badge */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-7">
        <div className="border-b border-stone-100 pb-4 mb-5">
          <span className="text-xs uppercase font-mono tracking-wider text-stone-600 block mb-1">
            Registered Candidate
          </span>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">{participantName}</h2>
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
            <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center font-bold text-stone-700 text-sm font-mono">
              {participantId.slice(0, 3)}
            </div>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-xl font-bold tracking-tight text-stone-900 mb-1">
          Welcome to Tech Test
        </h1>
        <p className="text-xs text-stone-600 mb-6">
          Please review the examination regulations carefully before launching the test.
        </p>

        {/* Key rules */}
        <div className="space-y-3.5 mb-7">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
            <HelpCircle className="w-5 h-5 text-stone-700 shrink-0 mt-0.5" />
            <div className="text-xs text-stone-700">
              <strong className="text-stone-900 font-semibold block mb-0.5">
                {totalQuestions} Multiple-Choice Questions
              </strong>
              Each question has 4 options with exactly one correct answer (+1 mark per correct answer, 0 for wrong/unanswered).
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
            <Clock className="w-5 h-5 text-stone-700 shrink-0 mt-0.5" />
            <div className="text-xs text-stone-700">
              <strong className="text-stone-900 font-semibold block mb-0.5">
                {timeLimitMinutes} Minutes Time Limit
              </strong>
              The countdown runs continuously on the server. The quiz will auto-submit when the countdown reaches 00:00.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
            <CheckCircle2 className="w-5 h-5 text-stone-700 shrink-0 mt-0.5" />
            <div className="text-xs text-stone-700">
              <strong className="text-stone-900 font-semibold block mb-0.5">
                One Question at a Time
              </strong>
              Review your chosen option before advancing. Your selections are automatically saved as you proceed.
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong className="font-semibold block mb-0.5">
                Do Not Switch Tabs or Leave Window
              </strong>
              Browser monitoring actively records tab switches, app minimization, and window blur events in real-time. Repeated violations will trigger an automated disqualification/auto-submit.
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          className="w-full min-h-[50px] py-3 px-5 bg-stone-900 text-white rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.99] transition shadow-sm"
        >
          <span>Start Test</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className="text-[11px] text-stone-600 text-center mt-3.5">
          By clicking Start Test, you agree to adhere to the Technical Day code of conduct.
        </p>
      </div>
    </div>
  );
};
