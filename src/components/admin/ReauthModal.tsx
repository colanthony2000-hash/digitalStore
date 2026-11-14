import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';

interface ReauthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReauthModal({ open, onClose, onSuccess }: ReauthModalProps) {
  const { firebaseUser, reauthenticateWithPassword, reauthenticateWithGoogle } = useStore();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const hasPasswordProvider = (firebaseUser?.providerData || []).some(
    (p) => p.providerId === 'password'
  );

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await reauthenticateWithPassword(password);
    setLoading(false);
    if (!res.ok) {
      setError(res.message || 'Password verification failed.');
      return;
    }
    setPassword('');
    onSuccess();
  };

  const handleGoogleReauth = async () => {
    setLoading(true);
    setError(null);
    const res = await reauthenticateWithGoogle();
    setLoading(false);
    if (!res.ok) {
      setError(res.message || 'Google verification failed.');
      return;
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#D5CCB9] rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[#0A264A]">
            <LockKeyhole className="w-5 h-5" />
            <h3 className="font-display text-lg font-bold text-slate-900">
              Confirm Identity to Continue
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          This sensitive operations action requires recent authentication (within 30 minutes). Verify your active session for{' '}
          <strong className="text-slate-900">{firebaseUser?.email}</strong> to proceed.
        </p>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-lg">
            {error}
          </div>
        )}

        {hasPasswordProvider && (
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Account Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-10 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#0A264A] hover:bg-[#061830] rounded-lg disabled:opacity-60"
            >
              {loading ? 'Verifying...' : 'Confirm Password & Retry Action'}
            </button>
          </form>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleGoogleReauth}
          className="w-full py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg disabled:opacity-60"
        >
          Confirm with Google Sign-In
        </button>
      </div>
    </div>
  );
}
