import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SuccessBurst({ title, subtitle, className }: { title: string; subtitle?: string; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className={cn("flex flex-col items-center gap-4 rounded-2xl border bg-card-soft p-8 text-center shadow-elegant", className)}
    >
      <motion.div
        initial={{ rotate: -20, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 250 }}
        className="grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success"
      >
        <CheckCircle2 className="h-12 w-12" strokeWidth={2.2} />
      </motion.div>
      <div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 opacity-90">{subtitle}</p>}
      </div>
    </motion.div>
  );
}
