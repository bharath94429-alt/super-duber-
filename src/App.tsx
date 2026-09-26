import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ParticipantRegister } from './components/ParticipantRegister';
import { ParticipantInstructions } from './components/ParticipantInstructions';
import { QuizInterface } from './components/QuizInterface';
import { QuizCompleted } from './components/QuizCompleted';
import { LeaderboardView } from './components/LeaderboardView';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import {
  api,
  checkServerSupabaseConfig,
  getStoredParticipantToken,
  clearStoredParticipantToken,
  getStoredAdminToken,
  clearStoredAdminToken,
  RegisterResponse,
  SessionResponse,
  SubmitResponse
} from './services/api';
import { EventState, SanitizedQuestion } from './shared/types';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'quiz' | 'leaderboard' | 'admin-login' | 'admin-dashboard'>('quiz');
  const [eventState, setEventState] = useState<EventState>('ACTIVE');
  const [totalQuestions, setTotalQuestions] = useState(10);
  const [adminToken, setAdminToken] = useState<string | null>(getStoredAdminToken());

  // Participant Quiz Flow State
  // 'register' -> 'instructions' -> 'taking-quiz' -> 'completed'
  const [quizStep, setQuizStep] = useState<'register' | 'instructions' | 'taking-quiz' | 'completed'>('register');
  const [participantToken, setParticipantToken] = useState<string | null>(getStoredParticipantToken());
  const [participantId, setParticipantId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [department, setDepartment] = useState<string | undefined>('');
  const [questions, setQuestions] = useState<SanitizedQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [violations, setViolations] = useState(0);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(600);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(10);
  const [maxViolations, setMaxViolations] = useState(3);
  const [completedResult, setCompletedResult] = useState<SubmitResponse | null>(null);

  const [loadingInitialSession, setLoadingInitialSession] = useState(true);

  // Fetch initial event status and resume session if token exists
  useEffect(() => {
    const initApp = async () => {
      try {
        await checkServerSupabaseConfig();
        const status = await api.getEventStatus();
        setEventState(status.settings.state);
        setTotalQuestions(status.totalQuestions);
        setTimeLimitMinutes(status.settings.timeLimitMinutes);
        setMaxViolations(status.settings.maxViolations);

        // Check if there is an active participant session in storage
        const savedToken = getStoredParticipantToken();
        if (savedToken) {
          try {
            const sess = await api.getSession(savedToken);
            setParticipantToken(savedToken);
            setParticipantId(sess.participant.participantId);
            setParticipantName(sess.participant.name);
            setDepartment(sess.participant.department);
            setQuestions(sess.questions);
            setAnswers(sess.participant.answers || {});
            setViolations(sess.participant.violations || 0);
            setTimeRemainingSeconds(sess.timeRemainingSeconds);
            setTimeLimitMinutes(sess.timeLimitMinutes);
            setMaxViolations(sess.maxViolations);

            if (sess.participant.status === 'submitted' || sess.participant.status === 'flagged') {
              setCompletedResult({
                ok: true,
                score: sess.participant.score || 0,
                totalQuestions: sess.questions.length,
                correctCount: sess.participant.correctCount || 0,
                wrongCount: sess.participant.wrongCount || 0,
                unansweredCount: sess.participant.unansweredCount || 0,
                completionDurationSeconds: sess.participant.completionDurationSeconds || 0,
                status: sess.participant.status,
                violations: sess.participant.violations
              });
              setQuizStep('completed');
            } else {
              setQuizStep('taking-quiz');
            }
          } catch (err) {
            // Invalid or expired token
            clearStoredParticipantToken();
            setParticipantToken(null);
            setQuizStep('register');
          }
        }
      } catch (err) {
        console.error('Initial status fetch error:', err);
      } finally {
        setLoadingInitialSession(false);
      }
    };

    initApp();
  }, []);

  // Handle successful registration
  const handleRegisterSuccess = (res: RegisterResponse) => {
    setParticipantToken(res.token);
    setParticipantId(res.participant.participantId);
    setParticipantName(res.participant.name);
    setDepartment(res.participant.department);
    setQuestions(res.questions);
    setAnswers(res.participant.answers || {});
    setViolations(res.participant.violations || 0);
    setTimeRemainingSeconds(res.timeRemainingSeconds);
    setTimeLimitMinutes(res.timeLimitMinutes);
    setQuizStep('instructions');
  };

  // Start taking quiz from instructions
  const handleStartQuiz = () => {
    if (participantToken) {
      api.recordViolation(participantToken, 'started', 0).catch(() => {});
    }
    setQuizStep('taking-quiz');
  };

  // Handle quiz submission success
  const handleSubmitSuccess = (result: SubmitResponse) => {
    setCompletedResult(result);
    setQuizStep('completed');
  };

  // Participant finishes receipt view
  const handleDoneSession = () => {
    clearStoredParticipantToken();
    setParticipantToken(null);
    setCompletedResult(null);
    setAnswers({});
    setViolations(0);
    setQuizStep('register');
  };

  // Admin login success
  const handleAdminLoginSuccess = (token: string) => {
    setAdminToken(token);
    setCurrentView('admin-dashboard');
  };

  // Admin logout
  const handleAdminLogout = () => {
    clearStoredAdminToken();
    setAdminToken(null);
    setCurrentView('quiz');
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans selection:bg-stone-200">
      {/* Navbar */}
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'admin-dashboard' && !adminToken) {
            setCurrentView('admin-login');
          } else {
            setCurrentView(view);
          }
        }}
        isAdminLoggedIn={Boolean(adminToken)}
        onAdminLogout={handleAdminLogout}
        eventState={eventState}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {loadingInitialSession ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-stone-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* View: Admin Login */}
            {currentView === 'admin-login' && (
              <AdminLogin
                onLoginSuccess={handleAdminLoginSuccess}
                onCancel={() => setCurrentView('quiz')}
              />
            )}

            {/* View: Admin Dashboard */}
            {currentView === 'admin-dashboard' && adminToken && (
              <AdminDashboard
                adminToken={adminToken}
                onLogout={handleAdminLogout}
              />
            )}

            {/* View: Leaderboard */}
            {currentView === 'leaderboard' && (
              <LeaderboardView
                onBack={() => setCurrentView('quiz')}
                isAdmin={Boolean(adminToken)}
              />
            )}

            {/* View: Participant Quiz */}
            {currentView === 'quiz' && (
              <div className="flex-1">
                {quizStep === 'register' && (
                  <ParticipantRegister
                    onSuccess={handleRegisterSuccess}
                    eventState={eventState}
                  />
                )}

                {quizStep === 'instructions' && (
                  <ParticipantInstructions
                    participantName={participantName}
                    participantId={participantId}
                    department={department}
                    timeLimitMinutes={timeLimitMinutes}
                    totalQuestions={questions.length || totalQuestions}
                    onStart={handleStartQuiz}
                  />
                )}

                {quizStep === 'taking-quiz' && participantToken && (
                  <QuizInterface
                    token={participantToken}
                    participantId={participantId}
                    participantName={participantName}
                    questions={questions}
                    initialAnswers={answers}
                    initialViolations={violations}
                    initialTimeRemainingSeconds={timeRemainingSeconds}
                    timeLimitMinutes={timeLimitMinutes}
                    maxViolations={maxViolations}
                    onSubmitSuccess={handleSubmitSuccess}
                  />
                )}

                {quizStep === 'completed' && completedResult && (
                  <QuizCompleted
                    participantName={participantName}
                    participantId={participantId}
                    department={department}
                    result={completedResult}
                    onViewLeaderboard={() => setCurrentView('leaderboard')}
                    onDone={handleDoneSession}
                  />
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Clean minimal examination footer */}
      <footer className="border-t border-stone-200/80 bg-white py-4 mt-auto">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-stone-600">
          <div>
            <strong className="text-stone-900 font-semibold">Tech Test</strong> · Technical Quiz Competition
          </div>
          <div className="flex items-center gap-3">
            <span>Authoritative Live Monitoring</span>
            <span>·</span>
            <button
              onClick={() => {
                if (adminToken) {
                  setCurrentView('admin-dashboard');
                } else {
                  setCurrentView('admin-login');
                }
              }}
              className="text-stone-700 hover:text-stone-950 underline underline-offset-2"
            >
              Organizer Access
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
