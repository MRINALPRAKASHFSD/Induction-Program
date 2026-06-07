import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

export interface CampusMapProps {
  activeVenue?: string; // If passed, highlight this specific venue
  onVenueClick?: (venue: string) => void;
}

const ZONES = [
  { id: "Block A", x: 20, y: 30, w: 25, h: 40, label: "Block A" },
  { id: "Block B", x: 55, y: 25, w: 30, h: 45, label: "Block B" },
  { id: "Main Auditorium", x: 25, y: 75, w: 20, h: 15, label: "Auditorium" },
  { id: "Central Lawn", x: 50, y: 75, w: 40, h: 20, label: "Central Lawn" },
  { id: "Sports Arena", x: 10, y: 10, w: 30, h: 15, label: "Sports Arena" },
];

export function CampusMap({ activeVenue, onVenueClick }: CampusMapProps) {
  return (
    <div className="relative aspect-square w-full max-w-md mx-auto overflow-hidden rounded-2xl bg-muted/30 border p-4 shadow-inner">
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-sm">
        {/* Decorative Grid */}
        <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="currentColor" className="text-muted-foreground/10" strokeWidth="0.5" />
        </pattern>
        <rect width="100" height="100" fill="url(#grid)" />

        {/* Zones */}
        {ZONES.map((zone) => {
          const isActive = activeVenue === zone.id || (activeVenue && activeVenue.includes(zone.id));
          return (
            <motion.g
              key={zone.id}
              onClick={() => onVenueClick?.(zone.id)}
              className={onVenueClick ? "cursor-pointer" : ""}
              whileHover={onVenueClick ? { scale: 1.02 } : {}}
            >
              <rect
                x={zone.x}
                y={zone.y}
                width={zone.w}
                height={zone.h}
                rx="3"
                className={`transition-colors duration-300 ${
                  isActive ? "fill-primary/20 stroke-primary" : "fill-card stroke-border"
                }`}
                strokeWidth="1.5"
              />
              <text
                x={zone.x + zone.w / 2}
                y={zone.y + zone.h / 2}
                textAnchor="middle"
                alignmentBaseline="middle"
                className={`text-[4px] font-semibold tracking-wider pointer-events-none ${
                  isActive ? "fill-primary" : "fill-muted-foreground"
                }`}
              >
                {zone.label}
              </text>
              {isActive && (
                <motion.g
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-primary drop-shadow-md"
                >
                  <MapPin
                    x={zone.x + zone.w / 2 - 2.5}
                    y={zone.y + 2}
                    width={5}
                    height={5}
                    strokeWidth={2}
                    className="animate-bounce"
                  />
                </motion.g>
              )}
            </motion.g>
          );
        })}
      </svg>
      {activeVenue && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
          </span>
          <span className="truncate max-w-[150px]">{activeVenue}</span>
        </div>
      )}
    </div>
  );
}
