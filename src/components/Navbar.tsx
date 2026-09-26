import React from 'react';
import { Shield, Trophy, LayoutDashboard, UserCheck } from 'lucide-react';
import { EventState } from '../shared/types';

interface NavbarProps {
  currentView: 'quiz' | 'leaderboard' | 'admin-login' | 'admin-dashboard';
  onNavigate: (view: 'quiz' | 'leaderboard' | 'admin-login' | 'admin-dashboard') => void;
  isAdminLoggedIn: boolean;
  onAdminLogout: () => void;
  eventState: EventState;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  isAdminLoggedIn,
  onAdminLogout,
  eventState
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('quiz')}
            className="flex items-center gap-2 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center font-bold text-sm tracking-tight shadow-sm">
              TT
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-stone-900 group-hover:text-stone-700 transition-colors">
                TECH TEST
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-stone-600 font-normal">
                Technical Quiz Competition
              </span>
            </div>
          </button>

          {/* Event State Pill */}
          <div className="hidden md:flex items-center gap-1.5 ml-2 pl-3 border-l border-stone-200">
            <span
              className={`w-2 h-2 rounded-full ${
                eventState === 'ACTIVE'
                  ? 'bg-emerald-500 animate-pulse'
                  : eventState === 'WAITING'
                  ? 'bg-amber-500'
                  : 'bg-stone-400'
              }`}
            />
            <span className="text-xs text-stone-600 uppercase font-mono tracking-wider">
              {eventState}
            </span>
          </div>
        </div>

        {/* Center / Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onNavigate('quiz')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              currentView === 'quiz'
                ? 'bg-stone-100 text-stone-900 font-semibold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            Quiz
          </button>

          <button
            onClick={() => onNavigate('leaderboard')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
              currentView === 'leaderboard'
                ? 'bg-stone-100 text-stone-900 font-semibold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Leaderboard</span>
          </button>

          {/* Admin Navigation */}
          {isAdminLoggedIn ? (
            <div className="flex items-center gap-1 sm:gap-2 pl-2 border-l border-stone-200">
              <button
                onClick={() => onNavigate('admin-dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  currentView === 'admin-dashboard'
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-700 hover:bg-stone-100'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={onAdminLogout}
                className="px-2.5 py-1.5 rounded-lg text-xs text-stone-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                title="Log out as Admin"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={() => onNavigate('admin-login')}
              className={`ml-1 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 border border-stone-200 ${
                currentView === 'admin-login'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'text-stone-700 hover:bg-stone-100'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Organizer</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
