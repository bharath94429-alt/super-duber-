-- ==============================================================================
-- OFFICIAL SUPABASE REAL-TIME DATABASE MIGRATION FOR TECH TEST
-- QUIZ UUID / VITE_QUIZ_ID: 7c9e6679-7425-40de-944b-e07fc1f90ae7
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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

CREATE TABLE IF NOT EXISTS public.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('started', 'answered', 'tab_switched', 'returned_to_test', 'window_blurred', 'window_focused', 'submitted', 'auto_submitted', 'warning_issued')),
  question_index INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_participants_quiz_id ON public.participants(quiz_id);
CREATE INDEX IF NOT EXISTS idx_participants_last_activity ON public.participants(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_answers_participant_id ON public.answers(participant_id);
CREATE INDEX IF NOT EXISTS idx_answers_quiz_id ON public.answers(quiz_id);
CREATE INDEX IF NOT EXISTS idx_violations_participant_id ON public.violations(participant_id);
CREATE INDEX IF NOT EXISTS idx_violations_quiz_id ON public.violations(quiz_id);
CREATE INDEX IF NOT EXISTS idx_results_quiz_score ON public.results(quiz_id, score DESC, completion_duration_seconds ASC);

ALTER TABLE public.quizzes REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.answers REPLICA IDENTITY FULL;
ALTER TABLE public.violations REPLICA IDENTITY FULL;
ALTER TABLE public.results REPLICA IDENTITY FULL;

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

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Quizzes are viewable by everyone" ON public.quizzes;
CREATE POLICY "Quizzes are viewable by everyone" ON public.quizzes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Quizzes can be modified" ON public.quizzes;
CREATE POLICY "Quizzes can be modified" ON public.quizzes FOR ALL USING (true);

DROP POLICY IF EXISTS "Participants viewable by everyone" ON public.participants;
CREATE POLICY "Participants viewable by everyone" ON public.participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Participants can register" ON public.participants;
CREATE POLICY "Participants can register" ON public.participants FOR INSERT WITH CHECK (score = 0 AND violations_count = 0);

DROP POLICY IF EXISTS "Participants update allowed" ON public.participants;
CREATE POLICY "Participants update allowed" ON public.participants FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Participants delete allowed" ON public.participants;
CREATE POLICY "Participants delete allowed" ON public.participants FOR DELETE USING (true);

DROP POLICY IF EXISTS "Answers viewable by everyone" ON public.answers;
CREATE POLICY "Answers viewable by everyone" ON public.answers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Answers can be inserted or updated" ON public.answers;
CREATE POLICY "Answers can be inserted or updated" ON public.answers FOR ALL USING (true);

DROP POLICY IF EXISTS "Violations viewable by everyone" ON public.violations;
CREATE POLICY "Violations viewable by everyone" ON public.violations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Violations insert allowed" ON public.violations;
CREATE POLICY "Violations insert allowed" ON public.violations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Results viewable by everyone" ON public.results;
CREATE POLICY "Results viewable by everyone" ON public.results FOR SELECT USING (true);

DROP POLICY IF EXISTS "Results insert and update allowed" ON public.results;
CREATE POLICY "Results insert and update allowed" ON public.results FOR ALL USING (true);

-- Insert Official TECH TEST quiz record
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
      "topic": "Programming Fundamentals",
      "text": "Which built-in Python data structure is immutable and defined using parentheses ()?",
      "options": ["List", "Tuple", "Dictionary", "Set"],
      "correctIndex": 1
    },
    {
      "id": 2,
      "topic": "Web Development",
      "text": "Which HTTP status code signifies that a requested resource was successfully created on the server?",
      "options": ["200 OK", "201 Created", "204 No Content", "301 Moved Permanently"],
      "correctIndex": 1
    },
    {
      "id": 3,
      "topic": "Data Structures",
      "text": "Which data structure is primarily used to implement Breadth-First Search (BFS) in a graph?",
      "options": ["Stack", "Queue", "Priority Queue", "Binary Search Tree"],
      "correctIndex": 1
    },
    {
      "id": 4,
      "topic": "Database Systems",
      "text": "In SQL, which clause is used to filter records after aggregate functions (like COUNT, SUM, AVG) have been applied?",
      "options": ["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
      "correctIndex": 1
    },
    {
      "id": 5,
      "topic": "Operating Systems",
      "text": "What condition occurs when a CPU spends more time swapping virtual memory pages in and out of disk than executing processes?",
      "options": ["Deadlock", "Thrashing", "Starvation", "Context Switching"],
      "correctIndex": 1
    },
    {
      "id": 6,
      "topic": "Computer Networks",
      "text": "What is the standard port number used for secure HTTPS web traffic?",
      "options": ["21", "80", "443", "8080"],
      "correctIndex": 2
    },
    {
      "id": 7,
      "topic": "Algorithms",
      "text": "What is the average time complexity of searching for a key in a standard Hash Table?",
      "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
      "correctIndex": 0
    },
    {
      "id": 8,
      "topic": "Software Engineering",
      "text": "In Git, which command creates a new branch and immediately switches to it in a single step?",
      "options": ["git branch -d", "git checkout -b", "git merge --squash", "git pull --rebase"],
      "correctIndex": 1
    },
    {
      "id": 9,
      "topic": "Software Architecture",
      "text": "Which core Object-Oriented Programming (OOP) principle restricts direct access to an object''s internal state and bundles data with methods?",
      "options": ["Encapsulation", "Inheritance", "Polymorphism", "Abstraction"],
      "correctIndex": 0
    },
    {
      "id": 10,
      "topic": "Information Security",
      "text": "Which cryptographic algorithm is an asymmetric (public-key) cipher widely used for secure data transmission and digital signatures?",
      "options": ["AES", "DES", "RSA", "Blowfish"],
      "correctIndex": 2
    }
  ]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  subtitle = EXCLUDED.subtitle,
  questions = EXCLUDED.questions,
  total_questions = EXCLUDED.total_questions,
  updated_at = now();
