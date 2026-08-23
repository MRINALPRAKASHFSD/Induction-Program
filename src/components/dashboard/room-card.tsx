import { MapPin, CheckCircle2, DoorOpen, Users } from "lucide-react";

interface RoomCardProps {
  roomAssignment: any | null;
  plannerRoom: any | null;
  roomStatus?: string;
  roomMessage?: string;
  isLoading: boolean;
}

export function RoomCard({ roomAssignment, plannerRoom, roomStatus, roomMessage, isLoading }: RoomCardProps) {
  const legacyRoom = (roomAssignment?.allocationStatus === 'allocated' || roomAssignment?.allocationStatus === 'ALLOCATED') && roomAssignment?.roomNumber;
  
  if (isLoading) {
    return (
      <div className="rounded-[24px] p-8 bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] animate-pulse flex flex-col justify-center items-center h-full min-h-[160px]">
        <div className="h-10 w-24 bg-black/10 dark:bg-white/10 rounded-xl mb-3" />
        <div className="h-4 w-32 bg-black/5 dark:bg-white/5 rounded-md" />
      </div>
    );
  }

  const roomData = plannerRoom || roomAssignment;

  if (!roomData && !isLoading) {
    return (
      <div className="rounded-[24px] p-6 bg-white/60 dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 shadow-sm backdrop-blur-xl flex flex-col justify-between h-full relative overflow-hidden group">
        <div className="flex items-center justify-between mb-4 relative z-10">
          <div>
            <h3 className="font-serif font-bold text-xl text-foreground">Room Allocation</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Basecamp for Induction</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500 group-hover:scale-110 transition-transform duration-300">
            <MapPin className="w-5 h-5" />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
           <div className="text-lg font-serif font-bold text-foreground">Room Allocation Pending</div>
           <p className="text-xs font-medium text-muted-foreground mt-2 text-center px-4">
             Please contact administration.
           </p>
        </div>
      </div>
    );
  }

  const roomNumStr = roomData?.roomNumber ? String(roomData.roomNumber) : "";
  const floorIndicator = roomData?.floor ? 
    (String(roomData.floor).includes('Floor') ? roomData.floor : `${roomData.floor}${roomData.floor === 1 ? 'st' : roomData.floor === 2 ? 'nd' : roomData.floor === 3 ? 'rd' : 'th'} Floor`) :
    (roomNumStr.length >= 3 ? (roomNumStr[1] === '0' ? 'Ground' : roomNumStr[1] === '1' ? '1st' : roomNumStr[1] === '2' ? '2nd' : roomNumStr[1] === '3' ? '3rd' : `${roomNumStr[1]}th`) + " Floor" : "Unknown Floor");

  return (
    <div className="rounded-[24px] p-6 bg-white/60 dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 shadow-sm backdrop-blur-xl flex flex-col justify-between h-full relative overflow-hidden group">
      
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
      <div className="absolute -right-12 -top-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-colors duration-700" />
      
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <h3 className="font-serif font-bold text-xl text-foreground">Room Allocation</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Basecamp for Induction</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500 group-hover:scale-110 transition-transform duration-300">
          <MapPin className="w-5 h-5" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end relative z-10">
        {roomData ? (
          <div>
            <div className="flex items-end gap-3 mb-4">
              <div className="text-5xl text-foreground font-serif font-bold tracking-tight">{roomNumStr}</div>
              <div className="mb-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Allocated
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-black/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                  <DoorOpen className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Location</p>
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {roomData.block ? `Block ${roomData.block}` : `Block ${roomNumStr[0] || '?'}`}
                    <br />
                    <span className="text-muted-foreground font-medium text-xs">
                      {floorIndicator}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Capacity</p>
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {roomData.capacity || '40'} Seats
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
             <div className="w-12 h-12 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin mb-3" />
             <div className="text-lg font-serif font-bold text-foreground">Room Allocation Pending</div>
             <p className="text-xs font-medium text-muted-foreground mt-1 text-center px-4">
               Please contact administration.
             </p>
          </div>
        )}
      </div>
    </div>
  );
}
