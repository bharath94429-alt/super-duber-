import { Question } from '../shared/types';

export const DEFAULT_OFFICIAL_QUESTIONS: Question[] = [
  {
    id: 1,
    topic: "Programming Fundamentals",
    text: "Which built-in Python data structure is immutable and defined using parentheses ()?",
    options: [
      "List",
      "Tuple",
      "Dictionary",
      "Set"
    ],
    correctIndex: 1
  },
  {
    id: 2,
    topic: "Web Development",
    text: "Which HTTP status code signifies that a requested resource was successfully created on the server?",
    options: [
      "200 OK",
      "201 Created",
      "204 No Content",
      "301 Moved Permanently"
    ],
    correctIndex: 1
  },
  {
    id: 3,
    topic: "Data Structures",
    text: "Which data structure is primarily used to implement Breadth-First Search (BFS) in a graph?",
    options: [
      "Stack",
      "Queue",
      "Priority Queue",
      "Binary Search Tree"
    ],
    correctIndex: 1
  },
  {
    id: 4,
    topic: "Database Systems",
    text: "In SQL, which clause is used to filter records after aggregate functions (like COUNT, SUM, AVG) have been applied?",
    options: [
      "WHERE",
      "HAVING",
      "GROUP BY",
      "ORDER BY"
    ],
    correctIndex: 1
  },
  {
    id: 5,
    topic: "Operating Systems",
    text: "What condition occurs when a CPU spends more time swapping virtual memory pages in and out of disk than executing processes?",
    options: [
      "Deadlock",
      "Thrashing",
      "Starvation",
      "Context Switching"
    ],
    correctIndex: 1
  },
  {
    id: 6,
    topic: "Computer Networks",
    text: "What is the standard port number used for secure HTTPS web traffic?",
    options: [
      "21",
      "80",
      "443",
      "8080"
    ],
    correctIndex: 2
  },
  {
    id: 7,
    topic: "Algorithms",
    text: "What is the average time complexity of searching for a key in a standard Hash Table?",
    options: [
      "O(1)",
      "O(log n)",
      "O(n)",
      "O(n log n)"
    ],
    correctIndex: 0
  },
  {
    id: 8,
    topic: "Software Engineering",
    text: "In Git, which command creates a new branch and immediately switches to it in a single step?",
    options: [
      "git branch -d",
      "git checkout -b",
      "git merge --squash",
      "git pull --rebase"
    ],
    correctIndex: 1
  },
  {
    id: 9,
    topic: "Software Architecture",
    text: "Which core Object-Oriented Programming (OOP) principle restricts direct access to an object's internal state and bundles data with methods?",
    options: [
      "Encapsulation",
      "Inheritance",
      "Polymorphism",
      "Abstraction"
    ],
    correctIndex: 0
  },
  {
    id: 10,
    topic: "Information Security",
    text: "Which cryptographic algorithm is an asymmetric (public-key) cipher widely used for secure data transmission and digital signatures?",
    options: [
      "AES",
      "DES",
      "RSA",
      "Blowfish"
    ],
    correctIndex: 2
  }
];
