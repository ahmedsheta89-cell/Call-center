/**
 * @file src/components/KnowledgeBaseView.tsx
 * Knowledge Base (RAG Ground Truth) & Anti-Hallucination Policy Management Console
 */

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  FileText,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Tag,
  Trash2,
  Edit3,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface KnowledgeDocument {
  id: string;
  title: string;
  category: string;
  tags: string[];
  version: number;
  status: string;
  content: string;
  chunks: Array<{ id: string; content: string; embeddingKeyword: string }>;
  citationsCount: number;
  publishedAt?: string;
  updatedAt: string;
}

export const KnowledgeBaseView: React.FC = () => {
  const [articles, setArticles] = useState<KnowledgeDocument[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // New Article Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('سياسات الاسترجاع');
  const [newTags, setNewTags] = useState('خدمة, استرجاع, معتمد');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);

  // RAG Semantic Tester
  const [ragQuery, setRagQuery] = useState('');
  const [ragResult, setRagResult] = useState<any | null>(null);
  const [ragTesting, setRagTesting] = useState(false);

  const fetchArticles = () => {
    setLoading(true);
    let url = `/api/v1/kb/articles?category=${selectedCategory}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setArticles(d.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchArticles();
  }, [selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArticles();
  };

  const handleCreateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/v1/kb/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          category: newCategory,
          tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
          content: newContent,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setShowAddModal(false);
        setNewTitle('');
        setNewContent('');
        fetchArticles();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الوثيقة من قاعدة المعرفة؟')) return;
    await fetch(`/api/v1/kb/articles/${id}`, { method: 'DELETE' });
    fetchArticles();
  };

  const handleTestRag = async () => {
    if (!ragQuery.trim()) return;
    setRagTesting(true);
    try {
      const res = await fetch('/api/v1/kb/test-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery }),
      });
      const d = await res.json();
      if (d.success) setRagResult(d.data);
    } catch (e) {
      console.error(e);
    } finally {
      setRagTesting(false);
    }
  };

  const categories = ['all', 'سياسات الاسترجاع', 'الباقات والاشتراكات', 'الفوترة والدفع', 'الدعم الفني'];

  return (
    <div className="p-6 h-[calc(100vh-65px)] overflow-y-auto space-y-6 bg-slate-950 text-slate-100">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <span>قاعدة المعرفة ومصادر الحقيقة للذكاء الاصطناعي (RAG Ground Truth)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            إدارة الوثائق والسياسات الرسمية المعتمدة لتدريب واستدلال الـ Copilot وضمان انعدام الهلوسة
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة وثيقة أو سياسة جديدة</span>
        </button>
      </div>

      {/* 2. Interactive RAG Semantic Retrieval Sandbox */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <span>محاكي الاسترجاع الدلالي واختبار الاقتباسات (RAG Grounding Sandbox)</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
            Anti-Hallucination Enforced
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestRag()}
            placeholder="اختبر كيف سيسترجع الـ AI الإجابة (مثال: هل باقة تجوال الخليج تشمل مكالمات استقبال؟)..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleTestRag}
            disabled={ragTesting}
            className="px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{ragTesting ? 'جارٍ الفحص...' : 'فحص RAG'}</span>
          </button>
        </div>

        {ragResult && (
          <div className="bg-slate-950 rounded-2xl p-4 border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>النتيجة المولدة مع مرساة الاقتباس الموثقة:</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                درجة المطابقة: {Math.round(ragResult.confidence * 100)}%
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
              {ragResult.answer}
            </p>

            {ragResult.matchedChunks?.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-bold text-slate-400">المقاطع الدلالية المسترجعة (Chunks):</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ragResult.matchedChunks.map((chunk: any, i: number) => (
                    <div key={i} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono">
                        <span className="truncate">{chunk.documentTitle}</span>
                        <span>{Math.round(chunk.similarity * 100)}% مطابقة</span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-3">{chunk.chunkContent}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Search, Category Filter & Documents List */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
            <Search className="w-3.5 h-3.5 absolute right-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="البحث في عناوين ونصوص السياسات..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </form>

          {/* Categories */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-xl transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                }`}
              >
                {cat === 'all' ? 'جميع التصنيفات' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Document Cards */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">جارٍ استرجاع وثائق المعرفة...</div>
        ) : articles.length > 0 ? (
          <div className="space-y-3">
            {articles.map((art) => {
              const isExpanded = expandedDocId === art.id;
              return (
                <div
                  key={art.id}
                  className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 hover:border-slate-700 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{art.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                          {art.category}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                          v{art.version}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        <span>{art.chunks?.length || 1} مقاطع دلالية (Chunks)</span>
                        <span>•</span>
                        <span>{art.citationsCount} اقتباس موثق</span>
                        <span>•</span>
                        <span>آخر تحديث: {new Date(art.updatedAt).toLocaleDateString('ar-SA')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedDocId(isExpanded ? null : art.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        <span>{isExpanded ? 'إخفاء' : 'عرض'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteArticle(art.id)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                        title="حذف الوثيقة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Content View */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 mb-1">المحتوى الكامل:</div>
                        <p className="text-xs text-slate-200 leading-relaxed bg-slate-900 p-3.5 rounded-xl border border-slate-800/60 whitespace-pre-wrap">
                          {art.content}
                        </p>
                      </div>

                      {/* Chunks Breakdown */}
                      {art.chunks && art.chunks.length > 0 && (
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-indigo-400" />
                            <span>المقاطع المستخرجة للفهرس الدلالي (Vectorized Chunks):</span>
                          </div>
                          <div className="space-y-1.5">
                            {art.chunks.map((ch, idx) => (
                              <div
                                key={ch.id || idx}
                                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2"
                              >
                                <span className="font-mono text-emerald-400 text-[10px] mt-0.5">#{idx + 1}</span>
                                <span className="flex-1">{ch.content}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-500">لا توجد وثائق في هذا التصنيف.</div>
        )}
      </div>

      {/* 4. Add Article Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>إضافة وثيقة أو سياسة جديدة لقاعدة المعرفة</span>
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateArticle} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">عنوان الوثيقة</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="مثال: سياسة إلغاء الاشتراكات الشهرية..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">التصنيف</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="سياسات الاسترجاع">سياسات الاسترجاع</option>
                    <option value="الباقات والاشتراكات">الباقات والاشتراكات</option>
                    <option value="الفوترة والدفع">الفوترة والدفع</option>
                    <option value="الدعم الفني">الدعم الفني</option>
                    <option value="عام">عام</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">الوسوم (مفصولة بفواصل)</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="سياسات, اشتراكات, معتمد"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  محتوى الوثيقة (يفضل تقسيم الفقرات بأسطر فارغة للتقطيع الذكي)
                </label>
                <textarea
                  required
                  rows={6}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="اكتب نصوص السياسة الرسمية والشروط هنا..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{creating ? 'جارٍ الحفظ والتقطيع...' : 'حفظ ونشر'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
