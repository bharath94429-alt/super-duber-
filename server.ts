import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { quizStore } from './server/store.js';
import { getSanitizedQuestions, OFFICIAL_QUESTIONS } from './server/questions.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// Admin token helper
const ADMIN_SECRET = 'tech_test_admin_auth_token_9981';

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
  }
  if (token !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Invalid admin token.' });
  }
  next();
}

function getParticipantToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return null;
}

// ---------------- API ROUTES ----------------

// Supabase Public Config
app.get('/api/supabase/config', (_req, res) => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  res.json({
    url,
    anonKey,
    quizId: process.env.VITE_QUIZ_ID || '7c9e6679-7425-40de-944b-e07fc1f90ae7'
  });
});

// Event Status
app.get('/api/event/status', (_req, res) => {
  res.json({
    settings: quizStore.settings,
    totalQuestions: quizStore.getQuestionsCount()
  });
});

// Participant Registration
app.post('/api/participant/register', (req, res) => {
  try {
    const { participantId, name, department } = req.body;

    if (!participantId || !name) {
      return res.status(400).json({ error: 'Full Name and Participant ID are required.' });
    }

    if (quizStore.settings.state === 'WAITING') {
      return res.status(403).json({
        code: 'QUIZ_WAITING',
        error: "Tech Test hasn't started yet. Please wait for the event coordinator to open the test."
      });
    }

    if (quizStore.settings.state === 'ENDED') {
      return res.status(403).json({
        code: 'QUIZ_ENDED',
        error: 'Tech Test has concluded. New registrations are closed.'
      });
    }

    const { participant, token } = quizStore.registerParticipant({
      participantId,
      name,
      department
    });

    const timeRemainingSeconds = quizStore.getTimeRemainingSeconds(participant);
    const questions = quizStore.getSanitizedQuestions();

    res.json({
      token,
      participant: {
        id: participant.id,
        participantId: participant.participantId,
        name: participant.name,
        department: participant.department,
        status: participant.status,
        answers: participant.answers,
        violations: participant.violations,
        currentQuestionIndex: participant.currentQuestionIndex,
        startTime: participant.startTime
      },
      timeRemainingSeconds,
      timeLimitMinutes: quizStore.settings.timeLimitMinutes,
      questions
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// Get Participant Session / Resume Test
app.get('/api/participant/session', (req, res) => {
  const token = getParticipantToken(req);
  if (!token) return res.status(401).json({ error: 'Session token missing.' });

  const participant = quizStore.findParticipantByToken(token);
  if (!participant) return res.status(404).json({ error: 'Session not found or expired.' });

  quizStore.checkTimeExpiration(participant);

  const timeRemainingSeconds = quizStore.getTimeRemainingSeconds(participant);
  const questions = quizStore.getSanitizedQuestions();

  res.json({
    participant: {
      id: participant.id,
      participantId: participant.participantId,
      name: participant.name,
      department: participant.department,
      status: participant.status,
      answers: participant.answers,
      violations: participant.violations,
      currentQuestionIndex: participant.currentQuestionIndex,
      score: participant.status === 'submitted' || participant.status === 'flagged' ? participant.score : undefined,
      submissionTime: participant.submissionTime,
      completionDurationSeconds: participant.completionDurationSeconds,
      correctCount: participant.status === 'submitted' || participant.status === 'flagged' ? participant.correctCount : undefined,
      wrongCount: participant.status === 'submitted' || participant.status === 'flagged' ? participant.wrongCount : undefined,
      unansweredCount: participant.status === 'submitted' || participant.status === 'flagged' ? participant.unansweredCount : undefined
    },
    eventState: quizStore.settings.state,
    timeRemainingSeconds,
    timeLimitMinutes: quizStore.settings.timeLimitMinutes,
    maxViolations: quizStore.settings.maxViolations,
    questions
  });
});

// Record Answer
app.post('/api/participant/answer', (req, res) => {
  const token = getParticipantToken(req);
  if (!token) return res.status(401).json({ error: 'Session token missing.' });

  const { questionId, optionIndex } = req.body;
  if (typeof questionId !== 'number' || typeof optionIndex !== 'number') {
    return res.status(400).json({ error: 'Invalid questionId or optionIndex.' });
  }

  try {
    const updated = quizStore.recordAnswer(token, questionId, optionIndex);
    res.json({
      ok: true,
      answers: updated.answers,
      status: updated.status
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Record Tab Switch / Focus Violation
app.post('/api/participant/violation', (req, res) => {
  const token = getParticipantToken(req);
  if (!token) return res.status(401).json({ error: 'Session token missing.' });

  const { eventType, questionIndex } = req.body;
  if (!eventType) return res.status(400).json({ error: 'Missing eventType.' });

  try {
    const result = quizStore.recordViolation(
      token,
      eventType,
      typeof questionIndex === 'number' ? questionIndex : 0
    );
    res.json({
      ok: true,
      violations: result.participant.violations,
      status: result.participant.status,
      autoSubmitted: result.autoSubmitted,
      message: result.message
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Final Test Submission
app.post('/api/participant/submit', (req, res) => {
  const token = getParticipantToken(req);
  if (!token) return res.status(401).json({ error: 'Session token missing.' });

  try {
    const submitted = quizStore.submitTest(token, false);
    res.json({
      ok: true,
      score: submitted.score,
      totalQuestions: submitted.totalQuestions,
      correctCount: submitted.correctCount,
      wrongCount: submitted.wrongCount,
      unansweredCount: submitted.unansweredCount,
      completionDurationSeconds: submitted.completionDurationSeconds,
      status: submitted.status,
      violations: submitted.violations
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Leaderboard (Public if permitted)
app.get('/api/leaderboard', (_req, res) => {
  const entries = quizStore.getLeaderboard(false);
  res.json({
    leaderboardPublic: quizStore.settings.leaderboardPublic,
    leaderboard: entries
  });
});

// ---------------- ADMIN ROUTES ----------------

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'Admin') {
    return res.json({
      ok: true,
      token: ADMIN_SECRET,
      user: { username: 'admin', role: 'Event Organizer' }
    });
  }
  return res.status(401).json({ error: 'Invalid username or password. Check credentials and try again.' });
});

// Admin Overview
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  res.json(quizStore.getOverview());
});

// Admin Participant Details (Activity Log)
app.get('/api/admin/participant/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const p = quizStore.participants.get(id);
  if (!p) return res.status(404).json({ error: 'Participant not found.' });
  res.json({ participant: p });
});

// Admin Update Settings
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  quizStore.updateSettings(req.body);
  res.json({ ok: true, settings: quizStore.settings });
});

// Admin Get Full Questions (with answers)
app.get('/api/admin/questions', requireAdmin, (_req, res) => {
  res.json({ questions: quizStore.getQuestions() });
});

// Admin Save Questions
app.post('/api/admin/questions', requireAdmin, (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Quiz must contain at least 1 question.' });
  }
  quizStore.setQuestions(questions);
  res.json({ ok: true, questions: quizStore.getQuestions() });
});

// Admin Reset Questions to Default
app.post('/api/admin/questions/reset', requireAdmin, (_req, res) => {
  quizStore.resetQuestions();
  res.json({ ok: true, questions: quizStore.getQuestions() });
});

// Admin Seed Demo Data
app.post('/api/admin/seed-demo', requireAdmin, (_req, res) => {
  quizStore.seedDemoParticipants();
  res.json({ ok: true, message: 'Demo participants seeded.' });
});

// Admin Clear Demo Data
app.post('/api/admin/clear-demo', requireAdmin, (_req, res) => {
  quizStore.clearDemoParticipants();
  res.json({ ok: true, message: 'Demo participants cleared.' });
});

// Admin Reset Event
app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const clearDemo = Boolean(req.body.clearDemo);
  quizStore.resetAll(clearDemo);
  res.json({ ok: true, message: 'Event reset successfully.' });
});

// Admin Export CSV
app.get('/api/admin/export-csv', requireAdmin, (_req, res) => {
  const csv = quizStore.exportCSV();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="tech_test_results.csv"');
  res.send(csv);
});

// Admin Real-Time SSE Stream
app.get('/api/admin/events-stream', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  quizStore.subscribeSSE(res);

  // Send initial state immediately
  res.write(`data: ${JSON.stringify({ type: 'INIT', overview: quizStore.getOverview() })}\n\n`);

  // Heartbeat ping every 25 seconds to keep connection alive
  const interval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(interval);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ---------------- VITE / STATIC SERVING ----------------

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Tech Test Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

export { app };
