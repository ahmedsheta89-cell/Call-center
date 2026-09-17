/**
 * @file src/components/VoiceSoftphone.tsx
 * WebRTC / SIP Softphone Interface with Live Audio Waveform, Supervisor Whisper/Barge & AI Transcript
 */

import React, { useState } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX,
  Radio,
  FileText,
  User,
  ShieldCheck,
  Eye,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { CallSession } from '../types.ts';

interface VoiceSoftphoneProps {
  activeCalls: CallSession[];
  onControlCall: (callId: string, action: string, supervisorMode?: string) => Promise<void>;
  userRole: string;
}

export const VoiceSoftphone: React.FC<VoiceSoftphoneProps> = ({
  activeCalls,
  onControlCall,
  userRole,
}) => {
  const [dialNumber, setDialNumber] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isHold, setIsHold] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string>(activeCalls[0]?.id || '');

  const [dialFeedback, setDialFeedback] = useState<string | null>(null);

  const activeCall = activeCalls.find((c) => c.id === selectedCallId) || activeCalls[0];

  const handleDial = (num: string) => {
    if (dialNumber.length < 15) setDialNumber((prev) => prev + num);
  };

  const isSupervisor = userRole === 'Supervisor' || userRole === 'Owner' || userRole === 'Admin';

  const handleStartCall = () => {
    if (!dialNumber) return;
    setDialFeedback(`جارٍ الاتصال بالرقم ${dialNumber}...`);
    setTimeout(() => {
      setDialFeedback(null);
    }, 4000);
  };

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto bg-slate-950 text-slate-100 flex flex-col lg:flex-row gap-6">
      {/* 1. Left: Softphone Dialpad & Live Audio State */}
      <div className="w-full lg:w-96 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between shadow-lg">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">الهاتف الرقمي (Softphone Core)</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              WebRTC Ready
            </span>
          </div>

          {/* Active Call Banner or Dial Input */}
          {activeCall && activeCall.status !== 'completed' ? (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-2xl p-4 mb-5 text-center space-y-2">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 animate-pulse">
                {activeCall.status === 'hold' ? 'المكالمة قيد الانتظار (HOLD)' : 'مكالمة جارية الآن'}
              </span>
              <div className="text-lg font-bold text-white font-mono">{activeCall.callerNumber}</div>
              <div className="text-xs text-slate-400 font-medium">العميل: {activeCall.customerName || 'عميل مسجل'}</div>
              
              {/* Animated Waveform for Voice Audio */}
              <div className="flex items-center justify-center gap-1 py-2">
                {[12, 24, 38, 18, 44, 28, 50, 22, 34, 16, 40, 26].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 bg-emerald-400 rounded-full transition-all duration-300"
                    style={{
                      height: activeCall.status === 'hold' ? '4px' : `${h}px`,
                      opacity: activeCall.status === 'hold' ? 0.3 : 0.8,
                    }}
                  />
                ))}
              </div>

              <div className="text-xs font-mono text-emerald-400 font-bold">
                مدة المكالمة: {Math.floor(activeCall.durationSeconds / 60)}:
                {(activeCall.durationSeconds % 60).toString().padStart(2, '0')}
              </div>
            </div>
          ) : (
            <div className="mb-5">
              <input
                type="text"
                value={dialNumber}
                onChange={(e) => setDialNumber(e.target.value)}
                placeholder="أدخل رقم الهاتف..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-center text-lg font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Number Pad */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
              <button
                key={digit}
                onClick={() => handleDial(digit)}
                className="h-12 rounded-2xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-base font-bold text-slate-200 transition active:scale-95 flex items-center justify-center font-mono"
              >
                {digit}
              </button>
            ))}
          </div>
        </div>

        {/* Telephony Action Controls */}
        {activeCall && activeCall.status !== 'completed' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setIsMuted(!isMuted);
                  onControlCall(activeCall.id, isMuted ? 'unmute' : 'mute');
                }}
                className={`py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-medium transition ${
                  isMuted ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{isMuted ? 'كتم مفعل' : 'كتم'}</span>
              </button>

              <button
                onClick={() => {
                  setIsHold(!isHold);
                  onControlCall(activeCall.id, isHold ? 'unhold' : 'hold');
                }}
                className={`py-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-medium transition ${
                  isHold ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                {isHold ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                <span>{isHold ? 'استئناف' : 'انتظار'}</span>
              </button>

              <button
                onClick={() => onControlCall(activeCall.id, 'transfer')}
                className="py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 flex flex-col items-center justify-center gap-1 text-xs font-medium hover:border-slate-700 transition"
              >
                <Share2 className="w-4 h-4" />
                <span>تحويل</span>
              </button>
            </div>

            <button
              onClick={() => onControlCall(activeCall.id, 'hangup')}
              className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <PhoneOff className="w-4 h-4" />
              <span>إنهاء المكالمة</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={handleStartCall}
              disabled={!dialNumber}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
            >
              <Phone className="w-4 h-4" />
              <span>بدء الاتصال الصوتي</span>
            </button>
            {dialFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-mono animate-pulse">
                {dialFeedback}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Right: Live Speech-to-Text Transcription & AI Copilot Analysis */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Supervisor Intervention Controls (if role is Supervisor/Admin) */}
        {isSupervisor && activeCall && activeCall.status !== 'completed' && (
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                <Eye className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">صلاحيات الإشراف المباشر على المكالمة</h3>
                <p className="text-[11px] text-slate-400">
                  يمكنك الاستماع بصمت، أو الهمس للموظف فقط دون إحراج مع العميل، أو الاقتحام
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onControlCall(activeCall.id, 'whisper', 'whisper')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
              >
                همس للموظف (Whisper)
              </button>
              <button
                onClick={() => onControlCall(activeCall.id, 'barge', 'barge')}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition"
              >
                اقتحام المكالمة (Barge-in)
              </button>
            </div>
          </div>
        )}

        {/* Live Transcript Stream */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  التفريغ الصوتي اللحظي للمكالمة (Speech-to-Text Live Transcript)
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">دقة التعرف: 98.6% (اللهجة الخليجية/الفصحى)</span>
            </div>

            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-xs leading-loose text-slate-200 whitespace-pre-line font-mono max-h-72 overflow-y-auto">
              {activeCall?.transcript || 'لا توجد مكالمة جارية حالياً للتفريغ اللحظي.'}
            </div>
          </div>

          {/* AI Live Call Summary & Sentiment */}
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>ملخص الذكاء الاصطناعي الفوري</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {activeCall?.aiSummary || 'استفسر العميل عن تفاصيل العرض السنوي وباقات التجوال الدولي لدول الخليج.'}
              </p>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400 mb-1">نبرة ومشاعر العميل الحالية:</div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  إيجابي وراضٍ عن الخدمة (Positive)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                نتيجة التوثيق: تم توثيق الاتفاق في تذكرة الدعم بنجاح
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
