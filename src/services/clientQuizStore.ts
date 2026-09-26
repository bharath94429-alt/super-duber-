import { DEFAULT_OFFICIAL_QUESTIONS } from '../data/defaultQuestions';
import {
  EventSettings,
  Participant,
  ParticipantSummary,
  Question,
  SanitizedQuestion,
  LeaderboardEntry,
  ActivityLogItem
} from '../shared/types';

const STORE_KEY = 'tech_test_local_store_v2';
const ADMIN_SECRET = 'tech_test_admin_auth_token_9981';

interface StoredData {
  settings: EventSettings;
  questions: Question[];
  participants: Participant[];
}

class ClientQuizStore {
  private settings: EventSettings = {
    name: 'Technical Quiz Competition',
    subtitle: 'Technical Quiz Competition',
    state: 'ACTIVE',
    timeLimitMinutes: 10,
    maxViolations: 3,
    autoSubmitOnMaxViolations: true,
    leaderboardPublic: true
  };

  private questions: Question[] = JSON.parse(JSON.stringify(DEFAULT_OFFICIAL_QUESTIONS));
  private participants: Map<string, Participant> = new Map();
  private participantIdToToken: Map<string, string> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORE_KEY) {
          this.loadFromStorage();
          for (const cb of this.listeners) {
            try {
              cb();
            } catch {}
          }
        }
      });
    }
  }

  public subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.saveToStorage();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tech_test_store_updated'));
    }
    for (const cb of this.listeners) {
      try {
        cb();
      } catch (e) {
        console.error(e);
      }
    }
  }

  private loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const data: StoredData = JSON.parse(raw);
        if (data.settings) this.settings = data.settings;
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          this.questions = data.questions;
        }
        if (Array.isArray(data.participants)) {
          this.participants.clear();
          this.participantIdToToken.clear();
          for (const p of data.participants) {
            this.participants.set(p.id, p);
            this.participantIdToToken.set(p.participantId.toUpperCase(), p.id);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load store from localStorage', err);
    }
  }

  private saveToStorage() {
    try {
      const data: StoredData = {
        settings: this.settings,
        questions: this.questions,
        participants: Array.from(this.participants.values())
      };
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Failed to save store to localStorage', err);
    }
  }

  public adminLogin(user: string, pass: string): { ok: boolean; token: string; user: any } {
    if (user.trim() === 'admin' && pass === 'Admin') {
      return {
        ok: true,
        token: ADMIN_SECRET,
        user: { username: 'admin', role: 'Event Organizer' }
      };
    }
    throw new Error('Invalid username or password. Check credentials and try again.');
  }

  public getEventStatus() {
    return {
      settings: this.settings,
      totalQuestions: this.questions.length
    };
  }

  public getQuestions(): Question[] {
    return this.questions;
  }

  public getSanitizedQuestions(): SanitizedQuestion[] {
    return this.questions.map((q, idx) => ({
      id: q.id,
      questionNumber: idx + 1,
      text: q.text,
      topic: q.topic,
      options: [...q.options]
    }));
  }

  public setQuestions(newQuestions: Question[]) {
    this.questions = newQuestions;
    this.notify();
  }

  public resetQuestions() {
    this.questions = JSON.parse(JSON.stringify(DEFAULT_OFFICIAL_QUESTIONS));
    this.notify();
  }

  public updateSettings(partial: Partial<EventSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.notify();
  }

  private formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toTimeString().split(' ')[0];
  }

  private logEvent(
    p: Participant,
    eventType: ActivityLogItem['eventType'],
    description: string,
    questionNumber?: number
  ) {
    const now = Date.now();
    p.activityLog.push({
      id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      formattedTime: this.formatTimestamp(now),
      eventType,
      description,
      questionNumber
    });
  }

  public registerParticipant(data: {
    participantId: string;
    name: string;
    department?: string;
  }) {
    const cleanId = data.participantId.trim().toUpperCase();
    const cleanName = data.name.trim();
    const cleanDept = (data.department || '').trim();

    if (!cleanId || !cleanName) {
      throw new Error('Full Name and Participant ID are required.');
    }

    if (this.settings.state === 'WAITING') {
      throw new Error("Tech Test hasn't started yet. Please wait for the event coordinator to open the test.");
    }
    if (this.settings.state === 'ENDED') {
      throw new Error('Tech Test has concluded. New registrations are closed.');
    }

    const existingToken = this.participantIdToToken.get(cleanId);
    if (existingToken) {
      const existing = this.participants.get(existingToken);
      if (existing) {
        if (existing.status === 'submitted' || existing.status === 'flagged') {
          throw new Error(`Participant ID ${cleanId} has already completed or submitted the test.`);
        }
        return {
          token: existing.id,
          participant: existing,
          timeRemainingSeconds: this.getTimeRemainingSeconds(existing),
          timeLimitMinutes: this.settings.timeLimitMinutes,
          questions: this.getSanitizedQuestions()
        };
      }
    }

    const token = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    const now = Date.now();
    const participant: Participant = {
      id: token,
      participantId: cleanId,
      name: cleanName,
      department: cleanDept,
      startTime: now,
      submissionTime: null,
      completionDurationSeconds: null,
      answers: {},
      score: 0,
      totalQuestions: this.questions.length,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: this.questions.length,
      status: 'active',
      violations: 0,
      currentQuestionIndex: 0,
      isDemo: false,
      activityLog: []
    };

    this.logEvent(participant, 'started', 'Started test');
    this.participants.set(token, participant);
    this.participantIdToToken.set(cleanId, token);
    this.notify();

    return {
      token,
      participant,
      timeRemainingSeconds: this.getTimeRemainingSeconds(participant),
      timeLimitMinutes: this.settings.timeLimitMinutes,
      questions: this.getSanitizedQuestions()
    };
  }

  public getSession(token: string) {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found or expired.');

    this.checkTimeExpiration(participant);

    return {
      participant,
      eventState: this.settings.state,
      timeRemainingSeconds: this.getTimeRemainingSeconds(participant),
      timeLimitMinutes: this.settings.timeLimitMinutes,
      maxViolations: this.settings.maxViolations,
      questions: this.getSanitizedQuestions()
    };
  }

  public recordAnswer(token: string, questionId: number, optionIndex: number) {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found.');
    if (participant.status === 'submitted' || participant.status === 'flagged') {
      throw new Error('Test has already been submitted.');
    }

    if (this.checkTimeExpiration(participant)) {
      return { ok: true, answers: participant.answers, status: participant.status };
    }

    participant.answers[questionId] = optionIndex;
    this.computeScore(participant);

    const qNum = this.questions.findIndex((q) => q.id === questionId) + 1;
    this.logEvent(participant, 'answered', `Answered Question ${qNum}`, qNum);
    this.notify();

    return { ok: true, answers: participant.answers, status: participant.status };
  }

  public recordViolation(
    token: string,
    eventType: ActivityLogItem['eventType'],
    questionIndex: number
  ) {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found.');
    if (participant.status === 'submitted' || participant.status === 'flagged') {
      return { ok: true, violations: participant.violations, status: participant.status, autoSubmitted: false, message: 'Test already concluded.' };
    }

    if (this.checkTimeExpiration(participant)) {
      return { ok: true, violations: participant.violations, status: participant.status, autoSubmitted: true, message: 'Time expired.' };
    }

    const qNum = questionIndex + 1;
    let label = 'Tab switched';
    if (eventType === 'window_blurred') label = 'Window lost focus';
    if (eventType === 'window_focused') label = 'Window refocused';
    if (eventType === 'returned_to_test') label = 'Returned to test';

    let incrementViolation = false;
    if (eventType === 'tab_switched' || eventType === 'window_blurred') {
      participant.violations += 1;
      incrementViolation = true;
    }

    this.logEvent(participant, eventType, `${label} (Question ${qNum})`, qNum);

    let autoSubmitted = false;
    let message = '';

    if (incrementViolation) {
      if (participant.violations >= this.settings.maxViolations && this.settings.autoSubmitOnMaxViolations) {
        participant.status = 'flagged';
        participant.submissionTime = Date.now();
        participant.completionDurationSeconds = Math.round((participant.submissionTime - participant.startTime) / 1000);
        this.computeScore(participant);
        this.logEvent(
          participant,
          'auto_submitted',
          `Auto-submitted due to reaching violation threshold (${participant.violations} violations)`
        );
        autoSubmitted = true;
        message = `Maximum violation limit reached (${this.settings.maxViolations}). Your test has been automatically submitted and flagged.`;
      } else {
        participant.status = 'warning';
        message = `Warning: Leaving the quiz window has been detected and recorded. (Violation ${participant.violations}/${this.settings.maxViolations})`;
      }
    }

    this.notify();
    return {
      ok: true,
      violations: participant.violations,
      status: participant.status,
      autoSubmitted,
      message
    };
  }

  public submitTest(token: string, isAutoSubmit = false) {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found.');
    if (participant.status === 'submitted' || participant.status === 'flagged') {
      return {
        ok: true,
        score: participant.score,
        totalQuestions: participant.totalQuestions,
        correctCount: participant.correctCount,
        wrongCount: participant.wrongCount,
        unansweredCount: participant.unansweredCount,
        completionDurationSeconds: participant.completionDurationSeconds,
        status: participant.status,
        violations: participant.violations
      };
    }

    const now = Date.now();
    participant.submissionTime = now;
    participant.completionDurationSeconds = Math.max(1, Math.round((now - participant.startTime) / 1000));

    if (participant.violations >= this.settings.maxViolations) {
      participant.status = 'flagged';
    } else {
      participant.status = 'submitted';
    }

    this.computeScore(participant);

    if (isAutoSubmit) {
      this.logEvent(participant, 'auto_submitted', 'Test auto-submitted when timer ended');
    } else {
      this.logEvent(participant, 'submitted', 'Test submitted by participant');
    }

    this.notify();
    return {
      ok: true,
      score: participant.score,
      totalQuestions: participant.totalQuestions,
      correctCount: participant.correctCount,
      wrongCount: participant.wrongCount,
      unansweredCount: participant.unansweredCount,
      completionDurationSeconds: participant.completionDurationSeconds,
      status: participant.status,
      violations: participant.violations
    };
  }

  public computeScore(p: Participant) {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    for (const q of this.questions) {
      const chosen = p.answers[q.id];
      if (chosen === undefined || chosen === null) {
        unanswered++;
      } else if (chosen === q.correctIndex) {
        correct++;
      } else {
        wrong++;
      }
    }

    p.score = correct;
    p.totalQuestions = this.questions.length;
    p.correctCount = correct;
    p.wrongCount = wrong;
    p.unansweredCount = unanswered;
  }

  public checkTimeExpiration(p: Participant): boolean {
    if (p.status === 'submitted' || p.status === 'flagged') return false;
    const timeLimitMs = this.settings.timeLimitMinutes * 60 * 1000;
    const elapsed = Date.now() - p.startTime;
    if (elapsed >= timeLimitMs) {
      this.submitTest(p.id, true);
      return true;
    }
    return false;
  }

  public getTimeRemainingSeconds(p: Participant): number {
    if (p.status === 'submitted' || p.status === 'flagged') return 0;
    const totalSecs = this.settings.timeLimitMinutes * 60;
    const elapsedSecs = Math.floor((Date.now() - p.startTime) / 1000);
    return Math.max(0, totalSecs - elapsedSecs);
  }

  public getOverview() {
    const list = Array.from(this.participants.values());
    let active = 0;
    let submitted = 0;
    let flagged = 0;

    const summaries: ParticipantSummary[] = list.map((p) => {
      this.checkTimeExpiration(p);
      if (p.status === 'submitted') submitted++;
      else if (p.status === 'flagged') flagged++;
      else active++;

      const answeredCount = Object.keys(p.answers).length;
      const progressText = `${answeredCount}/${p.totalQuestions}`;
      const scoreText = `${p.score}/${p.totalQuestions}`;

      let timeDisplay = '';
      if (p.completionDurationSeconds !== null) {
        const mins = Math.floor(p.completionDurationSeconds / 60);
        const secs = p.completionDurationSeconds % 60;
        timeDisplay = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      } else {
        const rem = this.getTimeRemainingSeconds(p);
        const mins = Math.floor(rem / 60);
        const secs = rem % 60;
        timeDisplay = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }

      return {
        id: p.id,
        participantId: p.participantId,
        name: p.name,
        department: p.department,
        progressText,
        answeredCount,
        totalQuestions: p.totalQuestions,
        progressPercentage: Math.round((answeredCount / (p.totalQuestions || 1)) * 100),
        answers: { ...p.answers },
        currentQuestionNumber: Math.min(p.totalQuestions, answeredCount + 1),
        scoreText,
        score: p.score,
        timeRemainingSeconds: this.getTimeRemainingSeconds(p),
        timeDisplay,
        status: p.status,
        violations: p.violations,
        isDemo: p.isDemo,
        startTime: p.startTime,
        submissionTime: p.submissionTime
      };
    });

    summaries.sort((a, b) => {
      if (a.isDemo !== b.isDemo) return a.isDemo ? 1 : -1;
      return b.startTime - a.startTime;
    });

    return {
      totalParticipants: list.length,
      activeParticipants: active,
      submittedParticipants: submitted,
      flaggedParticipants: flagged,
      settings: this.settings,
      participants: summaries
    };
  }

  public getParticipant(id: string) {
    const p = this.participants.get(id);
    if (!p) throw new Error('Participant not found.');
    return { participant: p };
  }

  public getLeaderboard(includeDemo = false): LeaderboardEntry[] {
    const list = Array.from(this.participants.values()).filter((p) => {
      if (!includeDemo && p.isDemo) return false;
      return p.status === 'submitted' || p.status === 'flagged';
    });

    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const timeA = a.completionDurationSeconds ?? 999999;
      const timeB = b.completionDurationSeconds ?? 999999;
      if (timeA !== timeB) return timeA - timeB;
      return a.violations - b.violations;
    });

    return list.map((p, idx) => {
      const duration = p.completionDurationSeconds || 0;
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      return {
        rank: idx + 1,
        participantId: p.participantId,
        name: p.name,
        department: p.department,
        score: p.score,
        totalQuestions: p.totalQuestions,
        completionTimeSeconds: duration,
        completionTimeFormatted: timeStr,
        violations: p.violations,
        status: p.status
      };
    });
  }

  public seedDemoParticipants() {
    const now = Date.now();
    const rahul: Participant = {
      id: 'demo_rahul_01',
      participantId: 'TT001',
      name: 'Rahul Sharma',
      department: 'Computer Science',
      startTime: now - 7 * 60 * 1000 + 46 * 1000,
      submissionTime: null,
      completionDurationSeconds: null,
      answers: { 1: 2, 2: 0, 3: 2, 4: 1, 5: 1, 6: 1, 7: 1 },
      score: 7,
      totalQuestions: 10,
      correctCount: 7,
      wrongCount: 0,
      unansweredCount: 3,
      status: 'active',
      violations: 0,
      currentQuestionIndex: 7,
      isDemo: true,
      activityLog: [
        { id: '1', timestamp: now - 460000, formattedTime: this.formatTimestamp(now - 460000), eventType: 'started', description: 'Started test' },
        { id: '2', timestamp: now - 400000, formattedTime: this.formatTimestamp(now - 400000), eventType: 'answered', description: 'Answered Question 1', questionNumber: 1 }
      ]
    };

    const priya: Participant = {
      id: 'demo_priya_02',
      participantId: 'TT002',
      name: 'Priya Patel',
      department: 'Information Technology',
      startTime: now - 6 * 60 * 1000 + 19 * 1000,
      submissionTime: null,
      completionDurationSeconds: null,
      answers: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 1 },
      score: 4,
      totalQuestions: 10,
      correctCount: 4,
      wrongCount: 1,
      unansweredCount: 5,
      status: 'warning',
      violations: 2,
      currentQuestionIndex: 5,
      isDemo: true,
      activityLog: [
        { id: '10', timestamp: now - 370000, formattedTime: this.formatTimestamp(now - 370000), eventType: 'started', description: 'Started test' },
        { id: '11', timestamp: now - 250000, formattedTime: this.formatTimestamp(now - 250000), eventType: 'tab_switched', description: 'Tab switched (Question 2)', questionNumber: 2 }
      ]
    };

    const arjun: Participant = {
      id: 'demo_arjun_03',
      participantId: 'TT003',
      name: 'Arjun Nair',
      department: 'Electronics & Comm.',
      startTime: now - 15 * 60 * 1000,
      submissionTime: now - 9 * 60 * 1000 - 42 * 1000,
      completionDurationSeconds: 198,
      answers: { 1: 2, 2: 0, 3: 2, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3, 10: 1 },
      score: 10,
      totalQuestions: 10,
      correctCount: 10,
      wrongCount: 0,
      unansweredCount: 0,
      status: 'submitted',
      violations: 0,
      currentQuestionIndex: 9,
      isDemo: true,
      activityLog: [
        { id: '20', timestamp: now - 900000, formattedTime: this.formatTimestamp(now - 900000), eventType: 'started', description: 'Started test' },
        { id: '21', timestamp: now - 582000, formattedTime: this.formatTimestamp(now - 582000), eventType: 'submitted', description: 'Test submitted by participant' }
      ]
    };

    const demos = [rahul, priya, arjun];
    for (const d of demos) {
      this.participants.set(d.id, d);
      this.participantIdToToken.set(d.participantId, d.id);
    }
    this.notify();
  }

  public clearDemoParticipants() {
    for (const [token, p] of Array.from(this.participants.entries())) {
      if (p.isDemo) {
        this.participants.delete(token);
        this.participantIdToToken.delete(p.participantId);
      }
    }
    this.notify();
  }

  public resetAll(clearDemo = false) {
    this.participants.clear();
    this.participantIdToToken.clear();
    if (!clearDemo) {
      this.seedDemoParticipants();
    }
    this.notify();
  }

  public exportCSV(): string {
    const list = Array.from(this.participants.values());
    const headers = [
      'Participant Name',
      'Participant ID',
      'Department',
      'Score',
      'Total Questions',
      'Correct Answers',
      'Wrong Answers',
      'Unanswered',
      'Start Time',
      'Submission Time',
      'Completion Time',
      'Violation Count',
      'Status'
    ];

    const rows = list.map((p) => {
      const startDate = new Date(p.startTime).toISOString();
      const subDate = p.submissionTime ? new Date(p.submissionTime).toISOString() : 'N/A';
      const duration = p.completionDurationSeconds !== null ? `${p.completionDurationSeconds}s` : 'In Progress';
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.participantId}"`,
        `"${p.department.replace(/"/g, '""')}"`,
        p.score,
        p.totalQuestions,
        p.correctCount,
        p.wrongCount,
        p.unansweredCount,
        `"${startDate}"`,
        `"${subDate}"`,
        `"${duration}"`,
        p.violations,
        p.status
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n') + '\n';
  }
}

export const clientQuizStore = new ClientQuizStore();
