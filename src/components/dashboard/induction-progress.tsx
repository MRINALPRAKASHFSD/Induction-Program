import { Star, Zap, ShieldCheck } from "lucide-react";

export function InductionProgress() {
  const achievements = [
    { id: "perfect", name: "Perfect Week", icon: Star, color: "text-yellow-500", bg: "bg-yellow-500/10", desc: "100% attendance", unlocked: false },
    { id: "early", name: "Early Bird", icon: Zap, color: "text-orange-500", bg: "bg-orange-500/10", desc: "First 100 registered", unlocked: true },
    { id: "verified", name: "Verified", icon: ShieldCheck, color: "text-blue-500", bg: "bg-blue-500/10", desc: "Profile complete", unlocked: true },
  ];

  return (
    <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg text-foreground">Achievements</h3>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10 text-muted-foreground">
          {achievements.filter(a => a.unlocked).length} / {achievements.length}
        </span>
      </div>
      
      <div className="flex flex-col gap-3">
        {achievements.map((badge) => (
          <div 
            key={badge.id}
            className={`flex items-center gap-4 p-3 rounded-2xl border transition-colors ${
              badge.unlocked 
                ? 'bg-white/40 dark:bg-zinc-800/40 border-black/5 dark:border-white/5' 
                : 'bg-transparent border-transparent opacity-50 grayscale'
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${badge.bg} ${badge.color}`}>
              <badge.icon className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-foreground truncate">{badge.name}</h4>
              <p className="text-xs text-muted-foreground truncate">{badge.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
