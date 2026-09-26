export type EventState = 'WAITING' | 'ACTIVE' | 'ENDED' | 'RESULTS';

export type ParticipantStatus = 'normal' | 'active' | 'warning' | 'submitted' | 'flagged';

export interface ActivityLogItem {
  id: string;
  timestamp: number;
  formattedTime: string;
  eventType:
    | 'started'
    | 'answered'
    | 'tab_switched'
    | 'returned_to_test'
    | 'window_blurred'
    | 'window_focused'
    | 'submitted'
    | 'auto_submitted'
    | 'warning_issued';
  description: string;
  questionNumber?: number;
}

export interface Participant {
  id: string; // Internal unique session token/uuid
  participantId: string; // e.g. "TT001" / student registration number
  name: string;
  department: string;
  startTime: number;
  submissionTime: number | null;
  completionDurationSeconds: number | null;
  answers: Record<number, number>; // questionId -> chosen option index
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  status: ParticipantStatus;
  violations: number;
  currentQuestionIndex: number; // 0-based
  isDemo: boolean;
  activityLog: ActivityLogItem[];
  clientIp?: string;
  userAgent?: string;
}

export interface ParticipantSummary {
  id: string;
  participantId: string;
  name: string;
  department: string;
  progressText: string; // e.g. "2/5"
  answeredCount?: number;
  totalQuestions?: number;
  progressPercentage?: number;
  answers?: Record<number, number>;
  currentQuestionNumber: number;
  scoreText: string; // e.g. "7/10" or "-"
  score: number;
  timeRemainingSeconds: number;
  timeDisplay: string; // e.g. "06:14" or "04:22 elapsed"
  status: ParticipantStatus;
  violations: number;
  isDemo: boolean;
  startTime: number;
  submissionTime: number | null;
}

export interface EventSettings {
  name: string;
  subtitle: string;
  state: EventState;
  timeLimitMinutes: number;
  maxViolations: number;
  autoSubmitOnMaxViolations: boolean;
  leaderboardPublic: boolean;
}

export interface Question {
  id: number;
  text: string;
  topic: string;
  options: string[];
  correctIndex: number;
}

export interface SanitizedQuestion {
  id: number;
  questionNumber: number;
  text: string;
  topic: string;
  options: string[];
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  name: string;
  department: string;
  score: number;
  totalQuestions: number;
  completionTimeSeconds: number;
  completionTimeFormatted: string;
  violations: number;
  status: ParticipantStatus;
}
