import React, { useState, useRef } from "react";
import { Download, Maximize2, Minimize2, AlertCircle, RefreshCw } from "lucide-react";
import { exportElementAsPNG, exportToCSV } from "@/lib/export-utils";

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  id: string; // Used for PNG export element targeting
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  onRetry?: () => void;
  onExportCsv?: () => void; // If provided, shows CSV export button
  csvData?: any[]; // Alternative to onExportCsv: pass data directly
  csvFilename?: string;
  children: React.ReactNode;
  className?: string;
}

export function WidgetCard({
  title,
  subtitle,
  id,
  loading,
  error,
  empty,
  onRetry,
  onExportCsv,
  csvData,
  csvFilename,
  children,
  className = "",
}: WidgetCardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      cardRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Listen to fullscreen changes to update state
  React.useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === cardRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleExportCsv = () => {
    if (onExportCsv) {
      onExportCsv();
    } else if (csvData && csvData.length > 0) {
      exportToCSV(csvData, csvFilename || title.replace(/\s+/g, '_').toLowerCase());
    }
  };

  const handleExportPng = () => {
    exportElementAsPNG(`widget-content-${id}`, title.replace(/\s+/g, '_').toLowerCase());
  };

  const showCsvExport = !!onExportCsv || (!!csvData && csvData.length > 0);

  return (
    <div 
      ref={cardRef}
      className={`flex flex-col bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl overflow-hidden transition-all duration-300 ${
        isFullscreen ? "p-8 justify-center" : "p-5"
      } ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {title}
          </h3>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: 1 }}>
          {showCsvExport && (
            <button
              onClick={handleExportCsv}
              title="Export CSV"
              className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleFullscreen}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div 
        id={`widget-content-${id}`} 
        className={`relative flex-1 w-full min-h-[250px] flex items-center justify-center ${isFullscreen ? "h-full" : ""}`}
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 dark:bg-black/20 backdrop-blur-sm z-10 rounded-xl">
            <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-gray-500 font-medium animate-pulse">Loading data...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-6 text-center h-full">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <p className="text-gray-900 dark:text-white font-medium mb-1">Failed to load data</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-xs">{error.message}</p>
            {onRetry && (
              <button 
                onClick={onRetry}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center p-6 text-center h-full">
            <div className="w-16 h-16 mb-4 opacity-50 grayscale">
              {/* Optional Empty State Graphic */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-gray-900 dark:text-white font-medium mb-1">No data available</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters or date range.</p>
          </div>
        ) : (
          <div className="w-full h-full">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
