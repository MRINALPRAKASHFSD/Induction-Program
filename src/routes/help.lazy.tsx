import React, { useState, useEffect, useMemo } from 'react';
import { createLazyFileRoute, Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Printer,
  Share2,
  ThumbsUp,
  ThumbsDown,
  Phone,
  HelpCircle,
  BookOpen,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Clock,
  Gauge,
  MessageCircle,
} from 'lucide-react';
import {
  HELP_CATEGORIES,
  HELP_ARTICLES,
  HELP_FAQS,
  type HelpArticle,
  type HelpStep,
  type HelpFAQ,
} from '../data/help-center-data';
import {
  filterArticles,
  highlightMatches,
  getRelatedArticles,
  getCategoryCounts,
  getSuggestedKeywords,
  copyArticleLink,
  parseDeepLink,
} from '../data/help-center-utils';

export const Route = createLazyFileRoute('/help')({
  component: HelpCenterPage,
});

const SESSION_STORAGE_KEY = 'aarambh_help_active_category';

function HelpCenterPage() {
  // Active Category ('all' or category.id)
  const [activeCategory, setActiveCategory] = useState<string>('all');
  // Search query
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Expanded article ID in the Knowledge Base reader view
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  // Toast message state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load category from sessionStorage on mount & handle deep link hash (#article-ID)
  useEffect(() => {
    const savedCat = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (savedCat) {
      setActiveCategory(savedCat);
    }

    const deepArticleId = parseDeepLink();
    if (deepArticleId) {
      const found = HELP_ARTICLES.find((a) => a.id === deepArticleId);
      if (found) {
        setActiveCategory(found.categoryId);
        setActiveArticleId(found.id);
        setTimeout(() => {
          const el = document.getElementById(`article-view-${found.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }
    }
  }, []);

  // Save category to sessionStorage
  const handleSelectCategory = (catId: string) => {
    setActiveCategory(catId);
    sessionStorage.setItem(SESSION_STORAGE_KEY, catId);
    if (activeArticleId) {
      const article = HELP_ARTICLES.find((a) => a.id === activeArticleId);
      if (article && article.categoryId !== catId && catId !== 'all') {
        setActiveArticleId(null);
      }
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  };

  // Filtered articles
  const filteredArticles = useMemo(() => {
    return filterArticles(HELP_ARTICLES, activeCategory, searchQuery);
  }, [activeCategory, searchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    return getCategoryCounts(HELP_ARTICLES);
  }, []);

  const scrollToKnowledgeBase = () => {
    const el = document.getElementById('knowledge-base-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleSelectArticle = (articleId: string) => {
    if (activeArticleId === articleId) {
      setActiveArticleId(null);
    } else {
      setActiveArticleId(articleId);
      window.history.replaceState(null, '', `#article-${articleId}`);
      setTimeout(() => {
        const el = document.getElementById(`article-view-${articleId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfbf9] text-[#2c1208] font-sans selection:bg-[#8a4a22]/20">
      {/* Toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#2c1208] text-[#fdfbf9] px-4 py-2.5 rounded-full shadow-2xl text-xs sm:text-sm font-semibold flex items-center gap-2 border border-white/10"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Subtle Background */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <div className="absolute w-[90vw] h-[90vw] max-w-[1000px] max-h-[1000px] bg-gradient-to-tr from-[#c87038]/5 to-[#8a4a22]/5 rounded-full blur-[120px] opacity-60"></div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 relative z-10">
        {/* Top Navigation */}
        <div className="mb-10">
          <Link
            to="/"
            className="inline-flex items-center text-sm font-semibold text-[#8a4a22] hover:text-[#5a2c14] transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 transition-transform duration-300 group-hover:-translate-x-1" />
            Back to Home
          </Link>
        </div>

        {/* Hero Section */}
        <div className="mb-14 text-center max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[#2c1208] mb-4">
            Aarambh Support Hub
          </h1>
          <p className="text-base sm:text-lg text-[#5a2c14]/75 mb-8">
            Official self-service knowledge base & onboarding support for K.R.
            Mangalam University Class of 2026.
          </p>

          {/* Universal Search Bar */}
          <div className="relative max-w-2xl mx-auto mb-6">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#8a4a22]">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search help articles, onboarding steps, QR rules..."
              className="w-full pl-12 pr-11 py-4 bg-white/90 backdrop-blur-md border border-[#8a4a22]/20 rounded-2xl shadow-lg shadow-[#8a4a22]/5 text-[#2c1208] placeholder:text-[#5a2c14]/50 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/30 focus:border-[#8a4a22] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#5a2c14]/60 hover:text-[#2c1208] transition-colors"
                aria-label="Clear search"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Quick Filter Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${
                activeCategory === 'all'
                  ? 'bg-[#8a4a22] text-white shadow-sm'
                  : 'bg-white/70 text-[#5a2c14] border border-[#8a4a22]/15 hover:border-[#8a4a22]/40'
              }`}
            >
              All Categories
            </button>
            {HELP_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 ${
                  activeCategory === cat.id
                    ? 'bg-[#8a4a22] text-white shadow-sm'
                    : 'bg-white/70 text-[#5a2c14] border border-[#8a4a22]/15 hover:border-[#8a4a22]/40'
                }`}
              >
                {cat.title}
              </button>
            ))}
          </div>
        </div>

        {/* Popular Help Topics (8 Category Cards) */}
        {!searchQuery && (
          <div className="mb-16">
            <h2 className="text-xl sm:text-2xl font-bold text-[#2c1208] tracking-tight mb-6">
              Popular Help Topics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {HELP_CATEGORIES.map((cat) => {
                const IconComponent = cat.icon;
                const count = categoryCounts[cat.id] || 0;
                const isSelected = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      handleSelectCategory(cat.id);
                      scrollToKnowledgeBase();
                    }}
                    className={`text-left p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-white border-[#8a4a22] shadow-md shadow-[#8a4a22]/10 ring-1 ring-[#8a4a22]'
                        : 'bg-white/70 border-[#8a4a22]/15 hover:bg-white hover:border-[#8a4a22]/40 hover:shadow-lg hover:shadow-[#8a4a22]/5'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-10 h-10 rounded-xl bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22] group-hover:bg-[#8a4a22] group-hover:text-white transition-colors duration-300">
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#8a4a22]/10 text-[#8a4a22]">
                          {count} {count === 1 ? 'article' : 'articles'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#2c1208] mb-1 group-hover:text-[#8a4a22] transition-colors">
                        {cat.title}
                      </h3>
                      <p className="text-xs text-[#5a2c14]/75 line-clamp-2">
                        {cat.description}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center text-xs font-semibold text-[#8a4a22] opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                      <span>Explore articles</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Knowledge Base Section */}
        <div id="knowledge-base-section" className="mb-20 scroll-mt-6">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Desktop Sticky Sidebar / Mobile Category Dropdown */}
            <div className="lg:w-72 flex-shrink-0">
              <div className="bg-white/80 backdrop-blur-md border border-[#8a4a22]/15 rounded-2xl p-4 sticky top-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#5a2c14]/60 px-3 mb-3">
                  Knowledge Base Categories
                </h3>
                <nav className="space-y-1">
                  <button
                    type="button"
                    onClick={() => handleSelectCategory('all')}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-between transition-colors ${
                      activeCategory === 'all'
                        ? 'bg-[#8a4a22] text-white'
                        : 'text-[#5a2c14] hover:bg-[#8a4a22]/10'
                    }`}
                  >
                    <span>All Articles</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        activeCategory === 'all'
                          ? 'bg-white/20 text-white'
                          : 'bg-[#8a4a22]/10 text-[#8a4a22]'
                      }`}
                    >
                      {HELP_ARTICLES.length}
                    </span>
                  </button>
                  {HELP_CATEGORIES.map((cat) => {
                    const IconComponent = cat.icon;
                    const count = categoryCounts[cat.id] || 0;
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategory(cat.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-between transition-colors ${
                          isActive
                            ? 'bg-[#8a4a22] text-white'
                            : 'text-[#5a2c14] hover:bg-[#8a4a22]/10'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <IconComponent className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{cat.title}</span>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-[#8a4a22]/10 text-[#8a4a22]'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Articles List / Viewer */}
            <div className="flex-1 min-w-0">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#2c1208]">
                  {activeCategory === 'all'
                    ? 'All Knowledge Base Articles'
                    : HELP_CATEGORIES.find((c) => c.id === activeCategory)
                        ?.title || 'Articles'}
                </h2>
                <span className="text-xs font-medium text-[#5a2c14]/70">
                  Showing {filteredArticles.length} of {HELP_ARTICLES.length}
                </span>
              </div>

              {/* Empty Search State */}
              {filteredArticles.length === 0 ? (
                <div className="bg-white/80 border border-[#8a4a22]/15 rounded-2xl p-10 text-center">
                  <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#8a4a22]/10 flex items-center justify-center text-[#8a4a22]">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#2c1208] mb-2">
                    No matching help articles found
                  </h3>
                  <p className="text-sm text-[#5a2c14]/70 mb-6 max-w-md mx-auto">
                    We couldn't find any articles matching "{searchQuery}". Try
                    searching with one of these keywords:
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                    {getSuggestedKeywords(searchQuery).map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => setSearchQuery(kw)}
                        className="px-3 py-1.5 rounded-full bg-[#8a4a22]/10 text-[#8a4a22] hover:bg-[#8a4a22] hover:text-white text-xs font-semibold transition-colors"
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-5 py-2 bg-[#8a4a22] text-white rounded-full text-xs font-semibold hover:bg-[#5a2c14] transition-colors"
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredArticles.map((article) => {
                    const isExpanded = activeArticleId === article.id;
                    const cat = HELP_CATEGORIES.find(
                      (c) => c.id === article.categoryId
                    );
                    const CatIcon = cat?.icon || BookOpen;

                    return (
                      <div
                        key={article.id}
                        id={`article-view-${article.id}`}
                        className={`bg-white border transition-all duration-300 rounded-2xl overflow-hidden ${
                          isExpanded
                            ? 'border-[#8a4a22] shadow-lg shadow-[#8a4a22]/5 ring-1 ring-[#8a4a22]'
                            : 'border-[#8a4a22]/15 hover:border-[#8a4a22]/40 shadow-sm'
                        }`}
                      >
                        {/* Article Header (Clickable) */}
                        <button
                          type="button"
                          onClick={() => handleSelectArticle(article.id)}
                          className="w-full text-left p-5 sm:p-6 flex items-start justify-between gap-4"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#8a4a22]/10 text-[#8a4a22]">
                                <CatIcon className="w-3.5 h-3.5" />
                                <span>{cat?.title || 'General'}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#fdfbf9] border border-[#8a4a22]/15 text-[#5a2c14]/80">
                                <Gauge className="w-3 h-3 text-[#8a4a22]" />
                                <span>{article.difficulty}</span>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#fdfbf9] border border-[#8a4a22]/15 text-[#5a2c14]/80">
                                <Clock className="w-3 h-3 text-[#8a4a22]" />
                                <span>{article.readTime}</span>
                              </span>
                            </div>

                            <h3 className="text-base sm:text-lg font-bold text-[#2c1208] mb-1">
                              {highlightMatches(article.title, searchQuery)}
                            </h3>
                            <p className="text-xs sm:text-sm text-[#5a2c14]/80">
                              {highlightMatches(article.summary, searchQuery)}
                            </p>
                          </div>
                          <div className="flex-shrink-0 pt-1 text-[#8a4a22]">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </div>
                        </button>

                        {/* Expanded Article Body (Wikipedia/Notion Style) */}
                        {isExpanded && (
                          <div className="px-5 sm:px-6 pb-6 pt-2 border-t border-[#8a4a22]/10 bg-[#fdfbf9]/50">
                            {/* Toolbar (Copy Link, Print, Share) */}
                            <div className="flex items-center justify-end gap-2 mb-6">
                              <button
                                type="button"
                                onClick={async () => {
                                  const ok = await copyArticleLink(article.id);
                                  if (ok) showToast('Article link copied to clipboard!');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#8a4a22]/20 text-[#8a4a22] hover:bg-[#8a4a22]/10 transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Link</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => window.print()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#8a4a22]/20 text-[#5a2c14] hover:bg-[#8a4a22]/10 transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (navigator.share) {
                                    try {
                                      await navigator.share({
                                        title: article.title,
                                        text: article.summary,
                                        url: `${window.location.origin}${window.location.pathname}#article-${article.id}`,
                                      });
                                    } catch {
                                      // Ignore share abort
                                    }
                                  } else {
                                    const ok = await copyArticleLink(
                                      article.id
                                    );
                                    if (ok)
                                      showToast('Article link copied!');
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#8a4a22]/20 text-[#5a2c14] hover:bg-[#8a4a22]/10 transition-colors"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>Share</span>
                              </button>
                            </div>

                            {/* Warnings (if any) */}
                            {article.warnings &&
                              article.warnings.length > 0 && (
                                <div className="mb-6 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 rounded-r-xl">
                                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold text-xs uppercase tracking-wider mb-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                                    <span>Important Warning</span>
                                  </div>
                                  <ul className="space-y-1 text-xs sm:text-sm text-amber-900 dark:text-amber-100">
                                    {article.warnings.map((warn, i) => (
                                      <li
                                        key={i}
                                        className="flex items-start gap-2"
                                      >
                                        <span className="font-bold">•</span>
                                        <span>
                                          {highlightMatches(
                                            warn,
                                            searchQuery
                                          )}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                            {/* Step-by-Step Guide */}
                            <div className="mb-6">
                              <h4 className="text-sm font-bold uppercase tracking-wider text-[#5a2c14]/70 mb-4">
                                Step-by-Step Guide
                              </h4>
                              <div className="space-y-4">
                                {article.steps.map((step, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-white border border-[#8a4a22]/15 rounded-xl p-4 shadow-sm"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="w-6 h-6 rounded-full bg-[#8a4a22] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                        {idx + 1}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h5 className="text-sm font-bold text-[#2c1208] mb-1">
                                          {highlightMatches(
                                            step.title,
                                            searchQuery
                                          )}
                                        </h5>
                                        <p className="text-xs sm:text-sm text-[#5a2c14]/85 mb-2 leading-relaxed">
                                          {highlightMatches(
                                            step.description,
                                            searchQuery
                                          )}
                                        </p>
                                        {step.expectedResult && (
                                          <div className="mt-2.5 px-3 py-2 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                              <span className="font-bold">
                                                Expected Result:{' '}
                                              </span>
                                              <span>
                                                {highlightMatches(
                                                  step.expectedResult,
                                                  searchQuery
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                        {step.mistake && (
                                          <div className="mt-2 px-3 py-2 bg-rose-50/80 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-start gap-2">
                                            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                                            <div>
                                              <span className="font-bold">
                                                Common Mistake:{' '}
                                              </span>
                                              <span>
                                                {highlightMatches(
                                                  step.mistake,
                                                  searchQuery
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Tips (if any) */}
                            {article.tips && article.tips.length > 0 && (
                              <div className="mb-6 bg-[#8a4a22]/5 border-l-4 border-[#8a4a22] p-4 rounded-r-xl">
                                <div className="flex items-center gap-2 text-[#8a4a22] font-bold text-xs uppercase tracking-wider mb-2">
                                  <Lightbulb className="w-4 h-4" />
                                  <span>Pro Tips</span>
                                </div>
                                <ul className="space-y-1 text-xs sm:text-sm text-[#2c1208]">
                                  {article.tips.map((tip, i) => (
                                    <li
                                      key={i}
                                      className="flex items-start gap-2"
                                    >
                                      <span className="font-bold text-[#8a4a22]">
                                        •
                                      </span>
                                      <span>
                                        {highlightMatches(tip, searchQuery)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Related Articles */}
                            <RelatedArticlesSection
                              article={article}
                              allArticles={HELP_ARTICLES}
                              onSelectArticle={handleSelectArticle}
                            />

                            {/* Article Feedback Component */}
                            <ArticleFeedbackWidget
                              articleId={article.id}
                              showToast={showToast}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Frequently Asked Questions (FAQ) Accordion */}
        <div className="mb-20">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#2c1208] mb-2">
              Frequently Asked Questions
            </h2>
            <p className="text-sm sm:text-base text-[#5a2c14]/70">
              Quick answers to the most common questions from new students.
            </p>
          </div>
          <FAQSection
            faqs={HELP_FAQS}
            onOpenArticle={(articleId) => {
              const found = HELP_ARTICLES.find((a) => a.id === articleId);
              if (found) {
                setActiveCategory(found.categoryId);
                setActiveArticleId(articleId);
                setTimeout(() => {
                  const el = document.getElementById(
                    `article-view-${articleId}`
                  );
                  if (el) {
                    el.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }
                }, 100);
              }
            }}
          />
        </div>

        {/* Quick Action Cards */}
        <div className="mb-20">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#2c1208] mb-2">
              Quick Actions
            </h2>
            <p className="text-sm sm:text-base text-[#5a2c14]/70">
              Jump directly to key platform tools & sections.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionCard
              title="Mark Attendance →"
              description="Scan orientation QR badge"
              to="/attendance"
            />
            <QuickActionCard
              title="Browse Clubs →"
              description="Explore campus societies"
              to="/clubs"
            />
            <QuickActionCard
              title="Orientation Schedule →"
              description="View day-by-day timetable"
              to="/schedule"
            />
            <QuickActionCard
              title="Verification Status →"
              description="Check your student badge"
              to="/profile"
            />
          </div>
        </div>

        {/* Transition / Still Need Help Banner */}
        <div className="bg-gradient-to-br from-[#8a4a22] to-[#5a2c14] text-white rounded-3xl p-8 sm:p-10 text-center mb-20 shadow-xl shadow-[#8a4a22]/15">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            Still Need Help?
          </h2>
          <p className="text-sm sm:text-base text-white/85 max-w-xl mx-auto mb-6">
            If you didn't find the answer in our self-service knowledge base,
            our core coordination team is available to assist you.
          </p>
          <a
            href="#coordinators-section"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#8a4a22] font-bold text-sm hover:bg-[#fdfbf9] shadow-md transition-all"
          >
            <span>Contact Platform Coordinators</span>
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>

        {/* Platform Coordinators Section */}
        <div id="coordinators-section" className="mb-20 scroll-mt-6">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#2c1208] mb-2">
              Platform Coordinators
            </h2>
            <p className="text-sm sm:text-base text-[#5a2c14]/70 mb-2">
              For immediate technical assistance or onboarding questions during
              induction hours.
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#8a4a22]/10 text-[#8a4a22]">
              <Clock className="w-3.5 h-3.5" />
              <span>Available during induction hours</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <CoordinatorCard
              name="Mrinal Prakash"
              designation="Platform Lead & Technical Head"
              phone="+91 89203 80253"
              showToast={showToast}
            />
            <CoordinatorCard
              name="Kushagra Bhardwaj"
              designation="Main Tech Coordinator"
              phone="7428690322"
              showToast={showToast}
            />
            <CoordinatorCard
              name="Harsh Dev Jha"
              designation="eOzka Head"
              phone="+91 82879 98676"
              showToast={showToast}
            />
          </div>
        </div>

        {/* Signature Footer */}
        <div className="flex flex-col items-center justify-center w-full pt-16 border-t border-[#8a4a22]/15 text-center">
          <p className="text-[11px] font-bold text-[#5a2c14]/60 uppercase tracking-[0.15em] mb-2">
            &copy; 2026 Aarambh Platform
          </p>
          <p className="text-[10px] font-bold text-[#5a2c14]/40 uppercase tracking-[0.25em] mb-4">
            Crafted by
          </p>
          <img
            src="/eozka-logo-transparent.png"
            alt="eOzka - Augmenting Sentient"
            loading="lazy"
            className="w-[180px] sm:w-[220px] h-auto object-contain opacity-[0.97] transition-transform duration-500 hover:scale-105"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function RelatedArticlesSection({
  article,
  allArticles,
  onSelectArticle,
}: {
  article: HelpArticle;
  allArticles: HelpArticle[];
  onSelectArticle: (id: string) => void;
}) {
  const related = useMemo(() => {
    return getRelatedArticles(article, allArticles, 3);
  }, [article, allArticles]);

  if (related.length === 0) return null;

  return (
    <div className="mb-6 pt-4 border-t border-[#8a4a22]/10">
      <h4 className="text-xs font-bold uppercase tracking-wider text-[#5a2c14]/70 mb-3">
        Related Articles
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {related.map((rel) => (
          <button
            key={rel.id}
            type="button"
            onClick={() => onSelectArticle(rel.id)}
            className="text-left p-3 rounded-xl bg-white border border-[#8a4a22]/15 hover:border-[#8a4a22] transition-colors group"
          >
            <h5 className="text-xs font-bold text-[#2c1208] group-hover:text-[#8a4a22] mb-1 line-clamp-1">
              {rel.title}
            </h5>
            <p className="text-[11px] text-[#5a2c14]/75 line-clamp-2">
              {rel.summary}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ArticleFeedbackWidget({
  articleId,
  showToast,
}: {
  articleId: string;
  showToast: (msg: string) => void;
}) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittedComment, setSubmittedComment] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`aarambh_help_feedback_${articleId}`);
    if (saved === 'yes' || saved === 'no') {
      setFeedback(saved);
    } else {
      setFeedback(null);
    }
    setShowCommentBox(false);
    setSubmittedComment(false);
  }, [articleId]);

  const handleVote = (vote: 'yes' | 'no') => {
    setFeedback(vote);
    localStorage.setItem(`aarambh_help_feedback_${articleId}`, vote);
    if (vote === 'yes') {
      showToast('Thank you for your feedback!');
      setShowCommentBox(false);
    } else {
      setShowCommentBox(true);
    }
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim()) {
      // Persist feedback comment in localStorage
      localStorage.setItem(
        `aarambh_help_feedback_comment_${articleId}`,
        commentText.trim()
      );
      setSubmittedComment(true);
      showToast('Thank you for helping us improve!');
      setCommentText('');
    }
  };

  return (
    <div className="pt-6 border-t border-[#8a4a22]/10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-xs font-semibold text-[#5a2c14]/80">
          Was this article helpful?
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleVote('yes')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              feedback === 'yes'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                : 'bg-white text-[#5a2c14] border-[#8a4a22]/20 hover:bg-[#8a4a22]/10'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>Yes</span>
          </button>
          <button
            type="button"
            onClick={() => handleVote('no')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              feedback === 'no'
                ? 'bg-rose-50 text-rose-700 border-rose-300'
                : 'bg-white text-[#5a2c14] border-[#8a4a22]/20 hover:bg-[#8a4a22]/10'
            }`}
          >
            <ThumbsDown className="w-3.5 h-3.5" />
            <span>No</span>
          </button>
        </div>
      </div>

      {showCommentBox && !submittedComment && (
        <form onSubmit={handleCommentSubmit} className="mt-4 pt-4 border-t border-[#8a4a22]/10">
          <label className="block text-xs font-semibold text-[#2c1208] mb-2">
            What were you looking for? (Optional)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Tell us how we can improve this article..."
              className="flex-1 px-3 py-2 bg-white border border-[#8a4a22]/20 rounded-xl text-xs text-[#2c1208] placeholder:text-[#5a2c14]/50 focus:outline-none focus:ring-1 focus:ring-[#8a4a22]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#8a4a22] text-white rounded-xl text-xs font-semibold hover:bg-[#5a2c14] transition-colors"
            >
              Submit Feedback
            </button>
          </div>
        </form>
      )}

      {submittedComment && (
        <div className="mt-3 text-xs text-emerald-700 font-semibold">
          ✓ Thank you! Your feedback has been recorded.
        </div>
      )}
    </div>
  );
}

function FAQSection({
  faqs,
  onOpenArticle,
}: {
  faqs: HelpFAQ[];
  onOpenArticle: (articleId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {faqs.map((faq) => {
        const isOpen = openId === faq.id;
        return (
          <div
            key={faq.id}
            className="bg-white/80 border border-[#8a4a22]/15 rounded-2xl overflow-hidden transition-colors"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : faq.id)}
              className="w-full text-left p-5 flex items-center justify-between gap-4"
            >
              <span className="text-sm sm:text-base font-bold text-[#2c1208]">
                {faq.question}
              </span>
              <div className="flex-shrink-0 text-[#8a4a22]">
                {isOpen ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[#5a2c14]/85 border-t border-[#8a4a22]/10 bg-[#fdfbf9]/40">
                <p className="mb-3 leading-relaxed">{faq.answerSummary}</p>
                <button
                  type="button"
                  onClick={() => onOpenArticle(faq.targetArticleId)}
                  className="inline-flex items-center gap-1 font-bold text-xs text-[#8a4a22] hover:underline"
                >
                  <span>Read full guide</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="bg-white/80 border border-[#8a4a22]/15 hover:border-[#8a4a22] rounded-2xl p-5 transition-all duration-200 hover:shadow-md group block"
    >
      <h3 className="text-sm sm:text-base font-bold text-[#2c1208] group-hover:text-[#8a4a22] transition-colors mb-1">
        {title}
      </h3>
      <p className="text-xs text-[#5a2c14]/75">{description}</p>
    </Link>
  );
}

function CoordinatorCard({
  name,
  designation,
  phone,
  showToast,
}: {
  name: string;
  designation: string;
  phone: string;
  showToast: (msg: string) => void;
}) {
  const cleanPhone = phone.replace(/\s+/g, '');
  const waNumber = cleanPhone.replace('+', '');

  return (
    <div className="bg-white/80 backdrop-blur-md border border-[#8a4a22]/15 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
      <div>
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#c87038] to-[#8a4a22] text-white font-bold text-base flex items-center justify-center mb-4">
          {name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .substring(0, 2)}
        </div>
        <h3 className="text-lg font-bold text-[#2c1208] mb-1">{name}</h3>
        <p className="text-xs font-semibold text-[#8a4a22] mb-6">
          {designation}
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(phone);
                showToast(`Copied ${name}'s number!`);
              } catch {
                showToast(`Phone: ${phone}`);
              }
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#fdfbf9] border border-[#8a4a22]/20 text-[#5a2c14] hover:bg-[#8a4a22]/10 text-xs font-semibold transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Number</span>
          </button>
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#fdfbf9] border border-[#8a4a22]/20 text-[#5a2c14] hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-xs font-semibold transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </a>
        </div>
        <a
          href={`tel:${cleanPhone}`}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#8a4a22] text-white rounded-xl text-xs font-semibold hover:bg-[#5a2c14] transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Call Coordinator</span>
        </a>
      </div>
    </div>
  );
}
