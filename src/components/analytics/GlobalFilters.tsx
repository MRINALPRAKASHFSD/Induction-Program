import React from "react";
import { Calendar, Filter, X } from "lucide-react";

export type AnalyticsFilters = {
  dateRange: "today" | "yesterday" | "last7" | "last30" | "custom";
  customStartDate?: string;
  customEndDate?: string;
  eventId?: string;
  school?: string;
  department?: string;
  clubId?: string;
  studentType?: string;
  attendanceStatus?: string;
};

interface GlobalFiltersProps {
  filters: AnalyticsFilters;
  onChange: (newFilters: AnalyticsFilters) => void;
  onClear: () => void;
}

export function GlobalFilters({ filters, onChange, onClear }: GlobalFiltersProps) {
  const handleChange = (key: keyof AnalyticsFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = Object.values(filters).some(v => v && v !== "last7"); // assuming last7 is default

  return (
    <div className="bg-white/40 dark:bg-black/20 backdrop-blur-xl border border-white/20 shadow-sm rounded-2xl p-4 mb-6 transition-all duration-300">
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        
        {/* Filter Header / Clear */}
        <div className="flex items-center gap-2 mr-2">
          <Filter className="w-5 h-5 text-indigo-500" />
          <span className="font-semibold text-gray-900 dark:text-white">Filters</span>
          {hasActiveFilters && (
            <button 
              onClick={onClear}
              className="ml-2 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        {/* Date Range Dropdown */}
        <div className="flex items-center bg-white/50 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-white/10 px-3 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/50">
          <Calendar className="w-4 h-4 text-gray-500 mr-2" />
          <select
            value={filters.dateRange}
            onChange={(e) => handleChange("dateRange", e.target.value)}
            className="bg-transparent border-none text-sm text-gray-700 dark:text-gray-200 focus:outline-none appearance-none pr-6 cursor-pointer"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {/* Dynamic Selectors */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <SelectFilter 
            label="School" 
            value={filters.school} 
            onChange={(v) => handleChange("school", v)}
            options={[
              { value: "SOET", label: "SOET (Engineering)" },
              { value: "SOMC", label: "SOMC (Management)" },
              { value: "SOHS", label: "SOHS (Health Sci)" },
              { value: "SOL", label: "SOL (Law)" },
            ]}
          />
          <SelectFilter 
            label="Department" 
            value={filters.department} 
            onChange={(v) => handleChange("department", v)}
            options={[
              { value: "CSE", label: "Computer Science" },
              { value: "BBA", label: "Business Admin" },
              { value: "LAW", label: "Law" },
            ]}
          />
          <SelectFilter 
            label="Event" 
            value={filters.eventId} 
            onChange={(v) => handleChange("eventId", v)}
            options={[
              { value: "event_1", label: "Orientation 2026" },
              { value: "event_2", label: "Tech Expo" },
            ]}
          />
          <SelectFilter 
            label="Status" 
            value={filters.attendanceStatus} 
            onChange={(v) => handleChange("attendanceStatus", v)}
            options={[
              { value: "present", label: "Present" },
              { value: "absent", label: "Absent" },
              { value: "late", label: "Late" },
            ]}
          />
        </div>
      </div>
      
      {/* Custom Date Range Picker Extension */}
      {filters.dateRange === "custom" && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10 flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">From:</span>
            <input 
              type="date" 
              value={filters.customStartDate || ""}
              onChange={(e) => handleChange("customStartDate", e.target.value)}
              className="bg-white/50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-gray-700 dark:text-gray-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">To:</span>
            <input 
              type="date" 
              value={filters.customEndDate || ""}
              onChange={(e) => handleChange("customEndDate", e.target.value)}
              className="bg-white/50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-gray-700 dark:text-gray-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SelectFilter({ 
  label, 
  value, 
  onChange, 
  options 
}: { 
  label: string, 
  value?: string, 
  onChange: (val: string) => void, 
  options: {value: string, label: string}[] 
}) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-gray-700 dark:text-gray-200 cursor-pointer max-w-[150px] truncate"
    >
      <option value="">{label} (All)</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
