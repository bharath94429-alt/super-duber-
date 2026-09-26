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
  15,
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
    },
    {
      "id": 11,
      "topic": "Computer Fundamentals",
      "text": "What does CPU stand for?",
      "options": ["Central Processing Unit", "Central Power Unit", "Computer Personal Unit", "Control Program Utility"],
      "correctIndex": 0
    },
    {
      "id": 12,
      "topic": "Web Basics",
      "text": "What does HTML stand for in web development?",
      "options": ["High Tech Multi Language", "HyperText Markup Language", "Home Tool Modern Language", "Hyperlink and Text Model"],
      "correctIndex": 1
    },
    {
      "id": 13,
      "topic": "Programming Basics",
      "text": "Which symbol is used for a single-line comment in JavaScript, C, C++, and Java?",
      "options": ["#", "//", "<!--", "/*"],
      "correctIndex": 1
    },
    {
      "id": 14,
      "topic": "Computer Fundamentals",
      "text": "How many bits are there in one standard byte?",
      "options": ["4 bits", "8 bits", "16 bits", "32 bits"],
      "correctIndex": 1
    },
    {
      "id": 15,
      "topic": "Computer Fundamentals",
      "text": "Which of the following is considered volatile primary memory in a computer?",
      "options": ["Hard Disk Drive (HDD)", "RAM (Random Access Memory)", "ROM (Read-Only Memory)", "Optical Disc (DVD)"],
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
