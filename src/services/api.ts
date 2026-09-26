import {
  EventSettings,
  Participant,
  ParticipantSummary,
  Question,
  SanitizedQuestion,
  LeaderboardEntry
} from '../shared/types';
import { DEFAULT_QUIZ_ID, isSupabaseConfigured } from './supabase';
import { supabaseQuizService } from './supabaseQuizService';

const API_BASE = '/api';

export interface RegisterResponse {
  token: string;
  participant: {
    id: string;
    participantId: string;
    name: string;
    department: string;
    status: Participant['status'];
    answers: Record<number, number>;
    violations: number;
    currentQuestionIndex: number;
    startTime: number;
  };
  timeRemainingSeconds: number;
  timeLimitMinutes: number;
  questions: SanitizedQuestion[];
}

export interface SessionResponse {
  participant: {
    id: string;
    participantId: string;
    name: string;
    department: string;
    status: Participant['status'];
    answers: Record<number, number>;
    violations: number;
    currentQuestionIndex: number;
    score?: number;
    submissionTime?: number | null;
    completionDurationSeconds?: number | null;
    correctCount?: number;
    wrongCount?: number;
    unansweredCount?: number;
  };
  eventState: EventSettings['state'];
  timeRemainingSeconds: number;
  timeLimitMinutes: number;
  maxViolations: number;
  questions: SanitizedQuestion[];
}

export interface ViolationResponse {
  ok: boolean;
  violations: number;
  status: Participant['status'];
  autoSubmitted: boolean;
  message: string;
}

export interface SubmitResponse {
  ok: boolean;
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  completionDurationSeconds: number | null;
  status: Participant['status'];
  violations: number;
}

export interface AdminOverviewResponse {
  totalParticipants: number;
  activeParticipants: number;
  submittedParticipants: number;
  flaggedParticipants: number;
  settings: EventSettings;
  participants: ParticipantSummary[];
}

// Token storage helpers (only stores session pointer, never state data)
const PARTICIPANT_TOKEN_KEY = 'tech_test_participant_token';
const ADMIN_TOKEN_KEY = 'tech_test_admin_token';

export const getStoredParticipantToken = (): string | null => {
  return localStorage.getItem(PARTICIPANT_TOKEN_KEY);
};

export const setStoredParticipantToken = (token: string) => {
  localStorage.setItem(PARTICIPANT_TOKEN_KEY, token);
};

export const clearStoredParticipantToken = () => {
  localStorage.removeItem(PARTICIPANT_TOKEN_KEY);
};

export const getStoredAdminToken = (): string | null => {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
};

export const setStoredAdminToken = (token: string) => {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
};

export const clearStoredAdminToken = () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

// Check and sync Supabase environment credentials from Express backend if provided
export const checkServerSupabaseConfig = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE}/supabase/config`);
    if (res.ok) {
      const data = await res.json();
      if (data?.url && data?.anonKey) {
        (window as any).__SUPABASE_CONFIG__ = {
          url: data.url,
          anonKey: data.anonKey,
          quizId: data.quizId || DEFAULT_QUIZ_ID
        };
        return true;
      }
    }
  } catch {
    // Ignore fetch error
  }
  return isSupabaseConfigured();
};

export const api = {
  // Public Event Status
  async getEventStatus(): Promise<{ settings: EventSettings; totalQuestions: number; questions?: SanitizedQuestion[] }> {
    try {
      return await supabaseQuizService.getEventStatus();
    } catch (err: any) {
      console.error('[Supabase getEventStatus Error]:', err);
      throw new Error(`Failed to load quiz status from Supabase: ${err.message || 'Database unreachable'}`);
    }
  },

  // Participant Register (Creates row in public.participants with UUID primary key)
  async register(data: {
    participantId: string;
    name: string;
    department?: string;
  }): Promise<RegisterResponse> {
    console.log('[Supabase Participant Registration] Creating participant session row:', {
      quizId: DEFAULT_QUIZ_ID,
      participantId: data.participantId,
      name: data.name,
      department: data.department
    });

    try {
      const res = await supabaseQuizService.registerParticipant(data);
      console.log('[Supabase Participant Registration] Success! Generated UUID:', res.token);
      setStoredParticipantToken(res.token);
      return res;
    } catch (err: any) {
      console.error('[Supabase Participant Registration FAILED]:', err);
      // Explicit error thrown to UI - Never silently fallback or mock
      throw new Error(err.message || 'Database registration failed. Could not create participant record in Supabase.');
    }
  },

  // Participant Session Resume (Fetches existing participant session by UUID token)
  async getSession(token: string): Promise<SessionResponse> {
    try {
      return await supabaseQuizService.getSession(token);
    } catch (err: any) {
      console.error(`[Supabase getSession Error for ${token}]:`, err);
      throw err;
    }
  },

  // Record Answer (Persists answer to public.answers and updates participant score in Supabase)
  async recordAnswer(token: string, questionId: number, optionIndex: number) {
    console.log('[Supabase Record Answer] Persisting answer for participant UUID:', token, {
      questionId,
      optionIndex
    });

    try {
      return await supabaseQuizService.recordAnswer(token, questionId, optionIndex);
    } catch (err: any) {
      console.error('[Supabase Record Answer FAILED]:', err);
      throw err;
    }
  },

  // Record Participant Heartbeat (Updates last_activity_at in public.participants)
  async recordHeartbeat(token: string): Promise<void> {
    try {
      await supabaseQuizService.recordHeartbeat(token);
    } catch (err) {
      console.warn('[Supabase Heartbeat Warning]:', err);
    }
  },

  // Record Violation (Persists violation event to public.violations and updates participant status)
  async recordViolation(
    token: string,
    eventType: 'started' | 'answered' | 'tab_switched' | 'returned_to_test' | 'window_blurred' | 'window_focused',
    questionIndex: number
  ): Promise<ViolationResponse> {
    console.log('[Supabase Record Violation] Persisting proctoring alert for UUID:', token, {
      eventType,
      questionIndex
    });

    try {
      return await supabaseQuizService.recordViolation(token, eventType, questionIndex);
    } catch (err: any) {
      console.error('[Supabase Record Violation FAILED]:', err);
      throw err;
    }
  },

  // Submit Test (Finalizes participant status to submitted/flagged and upserts public.results)
  async submitTest(token: string): Promise<SubmitResponse> {
    console.log('[Supabase Submit Test] Finalizing test for participant UUID:', token);

    try {
      const res = await supabaseQuizService.submitTest(token);
      console.log('[Supabase Submit Test] Test finalized successfully in database:', res);
      return res;
    } catch (err: any) {
      console.error('[Supabase Submit Test FAILED]:', err);
      throw err;
    }
  },

  // Public Leaderboard (Direct query from public.results)
  async getLeaderboard(): Promise<{ leaderboardPublic: boolean; leaderboard: LeaderboardEntry[] }> {
    try {
      return await supabaseQuizService.getLeaderboard();
    } catch (err: any) {
      console.error('[Supabase Leaderboard FAILED]:', err);
      return { leaderboardPublic: true, leaderboard: [] };
    }
  },

  // Organizer Authentication
  async adminLogin(username: string, password: string): Promise<{ token: string; user: any }> {
    const validUser = (username || '').trim().toLowerCase() === 'admin';
    const validPass = (password || '').trim() === 'admin123';

    if (!validUser || !validPass) {
      throw new Error('Invalid administrator credentials.');
    }

    const token = 'tech_test_admin_auth_token_9981';
    const user = { username: 'admin', role: 'organizer' };
    setStoredAdminToken(token);
    return { token, user };
  },

  // Organizer Overview (Direct query from public.participants, public.answers, and public.violations)
  async getAdminOverview(_adminToken: string): Promise<AdminOverviewResponse> {
    try {
      return await supabaseQuizService.getAdminOverview();
    } catch (err: any) {
      console.error('[Supabase getAdminOverview FAILED]:', err);
      throw err;
    }
  },

  // Organizer Participant Detail (Detailed timeline audit log from public.violations)
  async getAdminParticipant(_adminToken: string, id: string): Promise<{ participant: Participant }> {
    try {
      return await supabaseQuizService.getParticipantDetail(id);
    } catch (err: any) {
      console.error(`[Supabase getAdminParticipant FAILED for ${id}]:`, err);
      throw err;
    }
  },

  // Organizer Update Settings
  async updateAdminSettings(_adminToken: string, settings: Partial<EventSettings>) {
    try {
      return await supabaseQuizService.updateAdminSettings(settings);
    } catch (err: any) {
      console.error('[Supabase updateAdminSettings FAILED]:', err);
      throw err;
    }
  },

  // Organizer Get Questions
  async getAdminQuestions(_adminToken: string): Promise<{ questions: Question[] }> {
    try {
      const questions = await supabaseQuizService.getQuestions();
      return { questions };
    } catch (err: any) {
      console.error('[Supabase getAdminQuestions FAILED]:', err);
      throw err;
    }
  },

  // Organizer Save Questions
  async saveAdminQuestions(_adminToken: string, questions: Question[]): Promise<{ ok: boolean; questions: Question[] }> {
    try {
      return await supabaseQuizService.saveQuestions(questions);
    } catch (err: any) {
      console.error('[Supabase saveAdminQuestions FAILED]:', err);
      throw err;
    }
  },

  // Organizer Reset Questions
  async resetAdminQuestions(_adminToken: string): Promise<{ ok: boolean; questions: Question[] }> {
    try {
      return await supabaseQuizService.resetQuestions();
    } catch (err: any) {
      console.error('[Supabase resetAdminQuestions FAILED]:', err);
      throw err;
    }
  },

  // Organizer Seed Demo
  async seedDemo(_adminToken: string) {
    return { ok: true };
  },

  // Organizer Clear Demo
  async clearDemo(_adminToken: string) {
    return { ok: true };
  },

  // Organizer Reset Event (Deletes all participants, answers, violations, results from Supabase)
  async resetEvent(_adminToken: string, _clearDemo: boolean) {
    try {
      await supabaseQuizService.resetEvent();
      return { ok: true };
    } catch (err: any) {
      console.error('[Supabase resetEvent FAILED]:', err);
      throw err;
    }
  },

  // Supabase Realtime Subscription setup for Organizer Dashboard
  subscribeRealtime(
    onEvent: (type: 'participant' | 'violation' | 'answer' | 'quiz', payload: any) => void
  ): { unsubscribe: () => void } | null {
    try {
      return supabaseQuizService.subscribeToRealtime(onEvent);
    } catch (err: any) {
      console.error('[Supabase subscribeRealtime FAILED]:', err);
      return null;
    }
  },

  // Download CSV Export (Generated from authoritative Supabase records)
  async downloadExportCsv(_adminToken: string) {
    try {
      const overview = await supabaseQuizService.getAdminOverview();
      const rows = [
        ['Participant ID', 'Name', 'Department', 'Score', 'Progress', 'Status', 'Violations']
      ];
      overview.participants.forEach((p: any) => {
        rows.push([
          p.participantId,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${(p.department || '').replace(/"/g, '""')}"`,
          p.score.toString(),
          p.progressText,
          p.status,
          p.violations.toString()
        ]);
      });
      const csvContent = rows.map((r) => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tech_test_results.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Supabase CSV Export FAILED]:', err);
    }
  },

  getExportCsvUrl(): string {
    return `${API_BASE}/admin/export-csv`;
  }
};
