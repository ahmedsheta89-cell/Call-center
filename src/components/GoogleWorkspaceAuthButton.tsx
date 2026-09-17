/**
 * @file src/components/GoogleWorkspaceAuthButton.tsx
 * Google Workspace Sign-In & Connected Account Status Component
 * Supports official Google branding, in-memory token lifecycle, and account switcher.
 */

import React, { useState, useEffect } from 'react';
import {
  initWorkspaceAuth,
  googleSignIn,
  googleSignOut,
  getWorkspaceAuthState,
  WorkspaceAuthState,
} from '../lib/googleWorkspaceAuth';
import { LogOut, Mail, FileSpreadsheet, ShieldCheck, Loader2 } from 'lucide-react';

interface GoogleWorkspaceAuthButtonProps {
  compact?: boolean;
  onSuccess?: () => void;
}

export const GoogleWorkspaceAuthButton: React.FC<GoogleWorkspaceAuthButtonProps> = ({
  compact = false,
  onSuccess,
}) => {
  const [authState, setAuthState] = useState<WorkspaceAuthState>(getWorkspaceAuthState());
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = initWorkspaceAuth((state) => {
      setAuthState(state);
    });
    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    try {
      setIsProcessing(true);
      await googleSignIn();
      onSuccess?.();
    } catch (err) {
      console.error('Sign-in failed', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsProcessing(true);
      await googleSignOut();
    } catch (err) {
      console.error('Sign-out failed', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // If user is authenticated with Google Workspace Access Token
  if (authState.isAuthenticated && authState.user) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-xs">
          {authState.user.photoURL ? (
            <img
              src={authState.user.photoURL}
              alt={authState.user.displayName || 'Google User'}
              className="w-5 h-5 rounded-full border border-emerald-400"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
              {authState.user.displayName?.[0] || 'G'}
            </div>
          )}
          <span className="text-emerald-300 font-medium truncate max-w-[120px]">
            {authState.user.displayName || authState.user.email}
          </span>
          <button
            onClick={handleSignOut}
            disabled={isProcessing}
            title="تسجيل الخروج من Google Workspace"
            className="text-slate-400 hover:text-rose-400 p-0.5 rounded transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-emerald-500/30 shadow-sm">
        <div className="flex items-center gap-3">
          {authState.user.photoURL ? (
            <img
              src={authState.user.photoURL}
              alt={authState.user.displayName || 'Google User'}
              className="w-9 h-9 rounded-full border-2 border-emerald-500/50"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-sm">
              {authState.user.displayName?.[0] || 'G'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">
                {authState.user.displayName || 'حساب Google متصل'}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3" />
                متصل ومصرّح
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">{authState.user.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <Mail className="w-3.5 h-3.5 text-rose-400" />
            <span>Gmail</span>
            <span className="text-slate-600">|</span>
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sheets</span>
          </div>

          <button
            onClick={handleSignOut}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition"
          >
            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    );
  }

  // Official styled "Sign in with Google" button
  return (
    <button
      onClick={handleSignIn}
      disabled={isProcessing}
      className={`inline-flex items-center justify-center gap-2.5 rounded-xl font-medium transition-all shadow-sm ${
        compact
          ? 'px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-xs'
          : 'px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-semibold shadow'
      } ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {/* Official Google Vector Logo */}
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      {isProcessing ? (
        <span className="flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          جاري الاتصال...
        </span>
      ) : (
        <span>تسجيل الدخول باستخدام Google</span>
      )}
    </button>
  );
};
