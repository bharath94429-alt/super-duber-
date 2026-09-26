-- ==============================================================================
-- OFFICIAL SUPABASE REAL-TIME DATABASE MIGRATION FOR TECH TEST
-- QUIZ UUID / VITE_QUIZ_ID: 7c9e6679-7425-40de-944b-e07fc1f90ae7
--
-- Instructions:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Go to "SQL Editor" -> click "New Query"
-- 3. Paste this ENTIRE script and click "Run"
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. DROP TABLES IF RE-CREATING (clean migration if tables were partially created)
-- Note: Commented out by default; tables are created IF NOT EXISTS below.

-- 3. TABLE: quizzes
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Technical Quiz Competition',
  subtitle TEXT DEFAULT 'Technical Day Quiz Competition',
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('WAITING', 'ACTIVE', 'ENDED', 'RESULTS')),
  time_limit_minutes INTEGER NOT NULL DEFAULT 10,
  max_violations INTEGER NOT NULL DEFAULT 3,
  auto_submit_on_max_violations BOOLEAN NOT NULL DEFAULT true,
  leaderboard_public BOOLEAN NOT NULL DEFAULT true,
  total_questions INTEGER NOT NULL DEFAULT 10,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABLE: participants
CREATE TABLE IF NOT EXISTS public.participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('normal', 'active', 'warning', 'submitted', 'flagged')),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submission_time TIMESTAMPTZ,
  completion_duration_seconds INTEGER,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  violations_count INTEGER NOT NULL DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_quiz_participant_id UNIQUE (quiz_id, participant_id)
);

-- 5. TABLE: answers
CREATE TABLE IF NOT EXISTS public.answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  selected_option INTEGER NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_participant_question UNIQUE (participant_id, question_id)
);

-- 6. TABLE: violations
CREATE TABLE IF NOT EXISTS public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'answered', 'tab_switched', 'returned_to_test', 'window_blurred', 'window_focused', 'submitted', 'auto_submitted', 'warning_issued')),
  question_index INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABLE: results
CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  participant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT DEFAULT '',
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  unanswered_count INTEGER NOT NULL,
  completion_duration_seconds INTEGER NOT NULL,
  violations_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_results_participant UNIQUE (participant_id)
);

-- 8. INDEXES FOR HIGH-THROUGHPUT REALTIME QUERIES
CREATE INDEX IF NOT EXISTS idx_participants_quiz_id ON public.participants(quiz_id);
CREATE INDEX IF NOT EXISTS idx_participants_last_activity ON public.participants(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_participant_id ON public.answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_answers_quiz_id ON public.answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_violations_participant_id ON public.violations(participant_id);
CREATE INDEX IF NOT EXISTS idx_violations_quiz_id ON public.violations(quiz_id);
CREATE INDEX IF NOT EXISTS idx_results_quiz_score ON public.results(quiz_id, score DESC, completion_duration_seconds ASC);

-- 9. REPLICA IDENTITY (Allows Supabase Realtime to broadcast full row payloads on UPDATE)
ALTER TABLE public.quizzes REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.answers REPLICA IDENTITY FULL;
ALTER TABLE public.violations REPLICA IDENTITY FULL;
ALTER TABLE public.results REPLICA IDENTITY FULL;

-- 10. REALTIME PUBLICATION CONFIGURATION
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quizzes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quizzes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'answers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.answers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'violations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.violations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.results;
  END IF;
END $$;

-- 11. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- Quizzes RLS
DROP POLICY IF EXISTS "Quizzes are viewable by everyone" ON public.quizzes;
CREATE POLICY "Quizzes are viewable by everyone" ON public.quizzes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Quizzes can be modified" ON public.quizzes;
CREATE POLICY "Quizzes can be modified" ON public.quizzes
  FOR ALL USING (true);

-- Participants RLS
DROP POLICY IF EXISTS "Participants viewable by everyone" ON public.participants;
CREATE POLICY "Participants viewable by everyone" ON public.participants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Participants can register" ON public.participants;
CREATE POLICY "Participants can register" ON public.participants
  FOR INSERT WITH CHECK (score = 0 AND violations_count = 0);

DROP POLICY IF EXISTS "Participants update allowed" ON public.participants;
CREATE POLICY "Participants update allowed" ON public.participants
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Participants delete allowed" ON public.participants;
CREATE POLICY "Participants delete allowed" ON public.participants
  FOR DELETE USING (true);

-- Answers RLS
DROP POLICY IF EXISTS "Answers viewable by everyone" ON public.answers;
CREATE POLICY "Answers viewable by everyone" ON public.answers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Answers can be inserted or updated" ON public.answers;
CREATE POLICY "Answers can be inserted or updated" ON public.answers
  FOR ALL USING (true);

-- Violations RLS
DROP POLICY IF EXISTS "Violations viewable by everyone" ON public.violations;
CREATE POLICY "Violations viewable by everyone" ON public.violations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Violations insert allowed" ON public.violations;
CREATE POLICY "Violations insert allowed" ON public.violations
  FOR INSERT WITH CHECK (true);

-- Results RLS
DROP POLICY IF EXISTS "Results viewable by everyone" ON public.results;
CREATE POLICY "Results viewable by everyone" ON public.results
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Results insert and update allowed" ON public.results;
CREATE POLICY "Results insert and update allowed" ON public.results
  FOR ALL USING (true);

-- 12. SECURITY DEFINER DATABASE PROCEDURES

-- Heartbeat presence
CREATE OR REPLACE FUNCTION public.record_participant_heartbeat(p_participant_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  UPDATE public.participants
  SET last_activity_at = v_now,
      updated_at = v_now
  WHERE id = p_participant_id;

  RETURN v_now;
END;
$$;

-- Atomic answer grading and score calculation
CREATE OR REPLACE FUNCTION public.record_participant_answer(
  p_participant_id UUID,
  p_question_id INTEGER,
  p_option_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quiz_id UUID;
  v_questions JSONB;
  v_q JSONB;
  v_correct_index INTEGER := -1;
  v_is_correct BOOLEAN := false;
  v_score INTEGER := 0;
  v_correct_count INTEGER := 0;
  v_wrong_count INTEGER := 0;
  v_total_questions INTEGER := 0;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT quiz_id INTO v_quiz_id FROM public.participants WHERE id = p_participant_id;
  IF v_quiz_id IS NULL THEN
    RAISE EXCEPTION 'Participant session not found';
  END IF;

  SELECT questions, total_questions INTO v_questions, v_total_questions FROM public.quizzes WHERE id = v_quiz_id;

  FOR v_q IN SELECT * FROM jsonb_array_elements(v_questions)
  LOOP
    IF (v_q->>'id')::integer = p_question_id THEN
      v_correct_index := (v_q->>'correctIndex')::integer;
      EXIT;
    END IF;
  END LOOP;

  IF v_correct_index >= 0 AND v_correct_index = p_option_index THEN
    v_is_correct := true;
  END IF;

  INSERT INTO public.answers (quiz_id, participant_id, question_id, selected_option, is_correct, updated_at)
  VALUES (v_quiz_id, p_participant_id, p_question_id, p_option_index, v_is_correct, v_now)
  ON CONFLICT (participant_id, question_id)
  DO UPDATE SET
    selected_option = EXCLUDED.selected_option,
    is_correct = EXCLUDED.is_correct,
    updated_at = v_now;

  SELECT
    COALESCE(COUNT(*) FILTER (WHERE is_correct = true), 0),
    COALESCE(COUNT(*) FILTER (WHERE is_correct = false), 0)
  INTO v_correct_count, v_wrong_count
  FROM public.answers
  WHERE participant_id = p_participant_id;

  v_score := v_correct_count;

  UPDATE public.participants
  SET
    score = v_score,
    correct_count = v_correct_count,
    wrong_count = v_wrong_count,
    unanswered_count = GREATEST(0, v_total_questions - (v_correct_count + v_wrong_count)),
    last_activity_at = v_now,
    updated_at = v_now
  WHERE id = p_participant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'questionId', p_question_id,
    'selectedOption', p_option_index,
    'answeredCount', (v_correct_count + v_wrong_count)
  );
END;
$$;

-- Atomic proctoring violation recording & threshold enforcement
CREATE OR REPLACE FUNCTION public.record_participant_violation(
  p_participant_id UUID,
  p_event_type TEXT,
  p_question_index INTEGER DEFAULT 0,
  p_description TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quiz_id UUID;
  v_max_violations INTEGER;
  v_auto_submit BOOLEAN;
  v_current_violations INTEGER;
  v_new_violations INTEGER;
  v_status TEXT;
  v_auto_submitted BOOLEAN := false;
  v_desc TEXT := p_description;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT p.quiz_id, p.violations_count, p.status, q.max_violations, q.auto_submit_on_max_violations
  INTO v_quiz_id, v_current_violations, v_status, v_max_violations, v_auto_submit
  FROM public.participants p
  JOIN public.quizzes q ON q.id = p.quiz_id
  WHERE p.id = p_participant_id;

  IF v_quiz_id IS NULL THEN
    RAISE EXCEPTION 'Participant session not found';
  END IF;

  IF v_desc = '' THEN
    CASE p_event_type
      WHEN 'tab_switched' THEN v_desc := 'Candidate navigated away from browser tab';
      WHEN 'returned_to_test' THEN v_desc := 'Candidate resumed examination tab';
      WHEN 'window_blurred' THEN v_desc := 'Browser window lost focus';
      WHEN 'window_focused' THEN v_desc := 'Browser window regained focus';
      WHEN 'started' THEN v_desc := 'Candidate registered and commenced examination';
      ELSE v_desc := 'Proctoring alert: ' || p_event_type;
    END CASE;
  END IF;

  INSERT INTO public.violations (quiz_id, participant_id, event_type, question_index, description, created_at)
  VALUES (v_quiz_id, p_participant_id, p_event_type, p_question_index, v_desc, v_now);

  IF p_event_type IN ('tab_switched', 'window_blurred') THEN
    v_new_violations := v_current_violations + 1;
  ELSE
    v_new_violations := v_current_violations;
  END IF;

  IF v_status NOT IN ('submitted', 'flagged') THEN
    IF v_new_violations >= v_max_violations THEN
      IF v_auto_submit THEN
        v_status := 'flagged';
        v_auto_submitted := true;
      ELSE
        v_status := 'warning';
      END IF;
    ELSIF v_new_violations > 0 THEN
      v_status := 'warning';
    ELSE
      v_status := 'active';
    END IF;
  END IF;

  UPDATE public.participants
  SET
    violations_count = v_new_violations,
    status = v_status,
    last_activity_at = v_now,
    updated_at = v_now
  WHERE id = p_participant_id;

  RETURN jsonb_build_object(
    'ok', true,
    'violations', v_new_violations,
    'status', v_status,
    'autoSubmitted', v_auto_submitted,
    'message', CASE
      WHEN v_auto_submitted THEN 'Maximum violation threshold exceeded. Your test has been flagged and submitted.'
      WHEN v_new_violations > 0 THEN 'Security warning: Tab switching or blur detected (' || v_new_violations || '/' || v_max_violations || ').'
      ELSE ''
    END
  );
END;
$$;

-- Atomic test finalization & leaderboard result calculation
CREATE OR REPLACE FUNCTION public.submit_participant_test(p_participant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_participant RECORD;
  v_quiz RECORD;
  v_duration INTEGER;
  v_now TIMESTAMPTZ := now();
  v_status TEXT;
BEGIN
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant session not found';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = v_participant.quiz_id;

  v_duration := GREATEST(1, EXTRACT(EPOCH FROM (v_now - v_participant.start_time))::integer);

  IF v_participant.violations_count >= v_quiz.max_violations THEN
    v_status := 'flagged';
  ELSE
    v_status := 'submitted';
  END IF;

  UPDATE public.participants
  SET
    status = v_status,
    submission_time = v_now,
    completion_duration_seconds = v_duration,
    last_activity_at = v_now,
    updated_at = v_now
  WHERE id = p_participant_id;

  INSERT INTO public.results (
    quiz_id,
    participant_id,
    participant_code,
    name,
    department,
    score,
    total_questions,
    correct_count,
    wrong_count,
    unanswered_count,
    completion_duration_seconds,
    violations_count,
    status,
    submitted_at
  ) VALUES (
    v_participant.quiz_id,
    p_participant_id,
    v_participant.participant_id,
    v_participant.name,
    v_participant.department,
    v_participant.score,
    v_quiz.total_questions,
    v_participant.correct_count,
    v_participant.wrong_count,
    v_participant.unanswered_count,
    v_duration,
    v_participant.violations_count,
    v_status,
    v_now
  )
  ON CONFLICT (participant_id)
  DO UPDATE SET
    score = EXCLUDED.score,
    correct_count = EXCLUDED.correct_count,
    wrong_count = EXCLUDED.wrong_count,
    unanswered_count = EXCLUDED.unanswered_count,
    completion_duration_seconds = EXCLUDED.completion_duration_seconds,
    violations_count = EXCLUDED.violations_count,
    status = EXCLUDED.status,
    submitted_at = EXCLUDED.submitted_at;

  INSERT INTO public.violations (quiz_id, participant_id, event_type, question_index, description, created_at)
  VALUES (v_participant.quiz_id, p_participant_id, 'submitted', v_quiz.total_questions, 'Candidate completed and submitted test', v_now);

  RETURN jsonb_build_object(
    'ok', true,
    'score', v_participant.score,
    'totalQuestions', v_quiz.total_questions,
    'correctCount', v_participant.correct_count,
    'wrongCount', v_participant.wrong_count,
    'unansweredCount', v_participant.unanswered_count,
    'completionDurationSeconds', v_duration,
    'status', v_status,
    'violations', v_participant.violations_count
  );
END;
$$;

-- 13. SEED THE OFFICIAL TECH TEST QUIZ RECORD (UUID: 7c9e6679-7425-40de-944b-e07fc1f90ae7)
INSERT INTO public.quizzes (
  id,
  name,
  subtitle,
  state,
  time_limit_minutes,
  max_violations,
  auto_submit_on_max_violations,
  leaderboard_public,
  total_questions,
  questions
) VALUES (
  '7c9e6679-7425-40de-944b-e07fc1f90ae7'::uuid,
  'Technical Quiz Competition',
  'Technical Day Quiz Competition',
  'ACTIVE',
  10,
  3,
  true,
  true,
  10,
  '[
    {
      "id": 1,
      "topic": "Data Structures",
      "text": "Which linear data structure follows the LIFO (Last-In, First-Out) principle for insertion and deletion?",
      "options": ["Queue", "Tree", "Stack", "Linked List"],
      "correctIndex": 2
    },
    {
      "id": 2,
      "topic": "Data Structures",
      "text": "Which data structure operates strictly on a FIFO (First-In, First-Out) order?",
      "options": ["Queue", "Stack", "Binary Search Tree", "Graph"],
      "correctIndex": 0
    },
    {
      "id": 3,
      "topic": "Database Management Systems",
      "text": "In relational database design, which normal form is specifically aimed at eliminating transitive functional dependencies?",
      "options": ["First Normal Form (1NF)", "Second Normal Form (2NF)", "Third Normal Form (3NF)", "Fourth Normal Form (4NF)"],
      "correctIndex": 2
    },
    {
      "id": 4,
      "topic": "Object-Oriented Programming",
      "text": "In Java/OOP, what term describes having multiple methods within the same class with the same name but different parameter lists?",
      "options": ["Method Overriding", "Method Overloading", "Encapsulation", "Dynamic Binding"],
      "correctIndex": 1
    },
    {
      "id": 5,
      "topic": "Operating Systems",
      "text": "Which CPU scheduling algorithm assigns a fixed time quantum to each ready process in cyclic order?",
      "options": ["First Come First Served (FCFS)", "Round Robin (RR)", "Shortest Job First (SJF)", "Priority Scheduling"],
      "correctIndex": 1
    },
    {
      "id": 6,
      "topic": "Computer Networks",
      "text": "Which layer of the OSI reference model provides reliable, end-to-end communication and flow control using TCP/UDP?",
      "options": ["Network Layer", "Transport Layer", "Data Link Layer", "Session Layer"],
      "correctIndex": 1
    },
    {
      "id": 7,
      "topic": "Digital Principles & Computer Organization",
      "text": "Which digital logic gate produces a HIGH (1) output if and only if all of its input signals are HIGH (1)?",
      "options": ["OR Gate", "AND Gate", "NOR Gate", "XOR Gate"],
      "correctIndex": 1
    },
    {
      "id": 8,
      "topic": "Design & Analysis of Algorithms",
      "text": "What is the worst-case time complexity of searching an element in a sorted array of size n using Binary Search?",
      "options": ["O(1)", "O(n)", "O(log n)", "O(n log n)"],
      "correctIndex": 2
    },
    {
      "id": 9,
      "topic": "Operating Systems",
      "text": "Which of the following is NOT one of Coffman''s four necessary conditions for a system deadlock to occur?",
      "options": ["Mutual Exclusion", "Hold and Wait", "No Preemption", "Paging and Segmentation"],
      "correctIndex": 3
    },
    {
      "id": 10,
      "topic": "Database Management Systems",
      "text": "Which SQL DDL/DML command permanently deletes all rows from a table while retaining its structure and schema?",
      "options": ["DELETE", "TRUNCATE", "DROP", "ALTER"],
      "correctIndex": 1
    }
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  subtitle = EXCLUDED.subtitle,
  questions = EXCLUDED.questions,
  total_questions = EXCLUDED.total_questions,
  updated_at = now();
