import { OFFICIAL_QUESTIONS, Question } from './questions.js';
import {
  EventSettings,
  Participant,
  ParticipantSummary,
  ActivityLogItem,
  LeaderboardEntry,
  EventState,
  SanitizedQuestion
} from '../src/shared/types.js';
import { Response } from 'express';

class QuizStore {
  public settings: EventSettings = {
    name: 'Technical Quiz Competition',
    subtitle: 'Technical Quiz Competition',
    state: 'ACTIVE',
    timeLimitMinutes: 10,
    maxViolations: 3,
    autoSubmitOnMaxViolations: true,
    leaderboardPublic: true
  };

  // Map session token -> Participant
  public participants: Map<string, Participant> = new Map();
  // Map participantId (case-insensitive) -> session token
  public participantIdToToken: Map<string, string> = new Map();
  // Questions state (customizable by admin)
  public questions: Question[] = JSON.parse(JSON.stringify(OFFICIAL_QUESTIONS));

  // Active SSE listeners
  private sseClients: Set<Response> = new Set();

  constructor() {
    // Clean initial state - real participants only
  }

  public getQuestions(): Question[] {
    return this.questions;
  }

  public getSanitizedQuestions(): SanitizedQuestion[] {
    return this.questions.map((q, index) => ({
      id: q.id,
      questionNumber: index + 1,
      text: q.text,
      topic: q.topic,
      options: [...q.options]
    }));
  }

  public setQuestions(newQuestions: Question[]) {
    this.questions = newQuestions;
    this.broadcast();
  }

  public resetQuestions() {
    this.questions = JSON.parse(JSON.stringify(OFFICIAL_QUESTIONS));
    this.broadcast();
  }

  public subscribeSSE(res: Response) {
    this.sseClients.add(res);
    res.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  public broadcast() {
    if (this.sseClients.size === 0) return;
    const payload = JSON.stringify({
      type: 'UPDATE',
      overview: this.getOverview(),
      timestamp: Date.now()
    });

    for (const client of this.sseClients) {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  public getQuestionsCount(): number {
    return this.questions.length;
  }

  public findParticipantByToken(token: string): Participant | undefined {
    return this.participants.get(token);
  }

  public findParticipantById(participantId: string): Participant | undefined {
    const token = this.participantIdToToken.get(participantId.trim().toUpperCase());
    if (!token) return undefined;
    return this.participants.get(token);
  }

  public formatTimestamp(ts: number): string {
    const date = new Date(ts);
    return date.toTimeString().split(' ')[0]; // "HH:MM:SS"
  }

  public logEvent(
    participant: Participant,
    eventType: ActivityLogItem['eventType'],
    description: string,
    questionNumber?: number
  ) {
    const now = Date.now();
    const item: ActivityLogItem = {
      id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      formattedTime: this.formatTimestamp(now),
      eventType,
      description,
      questionNumber
    };
    participant.activityLog.push(item);
  }

  public registerParticipant(data: {
    participantId: string;
    name: string;
    department?: string;
  }): { participant: Participant; token: string } {
    const cleanId = data.participantId.trim().toUpperCase();
    const cleanName = data.name.trim();
    const cleanDept = (data.department || '').trim();

    // Check if ID is already active
    const existingToken = this.participantIdToToken.get(cleanId);
    if (existingToken) {
      const existing = this.participants.get(existingToken);
      if (existing) {
        if (existing.status === 'submitted' || existing.status === 'flagged') {
          throw new Error(`Participant ID ${cleanId} has already completed or submitted the test.`);
        }
        // If active, return existing session so page refresh / reconnect works gracefully
        return { participant: existing, token: existing.id };
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

    this.broadcast();
    return { participant, token };
  }

  public recordAnswer(token: string, questionId: number, optionIndex: number): Participant {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found.');
    if (participant.status === 'submitted' || participant.status === 'flagged') {
      throw new Error('Test has already been submitted.');
    }

    // Check timer expiration
    if (this.checkTimeExpiration(participant)) {
      return participant;
    }

    participant.answers[questionId] = optionIndex;
    // Calculate current live score
    this.computeScore(participant);

    const qNum = this.questions.findIndex((q) => q.id === questionId) + 1;
    this.logEvent(participant, 'answered', `Answered Question ${qNum}`, qNum);

    this.broadcast();
    return participant;
  }

  public recordViolation(
    token: string,
    eventType: 'tab_switched' | 'returned_to_test' | 'window_blurred' | 'window_focused',
    questionIndex: number
  ): { participant: Participant; autoSubmitted: boolean; message: string } {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found.');
    if (participant.status === 'submitted' || participant.status === 'flagged') {
      return { participant, autoSubmitted: false, message: 'Test already concluded.' };
    }

    if (this.checkTimeExpiration(participant)) {
      return { participant, autoSubmitted: true, message: 'Time expired.' };
    }

    const qNum = questionIndex + 1;
    let label = 'Tab switched';
    if (eventType === 'window_blurred') label = 'Window lost focus';
    if (eventType === 'window_focused') label = 'Window refocused';
    if (eventType === 'returned_to_test') label = 'Returned to test';

    // Only increment violation count for tab switches and blur events (not return events)
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

    this.broadcast();
    return { participant, autoSubmitted, message };
  }

  public submitTest(token: string, isAutoSubmit = false): Participant {
    const participant = this.participants.get(token);
    if (!participant) throw new Error('Session not found.');
    if (participant.status === 'submitted' || participant.status === 'flagged') {
      return participant;
    }

    const now = Date.now();
    participant.submissionTime = now;
    participant.completionDurationSeconds = Math.max(1, Math.round((now - participant.startTime) / 1000));
    
    // Status: if already flagged or too many violations, keep flagged, otherwise submitted
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

    this.broadcast();
    return participant;
  }

  public computeScore(participant: Participant) {
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    for (const q of this.questions) {
      const chosen = participant.answers[q.id];
      if (chosen === undefined || chosen === null) {
        unanswered++;
      } else if (chosen === q.correctIndex) {
        correct++;
      } else {
        wrong++;
      }
    }

    participant.score = correct;
    participant.totalQuestions = this.questions.length;
    participant.correctCount = correct;
    participant.wrongCount = wrong;
    participant.unansweredCount = unanswered;
  }

  public checkTimeExpiration(participant: Participant): boolean {
    if (participant.status === 'submitted' || participant.status === 'flagged') return false;
    const timeLimitMs = this.settings.timeLimitMinutes * 60 * 1000;
    const elapsed = Date.now() - participant.startTime;
    if (elapsed >= timeLimitMs) {
      this.submitTest(participant.id, true);
      return true;
    }
    return false;
  }

  public getTimeRemainingSeconds(participant: Participant): number {
    if (participant.status === 'submitted' || participant.status === 'flagged') return 0;
    const totalSecs = this.settings.timeLimitMinutes * 60;
    const elapsedSecs = Math.floor((Date.now() - participant.startTime) / 1000);
    return Math.max(0, totalSecs - elapsedSecs);
  }

  public getOverview(): {
    totalParticipants: number;
    activeParticipants: number;
    submittedParticipants: number;
    flaggedParticipants: number;
    settings: EventSettings;
    participants: ParticipantSummary[];
  } {
    const list = Array.from(this.participants.values());
    let active = 0;
    let submitted = 0;
    let flagged = 0;

    const summaries: ParticipantSummary[] = list.map((p) => {
      // Check timer expiration
      this.checkTimeExpiration(p);

      if (p.status === 'submitted') submitted++;
      else if (p.status === 'flagged') flagged++;
      else active++;

      const answeredCount = Object.keys(p.answers).length;
      const progressText = `${answeredCount}/${p.totalQuestions}`;
      const scoreText = p.status === 'submitted' || p.status === 'flagged' ? `${p.score}/${p.totalQuestions}` : `${p.score}/${p.totalQuestions}`;

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

    // Sort: real participants first, then demo, then by start time desc
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

  public getLeaderboard(includeDemo = false): LeaderboardEntry[] {
    const list = Array.from(this.participants.values()).filter((p) => {
      if (!includeDemo && p.isDemo) return false;
      return p.status === 'submitted' || p.status === 'flagged';
    });

    // Sort by:
    // 1. Highest score desc
    // 2. Lowest completion time asc
    // 3. Lowest violations asc
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

  public updateSettings(partial: Partial<EventSettings>) {
    this.settings = { ...this.settings, ...partial };
    this.broadcast();
  }

  public resetAll(clearDemo = false) {
    this.participants.clear();
    this.participantIdToToken.clear();
    if (!clearDemo) {
      this.seedDemoParticipants();
    }
    this.broadcast();
  }

  public seedDemoParticipants() {
    const now = Date.now();

    // 1. Rahul (TT001) - Active, 7/10, score 7, 0 violations
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
        { id: '2', timestamp: now - 400000, formattedTime: this.formatTimestamp(now - 400000), eventType: 'answered', description: 'Answered Question 1', questionNumber: 1 },
        { id: '3', timestamp: now - 350000, formattedTime: this.formatTimestamp(now - 350000), eventType: 'answered', description: 'Answered Question 2', questionNumber: 2 }
      ]
    };

    // 2. Priya (TT002) - Active, 5/10, score 4, 2 violations (Warning)
    const priya: Participant = {
      id: 'demo_priya_02',
      participantId: 'TT002',
      name: 'Priya Patel',
      department: 'Information Technology',
      startTime: now - 6 * 60 * 1000 + 19 * 1000,
      submissionTime: null,
      completionDurationSeconds: null,
      answers: { 1: 2, 2: 1, 3: 2, 4: 1, 5: 1 }, // 4 correct, 1 wrong
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
        { id: '11', timestamp: now - 310000, formattedTime: this.formatTimestamp(now - 310000), eventType: 'answered', description: 'Answered Question 1', questionNumber: 1 },
        { id: '12', timestamp: now - 250000, formattedTime: this.formatTimestamp(now - 250000), eventType: 'tab_switched', description: 'Tab switched (Question 2)', questionNumber: 2 },
        { id: '13', timestamp: now - 246000, formattedTime: this.formatTimestamp(now - 246000), eventType: 'returned_to_test', description: 'Returned to test (Question 2)', questionNumber: 2 }
      ]
    };

    // 3. Arjun (TT003) - Submitted, 10/10, score 10, 03:18 duration, 0 violations
    const arjun: Participant = {
      id: 'demo_arjun_03',
      participantId: 'TT003',
      name: 'Arjun Nair',
      department: 'Electronics & Comm.',
      startTime: now - 15 * 60 * 1000,
      submissionTime: now - 9 * 60 * 1000 - 42 * 1000,
      completionDurationSeconds: 198,
      answers: { 1: 2, 2: 0, 3: 2, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 3, 10: 1 }, // 10 correct
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
        { id: '21', timestamp: now - 840000, formattedTime: this.formatTimestamp(now - 840000), eventType: 'answered', description: 'Answered Question 1', questionNumber: 1 },
        { id: '22', timestamp: now - 620000, formattedTime: this.formatTimestamp(now - 620000), eventType: 'answered', description: 'Answered Question 10', questionNumber: 10 },
        { id: '23', timestamp: now - 582000, formattedTime: this.formatTimestamp(now - 582000), eventType: 'submitted', description: 'Test submitted by participant' }
      ]
    };

    // 4. Ananya (TT004) - Submitted, score 9, 04:12 duration, 1 violation
    const ananya: Participant = {
      id: 'demo_ananya_04',
      participantId: 'TT004',
      name: 'Ananya Roy',
      department: 'Computer Science',
      startTime: now - 20 * 60 * 1000,
      submissionTime: now - 13 * 60 * 1000 - 18 * 1000,
      completionDurationSeconds: 252,
      answers: { 1: 2, 2: 0, 3: 2, 4: 1, 5: 1, 6: 0, 7: 1, 8: 2, 9: 3, 10: 1 }, // 9 correct, 1 wrong
      score: 9,
      totalQuestions: 10,
      correctCount: 9,
      wrongCount: 1,
      unansweredCount: 0,
      status: 'submitted',
      violations: 1,
      currentQuestionIndex: 9,
      isDemo: true,
      activityLog: [
        { id: '30', timestamp: now - 1200000, formattedTime: this.formatTimestamp(now - 1200000), eventType: 'started', description: 'Started test' },
        { id: '31', timestamp: now - 950000, formattedTime: this.formatTimestamp(now - 950000), eventType: 'tab_switched', description: 'Tab switched (Question 4)', questionNumber: 4 },
        { id: '32', timestamp: now - 798000, formattedTime: this.formatTimestamp(now - 798000), eventType: 'submitted', description: 'Test submitted by participant' }
      ]
    };

    // 5. Karthik (TT005) - Flagged, 3 violations, auto-submitted
    const karthik: Participant = {
      id: 'demo_karthik_05',
      participantId: 'TT005',
      name: 'Karthik Varma',
      department: 'Mechanical Eng.',
      startTime: now - 12 * 60 * 1000,
      submissionTime: now - 9 * 60 * 1000,
      completionDurationSeconds: 180,
      answers: { 1: 2, 2: 0, 3: 2, 4: 0 }, // 3 correct, 1 wrong
      score: 3,
      totalQuestions: 10,
      correctCount: 3,
      wrongCount: 1,
      unansweredCount: 6,
      status: 'flagged',
      violations: 3,
      currentQuestionIndex: 3,
      isDemo: true,
      activityLog: [
        { id: '40', timestamp: now - 720000, formattedTime: this.formatTimestamp(now - 720000), eventType: 'started', description: 'Started test' },
        { id: '41', timestamp: now - 680000, formattedTime: this.formatTimestamp(now - 680000), eventType: 'tab_switched', description: 'Tab switched (Question 2)', questionNumber: 2 },
        { id: '42', timestamp: now - 610000, formattedTime: this.formatTimestamp(now - 610000), eventType: 'tab_switched', description: 'Tab switched (Question 3)', questionNumber: 3 },
        { id: '43', timestamp: now - 540000, formattedTime: this.formatTimestamp(now - 540000), eventType: 'tab_switched', description: 'Tab switched (Question 3)', questionNumber: 3 },
        { id: '44', timestamp: now - 540000, formattedTime: this.formatTimestamp(now - 540000), eventType: 'auto_submitted', description: 'Auto-submitted due to reaching violation threshold (3 violations)' }
      ]
    };

    const demos = [rahul, priya, arjun, ananya, karthik];
    for (const d of demos) {
      this.participants.set(d.id, d);
      this.participantIdToToken.set(d.participantId, d.id);
    }
  }

  public clearDemoParticipants() {
    for (const [token, p] of Array.from(this.participants.entries())) {
      if (p.isDemo) {
        this.participants.delete(token);
        this.participantIdToToken.delete(p.participantId);
      }
    }
    this.broadcast();
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

export const quizStore = new QuizStore();
