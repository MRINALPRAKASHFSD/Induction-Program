import { MapPin, CheckCircle2 } from "lucide-react";

interface RoomCardProps {
  roomAssignment: any | null;
  plannerRoom: any | null;
  isLoading: boolean;
}

export function RoomCard({ roomAssignment, plannerRoom, isLoading }: RoomCardProps) {
  const legacyRoom = (roomAssignment?.allocationStatus === 'allocated' || roomAssignment?.allocationStatus === 'ALLOCATED') && roomAssignment?.roomNumber;
  
  if (isLoading) {
    return (
      <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] animate-pulse flex flex-col justify-center items-center h-full min-h-[160px]">
        <div className="h-10 w-24 bg-black/10 dark:bg-white/10 rounded-xl mb-3" />
        <div className="h-4 w-32 bg-black/5 dark:bg-white/5 rounded-md" />
      </div>
    );
  }

  return (
    <div className="rounded-[var(--dashboard-radius)] p-[var(--dashboard-padding)] bg-[var(--dashboard-card-bg)] border-[var(--dashboard-border)] shadow-[var(--dashboard-shadow)] backdrop-blur-[var(--dashboard-glass-blur)] flex flex-col justify-between h-full relative overflow-hidden group">
      <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors duration-500" />
      
      <div className="flex items-center justify-between mb-2 relative z-10">
        <h3 className="font-semibold text-lg text-foreground">Room Allocation</h3>
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-500">
          <MapPin className="w-5 h-5" />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center relative z-10 mt-2">
        {plannerRoom ? (
          <div>
            <div className="text-4xl text-primary font-bold tracking-tight">{plannerRoom.roomNumber}</div>
            <div className="text-sm font-medium text-muted-foreground mt-2 flex flex-wrap gap-x-2 gap-y-1">
              {plannerRoom.block && <span>Block {plannerRoom.block}</span>}
              {plannerRoom.floor && <span>· {String(plannerRoom.floor).includes('Floor') ? plannerRoom.floor : `${plannerRoom.floor}${plannerRoom.floor === 1 ? 'st' : plannerRoom.floor === 2 ? 'nd' : plannerRoom.floor === 3 ? 'rd' : 'th'} Floor`}</span>}
              {plannerRoom.capacity && <span>· Capacity {plannerRoom.capacity}</span>}
            </div>
            <div className="text-xs font-semibold text-green-600 dark:text-green-500 mt-3 flex items-center gap-1.5 bg-green-500/10 px-3 py-1.5 rounded-full inline-flex">
              <CheckCircle2 className="w-3.5 h-3.5" /> Induction Room
            </div>
          </div>
        ) : legacyRoom ? (
          <div>
            <div className="text-4xl text-primary font-bold tracking-tight">{roomAssignment.roomNumber}</div>
            <div className="text-sm font-medium text-muted-foreground mt-2 flex flex-wrap gap-x-2 gap-y-1">
              <span>Block {roomAssignment.block || roomAssignment.roomNumber[0]}</span>
              {roomAssignment.roomNumber.length >= 3 && <span>· {roomAssignment.roomNumber[1] === '0' ? 'Ground' : roomAssignment.roomNumber[1] === '1' ? '1st' : roomAssignment.roomNumber[1] === '2' ? '2nd' : roomAssignment.roomNumber[1] === '3' ? '3rd' : `${roomAssignment.roomNumber[1]}th`} Floor</span>}
              {roomAssignment.capacity && <span>· Capacity {roomAssignment.capacity}</span>}
            </div>
          </div>
        ) : roomAssignment?.allocationStatus === 'PENDING' || roomAssignment?.allocationStatus === 'pending' ? (
          <div className="flex flex-col items-center justify-center py-4">
             <div className="text-lg font-bold text-muted-foreground">Pending Allocation</div>
             <p className="text-xs text-muted-foreground/70 mt-1 text-center">Your room will be assigned soon</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
             <div className="text-lg font-bold text-muted-foreground">Not Allocated</div>
          </div>
        )}
      </div>
    </div>
  );
}
