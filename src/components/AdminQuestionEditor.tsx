import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { Question } from '../shared/types';
import { api } from '../services/api';

interface AdminQuestionEditorProps {
  adminToken: string;
  onQuestionsUpdated?: () => void;
}

export const AdminQuestionEditor: React.FC<AdminQuestionEditorProps> = ({
  adminToken,
  onQuestionsUpdated
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState<{
    topic: string;
    text: string;
    options: string[];
    correctIndex: number;
  }>({
    topic: 'Web Development',
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0
  });

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminQuestions(adminToken);
      setQuestions(res.questions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch questions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [adminToken]);

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleSaveQuestionsList = async (updated: Question[]) => {
    setSaving(true);
    setError(null);
    try {
      await api.saveAdminQuestions(adminToken, updated);
      setQuestions(updated);
      showNotification('Quiz questions successfully updated.');
      if (onQuestionsUpdated) onQuestionsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save questions');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setFormData({
      topic: 'Programming & Logic',
      text: '',
      options: ['', '', '', ''],
      correctIndex: 0
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setFormData({
      topic: q.topic,
      text: q.text,
      options: [...q.options],
      correctIndex: q.correctIndex
    });
    setIsModalOpen(true);
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.text.trim()) {
      alert('Please enter the question text.');
      return;
    }
    if (formData.options.some((opt) => !opt.trim())) {
      alert('Please fill out all 4 option fields.');
      return;
    }

    let updated: Question[];
    if (editingQuestion) {
      // Edit existing
      updated = questions.map((q) =>
        q.id === editingQuestion.id
          ? {
              ...q,
              topic: formData.topic.trim(),
              text: formData.text.trim(),
              options: formData.options.map((o) => o.trim()),
              correctIndex: formData.correctIndex
            }
          : q
      );
    } else {
      // Add new
      const nextId = questions.length > 0 ? Math.max(...questions.map((q) => q.id)) + 1 : 1;
      const newQ: Question = {
        id: nextId,
        topic: formData.topic.trim(),
        text: formData.text.trim(),
        options: formData.options.map((o) => o.trim()),
        correctIndex: formData.correctIndex
      };
      updated = [...questions, newQ];
    }

    setIsModalOpen(false);
    await handleSaveQuestionsList(updated);
  };

  const handleDelete = async (id: number) => {
    if (questions.length <= 1) {
      alert('Quiz must contain at least 1 question.');
      return;
    }
    if (!window.confirm('Are you sure you want to remove this question?')) {
      return;
    }
    const updated = questions.filter((q) => q.id !== id);
    await handleSaveQuestionsList(updated);
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;

    const copy = [...questions];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    await handleSaveQuestionsList(copy);
  };

  const handleResetToDefault = async () => {
    if (!window.confirm('Reset quiz to the default 10 technical competition questions?')) {
      return;
    }
    setSaving(true);
    try {
      const res = await api.resetAdminQuestions(adminToken);
      setQuestions(res.questions);
      showNotification('Quiz questions reset to default.');
      if (onQuestionsUpdated) onQuestionsUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to reset questions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <span>Quiz Questions Editor</span>
            <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
              {questions.length} Questions
            </span>
          </h2>
          <p className="text-xs text-stone-600 mt-0.5">
            Add, modify, or rearrange technical questions and configure correct answer keys
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={saving}
            className="px-3 py-1.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-medium flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Question</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Questions List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center text-xs text-stone-500">
          Loading competition questions...
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center">
          <HelpCircle className="w-8 h-8 text-stone-400 mx-auto mb-2" />
          <p className="text-xs text-stone-600 mb-3">No questions defined in the quiz.</p>
          <button
            onClick={handleResetToDefault}
            className="px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold"
          >
            Load 10 Official Questions
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => {
            return (
              <div
                key={q.id}
                className="bg-white rounded-2xl border border-stone-200 shadow-xs p-4 sm:p-5 hover:border-stone-300 transition"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-stone-900 text-white flex items-center justify-center font-mono font-bold text-xs shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider font-mono text-stone-500">
                      {q.topic}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0 || saving}
                      className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-30 text-stone-600"
                      title="Move Question Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === questions.length - 1 || saving}
                      className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 disabled:opacity-30 text-stone-600"
                      title="Move Question Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(q)}
                      disabled={saving}
                      className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 ml-1"
                      title="Edit Question"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(q.id)}
                      disabled={saving || questions.length <= 1}
                      className="p-1.5 rounded-lg border border-stone-200 hover:bg-rose-50 text-rose-600"
                      title="Delete Question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Question Text */}
                <h3 className="text-sm font-semibold text-stone-900 mb-3 leading-snug">
                  {q.text}
                </h3>

                {/* Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {q.options.map((opt, optIdx) => {
                    const isCorrect = optIdx === q.correctIndex;
                    const letter = String.fromCharCode(65 + optIdx);
                    return (
                      <div
                        key={optIdx}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${
                          isCorrect
                            ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 font-medium'
                            : 'bg-stone-50/60 border-stone-200/80 text-stone-700'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-mono font-bold text-[11px] shrink-0 ${
                            isCorrect
                              ? 'bg-emerald-600 text-white'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {letter}
                        </span>
                        <span className="flex-1 truncate">{opt}</span>
                        {isCorrect && (
                          <span className="text-[10px] uppercase font-semibold text-emerald-700 shrink-0">
                            Correct
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Question Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-lg w-full p-6 text-stone-900 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <h3 className="text-base font-bold tracking-tight">
                {editingQuestion ? 'Edit Question' : 'Add New Question'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {/* Category / Topic */}
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1">
                  Topic / Category
                </label>
                <input
                  type="text"
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  placeholder="e.g. Databases, Web Development, Algorithms"
                  required
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
                />
              </div>

              {/* Question Text */}
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1">
                  Question Text
                </label>
                <textarea
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="Enter the technical question text clearly..."
                  rows={3}
                  required
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
                />
              </div>

              {/* 4 Options and designation of correct answer */}
              <div>
                <label className="block text-xs font-semibold text-stone-800 mb-1">
                  Answer Options & Correct Key
                </label>
                <p className="text-[11px] text-stone-500 mb-2">
                  Select the radio button next to the option that is the single correct answer.
                </p>

                <div className="space-y-2">
                  {formData.options.map((opt, optIdx) => {
                    const letter = String.fromCharCode(65 + optIdx);
                    const isSelected = formData.correctIndex === optIdx;

                    return (
                      <div
                        key={optIdx}
                        className={`flex items-center gap-2 p-2 rounded-xl border ${
                          isSelected ? 'border-emerald-400 bg-emerald-50/30' : 'border-stone-200 bg-stone-50'
                        }`}
                      >
                        <label className="flex items-center gap-1.5 cursor-pointer pl-1">
                          <input
                            type="radio"
                            name="correctIndex"
                            checked={isSelected}
                            onChange={() => setFormData({ ...formData, correctIndex: optIdx })}
                            className="text-stone-900 focus:ring-stone-900"
                          />
                          <span className="font-mono font-bold text-xs text-stone-700 w-4">
                            {letter}
                          </span>
                        </label>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...formData.options];
                            newOpts[optIdx] = e.target.value;
                            setFormData({ ...formData, options: newOpts });
                          }}
                          placeholder={`Option ${letter} text`}
                          required
                          className="flex-1 px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition"
                >
                  {saving ? 'Saving...' : editingQuestion ? 'Update Question' : 'Add Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
