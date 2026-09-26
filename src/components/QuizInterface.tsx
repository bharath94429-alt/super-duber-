import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  ShieldAlert,
  WifiOff
} from 'lucide-react';
import { SanitizedQuestion } from '../shared/types';
import { api, SubmitResponse } from '../services/api';

interface QuizInterfaceProps {
  token: string;
  participantId: string;
  participantName: string;
  questions: SanitizedQuestion[];
  initialAnswers: Record<number, number>;
  initialViolations: number;
  initialTimeRemainingSeconds: number;
  timeLimitMinutes: number;
  maxViolations: number;
  onSubmitSuccess: (result: SubmitResponse) => void;
}

export const QuizInterface: React.FC<QuizInterfaceProps> = ({
  token,
  participantId,
  participantName,
  questions,
  initialAnswers,
  initialViolations,
  initialTimeRemainingSeconds,
  timeLimitMinutes,
  maxViolations,
  onSubmitSuccess
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>(initialAnswers || {});
  const [secondsRemaining, setSecondsRemaining] = useState(initialTimeRemainingSeconds);
  const [violations, setViolations] = useState(initialViolations);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [savingAnswer, setSavingAnswer] = useState(false);

  // Reference to current question index for event handlers without stale closures
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;

  const violationsRef = useRef(violations);
  violationsRef.current = violations;

  // Handle final submission
  const performSubmission = useCallback(
    async (isAuto = false) => {
      if (isSubmittingRef.current) return;
      setIsSubmitting(true);
      setShowConfirmModal(false);

      try {
        const result = await api.submitTest(token);
        onSubmitSuccess(result);
      } catch (err: any) {
        console.error('Submission error:', err);
        // Even if network fails, attempt fallback session fetch
        try {
          const sess = await api.getSession(token);
          if (sess.participant.status === 'submitted' || sess.participant.status === 'flagged') {
            onSubmitSuccess({
              ok: true,
              score: sess.participant.score || 0,
              totalQuestions: questions.length,
              correctCount: sess.participant.correctCount || 0,
              wrongCount: sess.participant.wrongCount || 0,
              unansweredCount: sess.participant.unansweredCount || 0,
              completionDurationSeconds: sess.participant.completionDurationSeconds || 0,
              status: sess.participant.status,
              violations: sess.participant.violations
            });
            return;
          }
        } catch {
          // Keep submit state
        }
        setIsSubmitting(false);
        alert(err.message || 'Submission failed. Please check your internet connection and retry.');
      }
    },
    [token, onSubmitSuccess, questions.length]
  );

  // Authoritative countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          performSubmission(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Periodically re-sync remaining seconds with server every 30 seconds
    const syncInterval = setInterval(async () => {
      try {
        const sess = await api.getSession(token);
        setSecondsRemaining(sess.timeRemainingSeconds);
        if (sess.participant.status === 'submitted' || sess.participant.status === 'flagged') {
          performSubmission(true);
        }
      } catch {
        // Ignore background sync errors
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(syncInterval);
    };
  }, [token, performSubmission]);

  // Periodic heartbeat every 10 seconds for real-time presence detection
  useEffect(() => {
    if (!token) return;
    // Send immediate heartbeat on mount
    api.recordHeartbeat(token);

    const hbInterval = setInterval(() => {
      if (!isSubmittingRef.current) {
        api.recordHeartbeat(token);
      }
    }, 10000);

    return () => {
      clearInterval(hbInterval);
    };
  }, [token]);

  // Tab switch & focus monitoring
  const reportViolation = useCallback(
    async (eventType: 'tab_switched' | 'returned_to_test' | 'window_blurred' | 'window_focused') => {
      if (isSubmittingRef.current) return;

      try {
        const res = await api.recordViolation(token, eventType, currentIndexRef.current);
        if (res.ok) {
          setViolations(res.violations);
          if (res.message) {
            setWarningMessage(res.message);
          }
          if (res.autoSubmitted) {
            performSubmission(true);
          }
        }
      } catch (err) {
        console.error('Violation record error:', err);
      }
    },
    [token, performSubmission]
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        reportViolation('tab_switched');
      } else {
        reportViolation('returned_to_test');
      }
    };

    const handleWindowBlur = () => {
      reportViolation('window_blurred');
    };

    const handleWindowFocus = () => {
      reportViolation('window_focused');
    };

    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reportViolation]);

  // Format time remaining mm:ss
  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isLowTime = secondsRemaining <= 120; // less than 2 minutes
  const currentQuestion = questions[currentIndex];
  const selectedOptionIndex = currentQuestion ? answers[currentQuestion.id] : undefined;

  // Handle option selection
  const handleSelectOption = async (optionIndex: number) => {
    if (!currentQuestion || isSubmitting) return;

    // Optimistically update local state immediately
    const updated = { ...answers, [currentQuestion.id]: optionIndex };
    setAnswers(updated);

    // Save to server
    setSavingAnswer(true);
    try {
      await api.recordAnswer(token, currentQuestion.id, optionIndex);
    } catch (err) {
      console.error('Failed to sync answer:', err);
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowConfirmModal(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const totalAnswered = Object.keys(answers).length;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4 sm:py-6">
      {/* Network offline banner */}
      {offline && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500 text-stone-950 font-medium text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Connection offline. Your selections are preserved locally.</span>
          </div>
          <span className="font-mono text-[11px] underline">Retrying...</span>
        </div>
      )}

      {/* Violation Alert Banner */}
      {violations > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-3 text-xs leading-relaxed animate-in fade-in duration-200">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900 mb-0.5">
              Monitoring status: Warning — {violations} {violations === 1 ? 'tab switch' : 'tab switches'} detected
            </div>
            <p className="text-amber-800">
              {warningMessage || 'Warning: Leaving the quiz window has been detected and recorded.'}
              {violations >= maxViolations - 1 && (
                <strong className="block mt-1 text-amber-950 font-semibold">
                  Notice: Reaching {maxViolations} violations will trigger automated test submission.
                </strong>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Examination Top Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase font-mono tracking-wider text-stone-600">
              Tech Test Examination
            </div>
            <div className="text-sm font-bold text-stone-900 mt-0.5">
              Question {currentIndex + 1} of {questions.length}
            </div>
          </div>

          {/* Subtly displayed countdown timer */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs sm:text-sm font-semibold tabular-nums transition-colors ${
              isLowTime
                ? 'bg-amber-50 border-amber-300 text-amber-900 animate-pulse'
                : 'bg-stone-50 border-stone-200 text-stone-800'
            }`}
          >
            <Clock className={`w-4 h-4 ${isLowTime ? 'text-amber-700' : 'text-stone-500'}`} />
            <span>Time remaining: {formatTimer(secondsRemaining)}</span>
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden mt-4">
          <div
            className="bg-stone-900 h-full transition-all duration-300 ease-out"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Question Card */}
      {currentQuestion && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5 sm:p-7 mb-4">
          {/* Question topic */}
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-600 mb-2">
            {currentQuestion.topic}
          </div>

          {/* Question text */}
          <h2 className="text-base sm:text-lg font-semibold text-stone-900 leading-snug mb-6">
            {currentQuestion.text}
          </h2>

          {/* Options */}
          <div className="space-y-3" role="radiogroup" aria-label="Question options">
            {currentQuestion.options.map((optionText, optIdx) => {
              const isSelected = selectedOptionIndex === optIdx;
              const optionLetter = String.fromCharCode(65 + optIdx); // A, B, C, D

              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => handleSelectOption(optIdx)}
                  className={`w-full min-h-[50px] p-3.5 sm:p-4 rounded-xl text-left flex items-start gap-3.5 transition-all active:scale-[0.99] border ${
                    isSelected
                      ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                      : 'bg-stone-50 text-stone-800 border-stone-200 hover:border-stone-300 hover:bg-stone-100/70'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 transition-colors ${
                      isSelected
                        ? 'bg-white text-stone-900'
                        : 'bg-white border border-stone-300 text-stone-600'
                    }`}
                  >
                    {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : optionLetter}
                  </span>
                  <span className="text-xs sm:text-sm font-medium leading-relaxed flex-1">
                    {optionText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0 || isSubmitting}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-stone-200 text-xs sm:text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <div className="text-xs text-stone-600 font-medium hidden sm:block">
          Answered {totalAnswered} of {questions.length}
        </div>

        {currentIndex === questions.length - 1 ? (
          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={isSubmitting}
            className="min-h-[44px] px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-stone-800 active:scale-[0.99] transition flex items-center gap-2 shadow-sm"
          >
            <span>Submit Test</span>
            <Check className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={isSubmitting}
            className="min-h-[44px] px-5 py-2.5 bg-stone-900 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-stone-800 active:scale-[0.99] transition flex items-center gap-2 shadow-sm"
          >
            <span>Next Question</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-sm w-full p-6 text-stone-900 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold tracking-tight mb-2">
              Are you sure you want to submit?
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed mb-4">
              You have answered <strong className="text-stone-900 font-semibold">{totalAnswered}</strong> out of{' '}
              <strong className="text-stone-900 font-semibold">{questions.length}</strong> questions.
              {totalAnswered < questions.length && (
                <span className="block mt-1 text-amber-700 font-medium">
                  Note: {questions.length - totalAnswered} unanswered questions will receive 0 marks.
                </span>
              )}
              Once submitted, answers cannot be modified.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => performSubmission(false)}
                disabled={isSubmitting}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 active:scale-[0.99] transition flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Submit Test</span>
                    <Check className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
