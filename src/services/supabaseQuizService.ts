import { getSupabaseClient, DEFAULT_QUIZ_ID } from './supabase';
import {
  EventSettings,
  Participant,
  ParticipantSummary,
  Question,
  SanitizedQuestion,
  LeaderboardEntry,
  ActivityLogItem
} from '../shared/types';
import { DEFAULT_OFFICIAL_QUESTIONS } from '../data/defaultQuestions';

export class SupabaseQuizService {
  private quizId: string = DEFAULT_QUIZ_ID;

  constructor(quizId: string = DEFAULT_QUIZ_ID) {
    this.quizId = quizId;
  }

  private getClient() {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        'Supabase client is not configured. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      );
    }
    return client;
  }

  // Ensure default quiz row exists in Supabase
  public async ensureQuizInitialized(): Promise<any> {
    const client = this.getClient();
    const { data: existing, error: selectErr } = await client
      .from('quizzes')
      .select('*')
      .eq('id', this.quizId)
      .maybeSingle();

    if (selectErr) {
      console.warn('Could not query quiz table:', selectErr.message);
      return null;
    }

    if (!existing) {
      const initialQuiz = {
        id: this.quizId,
        name: 'Technical Quiz Competition',
        subtitle: 'Technical Quiz Competition',
        state: 'ACTIVE',
        time_limit_minutes: 10,
        max_violations: 3,
        auto_submit_on_max_violations: true,
        leaderboard_public: true,
        total_questions: DEFAULT_OFFICIAL_QUESTIONS.length,
        questions: DEFAULT_OFFICIAL_QUESTIONS
      };

      const { data: created, error: insertErr } = await client
        .from('quizzes')
        .insert(initialQuiz)
        .select()
        .single();

      if (insertErr) {
        console.error('Failed to create default quiz record:', insertErr.message);
      }
      return created;
    }

    return existing;
  }

  // Get current event status and sanitized questions count
  public async getEventStatus(): Promise<{ settings: EventSettings; totalQuestions: number; questions: SanitizedQuestion[] }> {
    const client = this.getClient();
    let { data: quiz, error } = await client
      .from('quizzes')
      .select('*')
      .eq('id', this.quizId)
      .maybeSingle();

    if (error || !quiz) {
      quiz = await this.ensureQuizInitialized();
    }

    const questions: Question[] = (quiz?.questions as Question[]) || DEFAULT_OFFICIAL_QUESTIONS;
    const sanitized: SanitizedQuestion[] = questions.map((q, idx) => ({
      id: q.id,
      questionNumber: idx + 1,
      text: q.text,
      topic: q.topic,
      options: [...q.options]
    }));

    const settings: EventSettings = {
      name: quiz?.name || 'Technical Quiz Competition',
      subtitle: quiz?.subtitle || 'Technical Quiz Competition',
      state: quiz?.state || 'ACTIVE',
      timeLimitMinutes: quiz?.time_limit_minutes || 10,
      maxViolations: quiz?.max_violations || 3,
      autoSubmitOnMaxViolations: quiz?.auto_submit_on_max_violations ?? true,
      leaderboardPublic: quiz?.leaderboard_public ?? true
    };

    return {
      settings,
      totalQuestions: sanitized.length,
      questions: sanitized
    };
  }

  // Register or resume participant session
  public async registerParticipant(data: {
    participantId: string;
    name: string;
    department?: string;
  }): Promise<{
    token: string;
    participant: any;
    timeRemainingSeconds: number;
    timeLimitMinutes: number;
    questions: SanitizedQuestion[];
  }> {
    const client = this.getClient();
    const status = await this.getEventStatus();

    if (status.settings.state === 'WAITING') {
      throw new Error("Tech Test hasn't started yet. Please wait for the event coordinator to open the test.");
    }
    if (status.settings.state === 'ENDED') {
      throw new Error('Tech Test has concluded. New registrations are closed.');
    }

    const pCode = data.participantId.trim().toUpperCase();
    const pName = data.name.trim();
    const pDept = (data.department || '').trim();

    // Check for existing participant with this participantId in the same quiz
    const { data: existing, error: checkErr } = await client
      .from('participants')
      .select('*')
      .eq('quiz_id', this.quizId)
      .eq('participant_id', pCode)
      .maybeSingle();

    if (checkErr && checkErr.code !== 'PGRST116') {
      console.warn('Error checking existing participant:', checkErr.message);
    }

    let participantRow: any;

    if (existing) {
      if (existing.status === 'submitted' || existing.status === 'flagged') {
        throw new Error(`Candidate ${pCode} has already completed and submitted this test.`);
      }
      participantRow = existing;
      // Update last_activity_at
      await client
        .from('participants')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      // Create new participant in Supabase
      const newParticipant = {
        quiz_id: this.quizId,
        participant_id: pCode,
        name: pName,
        department: pDept,
        status: 'active',
        start_time: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        current_question_index: 0,
        score: 0,
        correct_count: 0,
        wrong_count: 0,
        unanswered_count: status.totalQuestions,
        violations_count: 0,
        is_demo: false
      };

      console.log('[Supabase Service] Executing participants.insert():', newParticipant);
      const { data: created, error: insertErr } = await client
        .from('participants')
        .insert(newParticipant)
        .select()
        .single();

      if (insertErr) {
        console.error('[Supabase Service] participants.insert() FAILED:', insertErr);
        throw new Error(`Registration failed in database: ${insertErr.message} (Code: ${insertErr.code || 'UNKNOWN'})`);
      }
      participantRow = created;
      console.log('[Supabase Service] Participant row created with UUID:', participantRow.id);

      // Log started event in violations table for timeline tracking
      await client.from('violations').insert({
        quiz_id: this.quizId,
        participant_id: participantRow.id,
        event_type: 'started',
        question_index: 0,
        description: 'Candidate registered and started examination'
      });
    }

    // Fetch existing answers if resuming
    const { data: ansRows } = await client
      .from('answers')
      .select('question_id, selected_option')
      .eq('participant_id', participantRow.id);

    const answersMap: Record<number, number> = {};
    if (ansRows) {
      ansRows.forEach((r: any) => {
        answersMap[r.question_id] = r.selected_option;
      });
    }

    // Calculate time remaining
    const startTimeMs = new Date(participantRow.start_time).getTime();
    const elapsedSeconds = Math.floor((Date.now() - startTimeMs) / 1000);
    const totalSeconds = status.settings.timeLimitMinutes * 60;
    const timeRemainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

    return {
      token: participantRow.id,
      participant: {
        id: participantRow.id,
        participantId: participantRow.participant_id,
        name: participantRow.name,
        department: participantRow.department,
        status: participantRow.status,
        answers: answersMap,
        violations: participantRow.violations_count || 0,
        currentQuestionIndex: participantRow.current_question_index || 0,
        startTime: startTimeMs
      },
      timeRemainingSeconds,
      timeLimitMinutes: status.settings.timeLimitMinutes,
      questions: status.questions
    };
  }

  // Get session details for participant (e.g. on page refresh or resume)
  public async getSession(token: string): Promise<any> {
    const client = this.getClient();
    const { data: participant, error: pErr } = await client
      .from('participants')
      .select('*')
      .eq('id', token)
      .single();

    if (pErr || !participant) {
      throw new Error('Participant session not found or expired.');
    }

    const status = await this.getEventStatus();

    // Fetch participant answers
    const { data: ansRows } = await client
      .from('answers')
      .select('question_id, selected_option')
      .eq('participant_id', token);

    const answersMap: Record<number, number> = {};
    if (ansRows) {
      ansRows.forEach((r: any) => {
        answersMap[r.question_id] = r.selected_option;
      });
    }

    const startTimeMs = new Date(participant.start_time).getTime();
    const elapsedSeconds = Math.floor((Date.now() - startTimeMs) / 1000);
    const totalSeconds = status.settings.timeLimitMinutes * 60;
    const timeRemainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

    return {
      participant: {
        id: participant.id,
        participantId: participant.participant_id,
        name: participant.name,
        department: participant.department,
        status: participant.status,
        answers: answersMap,
        violations: participant.violations_count || 0,
        currentQuestionIndex: participant.current_question_index || 0,
        score: participant.score || 0,
        submissionTime: participant.submission_time ? new Date(participant.submission_time).getTime() : null,
        completionDurationSeconds: participant.completion_duration_seconds,
        correctCount: participant.correct_count || 0,
        wrongCount: participant.wrong_count || 0,
        unansweredCount: participant.unanswered_count || 0
      },
      eventState: status.settings.state,
      timeRemainingSeconds,
      timeLimitMinutes: status.settings.timeLimitMinutes,
      maxViolations: status.settings.maxViolations,
      questions: status.questions
    };
  }

  // Record an answer selection
  public async recordAnswer(
    token: string,
    questionId: number,
    optionIndex: number
  ): Promise<{ ok: boolean; answers: Record<number, number>; status: string }> {
    const client = this.getClient();

    // Try executing stored procedure first for server-side validation
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('record_participant_answer', {
        p_participant_id: token,
        p_question_id: questionId,
        p_option_index: optionIndex
      });

      if (!rpcErr && rpcRes) {
        // Return updated answers
        const { data: ansRows } = await client
          .from('answers')
          .select('question_id, selected_option')
          .eq('participant_id', token);

        const answersMap: Record<number, number> = {};
        if (ansRows) {
          ansRows.forEach((r: any) => {
            answersMap[r.question_id] = r.selected_option;
          });
        }
        return { ok: true, answers: answersMap, status: 'active' };
      }
    } catch {
      // Fallback to direct client table operations if RPC not executed yet
    }

    // Direct table operation fallback
    // Fetch quiz to check correct answer
    const { data: quiz } = await client.from('quizzes').select('questions').eq('id', this.quizId).single();
    const questions: Question[] = (quiz?.questions as Question[]) || DEFAULT_OFFICIAL_QUESTIONS;
    const targetQ = questions.find((q) => q.id === questionId);
    const isCorrect = targetQ ? targetQ.correctIndex === optionIndex : false;

    // Upsert answers table
    const { error: ansErr } = await client.from('answers').upsert(
      {
        quiz_id: this.quizId,
        participant_id: token,
        question_id: questionId,
        selected_option: optionIndex,
        is_correct: isCorrect,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'participant_id,question_id' }
    );

    if (ansErr) {
      console.error('Answer upsert failed:', ansErr.message);
    }

    // Recalculate score from answers table
    const { data: allAnswers } = await client
      .from('answers')
      .select('is_correct, question_id, selected_option')
      .eq('participant_id', token);

    const answersMap: Record<number, number> = {};
    let correctCount = 0;
    let wrongCount = 0;

    if (allAnswers) {
      allAnswers.forEach((a: any) => {
        answersMap[a.question_id] = a.selected_option;
        if (a.is_correct) correctCount++;
        else wrongCount++;
      });
    }

    // Update participant
    await client
      .from('participants')
      .update({
        score: correctCount,
        correct_count: correctCount,
        wrong_count: wrongCount,
        unanswered_count: Math.max(0, questions.length - (correctCount + wrongCount)),
        last_activity_at: new Date().toISOString()
      })
      .eq('id', token);

    return { ok: true, answers: answersMap, status: 'active' };
  }

  // Record participant heartbeat (lastActivityAt)
  public async recordHeartbeat(token: string): Promise<void> {
    if (!token) return;
    const client = this.getClient();
    const nowIso = new Date().toISOString();

    // Use RPC if available or direct update
    try {
      await client.rpc('record_participant_heartbeat', { p_participant_id: token });
    } catch {
      await client.from('participants').update({ last_activity_at: nowIso }).eq('id', token);
    }
  }

  // Record proctoring violation (tab-switch, window blur, etc.)
  public async recordViolation(
    token: string,
    eventType: 'started' | 'answered' | 'tab_switched' | 'returned_to_test' | 'window_blurred' | 'window_focused',
    questionIndex: number = 0
  ): Promise<{
    ok: boolean;
    violations: number;
    status: any;
    autoSubmitted: boolean;
    message: string;
  }> {
    const client = this.getClient();

    // Try RPC first
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('record_participant_violation', {
        p_participant_id: token,
        p_event_type: eventType,
        p_question_index: questionIndex
      });

      if (!rpcErr && rpcRes) {
        return rpcRes;
      }
    } catch {
      // Fallback below
    }

    // Direct table fallback
    const { data: participant } = await client.from('participants').select('*').eq('id', token).single();
    const { data: quiz } = await client.from('quizzes').select('*').eq('id', this.quizId).single();

    if (!participant) {
      throw new Error('Participant not found');
    }

    const maxViolations = quiz?.max_violations || 3;
    const autoSubmit = quiz?.auto_submit_on_max_violations ?? true;

    let desc = '';
    switch (eventType) {
      case 'tab_switched':
        desc = 'Candidate navigated away from browser tab';
        break;
      case 'returned_to_test':
        desc = 'Candidate resumed examination tab';
        break;
      case 'window_blurred':
        desc = 'Browser window lost focus';
        break;
      case 'window_focused':
        desc = 'Browser window regained focus';
        break;
      default:
        desc = `Proctoring alert: ${eventType}`;
    }

    // Insert into violations table
    await client.from('violations').insert({
      quiz_id: this.quizId,
      participant_id: token,
      event_type: eventType,
      question_index: questionIndex,
      description: desc
    });

    let currentViolations = participant.violations_count || 0;
    if (eventType === 'tab_switched' || eventType === 'window_blurred') {
      currentViolations += 1;
    }

    let newStatus = participant.status;
    let autoSubmitted = false;

    if (newStatus !== 'submitted' && newStatus !== 'flagged') {
      if (currentViolations >= maxViolations) {
        if (autoSubmit) {
          newStatus = 'flagged';
          autoSubmitted = true;
        } else {
          newStatus = 'warning';
        }
      } else if (currentViolations > 0) {
        newStatus = 'warning';
      }
    }

    await client
      .from('participants')
      .update({
        violations_count: currentViolations,
        status: newStatus,
        last_activity_at: new Date().toISOString()
      })
      .eq('id', token);

    let message = '';
    if (autoSubmitted) {
      message = 'Maximum violation threshold exceeded. Your test has been flagged and submitted.';
      await this.submitTest(token);
    } else if (currentViolations > 0) {
      message = `Security warning: Tab switching or blur detected (${currentViolations}/${maxViolations}).`;
    }

    return {
      ok: true,
      violations: currentViolations,
      status: newStatus,
      autoSubmitted,
      message
    };
  }

  // Submit test and finalize score
  public async submitTest(token: string): Promise<any> {
    const client = this.getClient();

    // Try RPC first
    try {
      const { data: rpcRes, error: rpcErr } = await client.rpc('submit_participant_test', {
        p_participant_id: token
      });
      if (!rpcErr && rpcRes) {
        return rpcRes;
      }
    } catch {
      // Fallback below
    }

    const { data: participant } = await client.from('participants').select('*').eq('id', token).single();
    const { data: quiz } = await client.from('quizzes').select('*').eq('id', this.quizId).single();

    if (!participant) {
      throw new Error('Participant session not found');
    }

    const totalQuestions = quiz?.total_questions || DEFAULT_OFFICIAL_QUESTIONS.length;
    const maxViolations = quiz?.max_violations || 3;
    const now = new Date();
    const startTime = new Date(participant.start_time);
    const durationSeconds = Math.max(1, Math.floor((now.getTime() - startTime.getTime()) / 1000));

    const finalStatus = (participant.violations_count || 0) >= maxViolations ? 'flagged' : 'submitted';

    // Update participant
    await client
      .from('participants')
      .update({
        status: finalStatus,
        submission_time: now.toISOString(),
        completion_duration_seconds: durationSeconds,
        last_activity_at: now.toISOString()
      })
      .eq('id', token);

    // Upsert into results
    await client.from('results').upsert(
      {
        quiz_id: this.quizId,
        participant_id: token,
        participant_code: participant.participant_id,
        name: participant.name,
        department: participant.department,
        score: participant.score || 0,
        total_questions: totalQuestions,
        correct_count: participant.correct_count || 0,
        wrong_count: participant.wrong_count || 0,
        unanswered_count: participant.unanswered_count || 0,
        completion_duration_seconds: durationSeconds,
        violations_count: participant.violations_count || 0,
        status: finalStatus,
        submitted_at: now.toISOString()
      },
      { onConflict: 'participant_id' }
    );

    // Record submission event in violations
    await client.from('violations').insert({
      quiz_id: this.quizId,
      participant_id: token,
      event_type: 'submitted',
      question_index: totalQuestions,
      description: 'Candidate completed and submitted test'
    });

    return {
      ok: true,
      score: participant.score || 0,
      totalQuestions,
      correctCount: participant.correct_count || 0,
      wrongCount: participant.wrong_count || 0,
      unansweredCount: participant.unanswered_count || 0,
      completionDurationSeconds: durationSeconds,
      status: finalStatus,
      violations: participant.violations_count || 0
    };
  }

  // Get Organizer Overview (initial fetch for dashboard)
  public async getAdminOverview(): Promise<any> {
    const client = this.getClient();
    const status = await this.getEventStatus();

    // Fetch all participants for this quiz
    const { data: pRows, error: pErr } = await client
      .from('participants')
      .select('*')
      .eq('quiz_id', this.quizId)
      .order('created_at', { ascending: false });

    if (pErr) {
      console.error('Failed to fetch participants for overview:', pErr.message);
      return {
        totalParticipants: 0,
        activeParticipants: 0,
        submittedParticipants: 0,
        flaggedParticipants: 0,
        settings: status.settings,
        participants: []
      };
    }

    const participantsList = pRows || [];

    // Fetch all answers for these participants
    const { data: allAnswers } = await client
      .from('answers')
      .select('participant_id, question_id, selected_option')
      .eq('quiz_id', this.quizId);

    const answersByParticipant: Record<string, Record<number, number>> = {};
    if (allAnswers) {
      allAnswers.forEach((a: any) => {
        if (!answersByParticipant[a.participant_id]) {
          answersByParticipant[a.participant_id] = {};
        }
        answersByParticipant[a.participant_id][a.question_id] = a.selected_option;
      });
    }

    const now = Date.now();
    const totalQ = status.totalQuestions;

    const summaries: ParticipantSummary[] = participantsList.map((p: any) => {
      const pAnswers = answersByParticipant[p.id] || {};
      const answeredCount = Object.keys(pAnswers).length;
      const startTimeMs = new Date(p.start_time).getTime();
      const elapsedSeconds = Math.floor((now - startTimeMs) / 1000);
      const totalSeconds = status.settings.timeLimitMinutes * 60;
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      let timeDisplay = '';
      if (p.status === 'submitted' || p.status === 'flagged') {
        const dur = p.completion_duration_seconds || elapsedSeconds;
        const m = Math.floor(dur / 60);
        const s = dur % 60;
        timeDisplay = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} elapsed`;
      } else {
        const m = Math.floor(remainingSeconds / 60);
        const s = remainingSeconds % 60;
        timeDisplay = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }

      return {
        id: p.id,
        participantId: p.participant_id,
        name: p.name,
        department: p.department || '',
        progressText: `${answeredCount}/${totalQ}`,
        answeredCount,
        totalQuestions: totalQ,
        progressPercentage: Math.round((answeredCount / totalQ) * 100),
        answers: pAnswers,
        currentQuestionNumber: (p.current_question_index || 0) + 1,
        scoreText: p.status === 'submitted' || p.status === 'flagged' ? `${p.score || 0}/${totalQ}` : '-',
        score: p.score || 0,
        timeRemainingSeconds: remainingSeconds,
        timeDisplay,
        status: p.status,
        violations: p.violations_count || 0,
        isDemo: p.is_demo || false,
        startTime: startTimeMs,
        submissionTime: p.submission_time ? new Date(p.submission_time).getTime() : null,
        lastActivityAt: p.last_activity_at // for heartbeat presence
      } as any;
    });

    const activeCount = summaries.filter((p) => p.status === 'active' || p.status === 'warning').length;
    const submittedCount = summaries.filter((p) => p.status === 'submitted').length;
    const flaggedCount = summaries.filter((p) => p.status === 'flagged').length;

    return {
      totalParticipants: summaries.length,
      activeParticipants: activeCount,
      submittedParticipants: submittedCount,
      flaggedParticipants: flaggedCount,
      settings: status.settings,
      participants: summaries
    };
  }

  // Get full participant details including activity timeline
  public async getParticipantDetail(id: string): Promise<{ participant: Participant }> {
    const client = this.getClient();
    const { data: p, error } = await client.from('participants').select('*').eq('id', id).single();
    if (error || !p) {
      throw new Error('Participant not found');
    }

    // Answers
    const { data: ansRows } = await client
      .from('answers')
      .select('question_id, selected_option')
      .eq('participant_id', id);

    const answersMap: Record<number, number> = {};
    if (ansRows) {
      ansRows.forEach((r: any) => {
        answersMap[r.question_id] = r.selected_option;
      });
    }

    // Activity log from violations table
    const { data: vRows } = await client
      .from('violations')
      .select('*')
      .eq('participant_id', id)
      .order('created_at', { ascending: true });

    const activityLog: ActivityLogItem[] = (vRows || []).map((v: any) => ({
      id: v.id,
      timestamp: new Date(v.created_at).getTime(),
      formattedTime: new Date(v.created_at).toTimeString().split(' ')[0],
      eventType: v.event_type,
      description: v.description,
      questionNumber: v.question_index !== undefined ? v.question_index + 1 : undefined
    }));

    const status = await this.getEventStatus();

    const participant: Participant = {
      id: p.id,
      participantId: p.participant_id,
      name: p.name,
      department: p.department || '',
      startTime: new Date(p.start_time).getTime(),
      submissionTime: p.submission_time ? new Date(p.submission_time).getTime() : null,
      completionDurationSeconds: p.completion_duration_seconds,
      answers: answersMap,
      score: p.score || 0,
      totalQuestions: status.totalQuestions,
      correctCount: p.correct_count || 0,
      wrongCount: p.wrong_count || 0,
      unansweredCount: p.unanswered_count || 0,
      status: p.status,
      violations: p.violations_count || 0,
      currentQuestionIndex: p.current_question_index || 0,
      isDemo: p.is_demo || false,
      activityLog
    };

    return { participant };
  }

  // Update Organizer Settings
  public async updateAdminSettings(settings: Partial<EventSettings>): Promise<any> {
    const client = this.getClient();
    const updates: any = {};
    if (settings.name !== undefined) updates.name = settings.name;
    if (settings.subtitle !== undefined) updates.subtitle = settings.subtitle;
    if (settings.state !== undefined) updates.state = settings.state;
    if (settings.timeLimitMinutes !== undefined) updates.time_limit_minutes = settings.timeLimitMinutes;
    if (settings.maxViolations !== undefined) updates.max_violations = settings.maxViolations;
    if (settings.autoSubmitOnMaxViolations !== undefined)
      updates.auto_submit_on_max_violations = settings.autoSubmitOnMaxViolations;
    if (settings.leaderboardPublic !== undefined) updates.leaderboard_public = settings.leaderboardPublic;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await client.from('quizzes').update(updates).eq('id', this.quizId).select().single();
    if (error) {
      throw new Error(`Failed to update settings: ${error.message}`);
    }
    return { ok: true, settings: data };
  }

  // Get Questions (for question editor)
  public async getQuestions(): Promise<Question[]> {
    const client = this.getClient();
    const { data: quiz } = await client.from('quizzes').select('questions').eq('id', this.quizId).single();
    return (quiz?.questions as Question[]) || DEFAULT_OFFICIAL_QUESTIONS;
  }

  // Save Questions (admin question editor)
  public async saveQuestions(questions: Question[]): Promise<any> {
    const client = this.getClient();
    const { data, error } = await client
      .from('quizzes')
      .update({
        questions,
        total_questions: questions.length,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.quizId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save questions: ${error.message}`);
    }
    return { ok: true, questions: data.questions };
  }

  // Reset Questions to default
  public async resetQuestions(): Promise<any> {
    return this.saveQuestions(DEFAULT_OFFICIAL_QUESTIONS);
  }

  // Reset Event (clears all participants, answers, violations, results from Supabase)
  public async resetEvent(): Promise<void> {
    const client = this.getClient();
    // Cascades delete participants and related rows
    await client.from('participants').delete().eq('quiz_id', this.quizId);
  }

  // Public Leaderboard
  public async getLeaderboard(): Promise<{ leaderboardPublic: boolean; leaderboard: LeaderboardEntry[] }> {
    const client = this.getClient();
    const status = await this.getEventStatus();

    const { data: results, error } = await client
      .from('results')
      .select('*')
      .eq('quiz_id', this.quizId)
      .order('score', { ascending: false })
      .order('completion_duration_seconds', { ascending: true });

    if (error || !results) {
      return {
        leaderboardPublic: status.settings.leaderboardPublic,
        leaderboard: []
      };
    }

    const leaderboard: LeaderboardEntry[] = results.map((r: any, idx: number) => {
      const dur = r.completion_duration_seconds || 0;
      const m = Math.floor(dur / 60);
      const s = dur % 60;
      return {
        rank: idx + 1,
        participantId: r.participant_code,
        name: r.name,
        department: r.department || '',
        score: r.score,
        totalQuestions: r.total_questions,
        completionTimeSeconds: dur,
        completionTimeFormatted: `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
        violations: r.violations_count || 0,
        status: r.status
      };
    });

    return {
      leaderboardPublic: status.settings.leaderboardPublic,
      leaderboard
    };
  }

  // Supabase Realtime Subscription setup for Organizer Dashboard
  public subscribeToRealtime(
    onUpdate: (type: 'participant' | 'violation' | 'answer' | 'quiz', payload: any) => void
  ): { unsubscribe: () => void } {
    const client = this.getClient();
    const channelName = `quiz-room-${this.quizId}-${Date.now()}`;

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `quiz_id=eq.${this.quizId}`
        },
        (payload) => {
          onUpdate('participant', payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'violations',
          filter: `quiz_id=eq.${this.quizId}`
        },
        (payload) => {
          onUpdate('violation', payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'answers',
          filter: `quiz_id=eq.${this.quizId}`
        },
        (payload) => {
          onUpdate('answer', payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quizzes',
          filter: `id=eq.${this.quizId}`
        },
        (payload) => {
          onUpdate('quiz', payload);
        }
      )
      .subscribe((status, err) => {
        if (err) {
          console.warn('Supabase Realtime subscription error:', err);
        }
      });

    return {
      unsubscribe: () => {
        client.removeChannel(channel);
      }
    };
  }
}

export const supabaseQuizService = new SupabaseQuizService();
