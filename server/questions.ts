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

export const OFFICIAL_QUESTIONS: Question[] = [
  {
    id: 1,
    topic: "Data Structures",
    text: "Which linear data structure follows the LIFO (Last-In, First-Out) principle for insertion and deletion?",
    options: [
      "Queue",
      "Tree",
      "Stack",
      "Linked List"
    ],
    correctIndex: 2
  },
  {
    id: 2,
    topic: "Data Structures",
    text: "Which data structure operates strictly on a FIFO (First-In, First-Out) order?",
    options: [
      "Queue",
      "Stack",
      "Binary Search Tree",
      "Graph"
    ],
    correctIndex: 0
  },
  {
    id: 3,
    topic: "Database Management Systems",
    text: "In relational database design, which normal form is specifically aimed at eliminating transitive functional dependencies?",
    options: [
      "First Normal Form (1NF)",
      "Second Normal Form (2NF)",
      "Third Normal Form (3NF)",
      "Fourth Normal Form (4NF)"
    ],
    correctIndex: 2
  },
  {
    id: 4,
    topic: "Object-Oriented Programming",
    text: "In Java/OOP, what term describes having multiple methods within the same class with the same name but different parameter lists?",
    options: [
      "Method Overriding",
      "Method Overloading",
      "Encapsulation",
      "Dynamic Binding"
    ],
    correctIndex: 1
  },
  {
    id: 5,
    topic: "Operating Systems",
    text: "Which CPU scheduling algorithm assigns a fixed time quantum to each ready process in cyclic order?",
    options: [
      "First Come First Served (FCFS)",
      "Round Robin (RR)",
      "Shortest Job First (SJF)",
      "Priority Scheduling"
    ],
    correctIndex: 1
  },
  {
    id: 6,
    topic: "Computer Networks",
    text: "Which layer of the OSI reference model provides reliable, end-to-end communication and flow control using TCP/UDP?",
    options: [
      "Network Layer",
      "Transport Layer",
      "Data Link Layer",
      "Session Layer"
    ],
    correctIndex: 1
  },
  {
    id: 7,
    topic: "Digital Principles & Computer Organization",
    text: "Which digital logic gate produces a HIGH (1) output if and only if all of its input signals are HIGH (1)?",
    options: [
      "OR Gate",
      "AND Gate",
      "NOR Gate",
      "XOR Gate"
    ],
    correctIndex: 1
  },
  {
    id: 8,
    topic: "Design & Analysis of Algorithms",
    text: "What is the worst-case time complexity of searching an element in a sorted array of size n using Binary Search?",
    options: [
      "O(1)",
      "O(n)",
      "O(log n)",
      "O(n log n)"
    ],
    correctIndex: 2
  },
  {
    id: 9,
    topic: "Operating Systems",
    text: "Which of the following is NOT one of Coffman's four necessary conditions for a system deadlock to occur?",
    options: [
      "Mutual Exclusion",
      "Hold and Wait",
      "No Preemption",
      "Paging and Segmentation"
    ],
    correctIndex: 3
  },
  {
    id: 10,
    topic: "Database Management Systems",
    text: "Which SQL DDL/DML command permanently deletes all rows from a table while retaining its structure and schema?",
    options: [
      "DELETE",
      "TRUNCATE",
      "DROP",
      "ALTER"
    ],
    correctIndex: 1
  }
];

export function getSanitizedQuestions(): SanitizedQuestion[] {
  return OFFICIAL_QUESTIONS.map((q, index) => ({
    id: q.id,
    questionNumber: index + 1,
    text: q.text,
    topic: q.topic,
    options: [...q.options]
  }));
}
