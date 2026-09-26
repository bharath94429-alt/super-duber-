import React, { useState } from 'react';
import { ArrowRight, AlertCircle, Sparkles, Building2, User, Hash } from 'lucide-react';
import { api } from '../services/api';
import { RegisterResponse } from '../services/api';

interface ParticipantRegisterProps {
  onSuccess: (data: RegisterResponse) => void;
  eventState: string;
}

export const ParticipantRegister: React.FC<ParticipantRegisterProps> = ({
  onSuccess,
  eventState
}) => {
  const [name, setName] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedId = participantId.trim().toUpperCase();

    if (!trimmedName) {
      setError('Please enter your Full Name.');
      return;
    }
    if (!trimmedId) {
      setError('Please enter your Participant ID or Registration Number.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.register({
        name: trimmedName,
        participantId: trimmedId,
        department: department.trim()
      });
      onSuccess(response);
    } catch (err: any) {
      setError(err.message || 'Failed to register. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8">
      {/* Title block */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Technical Quiz Competition
        </h1>
        <p className="text-xs text-stone-600 mt-2">
          Enter your details below to register and commence your quiz session.
        </p>
      </div>

      {/* State notification if not ACTIVE */}
      {eventState === 'WAITING' && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold block">Quiz Not Started</span>
            The event coordinator has not initiated the quiz yet. You will be able to start once the quiz is marked live.
          </div>
        </div>
      )}

      {eventState === 'ENDED' && (
        <div className="mb-6 p-4 rounded-xl bg-stone-100 border border-stone-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
          <div className="text-xs text-stone-800 leading-relaxed">
            <span className="font-semibold block">Competition Concluded</span>
            This round of Tech Test has ended. Registration is closed.
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-7">
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5 uppercase tracking-wide">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
                className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Participant ID */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5 uppercase tracking-wide">
              Participant ID / Roll No. <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value.toUpperCase())}
                placeholder="e.g. TT101 or 2026CS402"
                required
                className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono text-stone-900 placeholder-stone-500 uppercase focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition"
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Must be unique. A participant can have only one active session.
            </p>
          </div>

          {/* Department / College */}
          <div>
            <label className="block text-xs font-semibold text-stone-800 mb-1.5 uppercase tracking-wide">
              College / Department <span className="text-stone-500 text-[10px] lowercase">(optional)</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Computer Science & Eng."
                className="w-full pl-10 pr-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-900 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Submit CTA */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || eventState === 'WAITING' || eventState === 'ENDED'}
              className="w-full min-h-[48px] py-3 px-4 bg-stone-900 text-white rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2 hover:bg-stone-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continue to Instructions</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <div className="text-center mt-6">
        <p className="text-[11px] text-stone-500">
          Official College Technical Day Examination System · Proctoring enabled
        </p>
      </div>
    </div>
  );
};
