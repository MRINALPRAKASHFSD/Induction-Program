import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Building4, SearchNormal1, Refresh, Export, TickCircle, CloseCircle } from "iconsax-react";
import { Users, AlertTriangle, CheckCircle2, Clock, Edit, Trash2, X } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db, auth } from "@/lib/firebase/config";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/admin/rooms")({
  component: AdminRooms,
});

// ── Inline Editable Row ────────────────────────────────────────────────────────
function RoomRow({ room, onUpdate, onDelete }: { room: Room, onUpdate: (r: any) => Promise<void>, onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(room);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({ ...formData, originalRoomNumber: room.roomNumber });
    setSaving(false);
    setEditing(false);
  };

  const fillPct = pct(room.occupancy ?? 0, room.capacity);
  const isFull = (room.remainingSeats ?? 0) <= 0;

  if (editing) {
    return (
      <tr className="border-b border-gray-100 bg-white">
        <td className="p-3"><input className="w-full text-sm border rounded px-2 py-1" value={formData.roomNumber} onChange={e => setFormData({...formData, roomNumber: e.target.value.toUpperCase()})} /></td>
        <td className="p-3"><input className="w-full text-sm border rounded px-2 py-1" value={formData.block} onChange={e => setFormData({...formData, block: e.target.value})} /></td>
        <td className="p-3">
          <select className="w-full text-sm border rounded px-2 py-1" value={formData.school} onChange={e => setFormData({...formData, school: e.target.value})}>
            {Object.keys(SCHOOL_LABELS).map(k => <option key={k} value={k}>{SCHOOL_LABELS[k]}</option>)}
          </select>
        </td>
        <td className="p-3"><input type="number" className="w-full text-sm border rounded px-2 py-1" value={formData.capacity} onChange={e => setFormData({...formData, capacity: Number(e.target.value)})} /></td>
        <td className="p-3 text-sm text-center">{room.occupancy ?? 0}</td>
        <td className="p-3">
          <select className="w-full text-sm border rounded px-2 py-1" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
          </select>
        </td>
        <td className="p-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setFormData(room); setEditing(false); }} disabled={saving}>Cancel</Button>
          <Button size="sm" className="bg-[#8a4a22] text-white" onClick={handleSave} disabled={saving}>{saving ? "..." : "Save"}</Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[#8a4a22]/10 hover:bg-white/40 transition-colors">
      <td className="p-3 font-bold text-[#2c1208]">{room.roomNumber}</td>
      <td className="p-3 text-sm font-medium text-[#7a4020]/80">Block {room.block}</td>
      <td className="p-3">
        <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${SCHOOL_COLORS[room.school] ?? "bg-gray-100 text-gray-600"}`}>
          {SCHOOL_LABELS[room.school] ?? room.school.toUpperCase()}
        </span>
      </td>
      <td className="p-3 text-sm text-center">{room.capacity}</td>
      <td className="p-3 text-sm text-center">
        <div className="flex flex-col items-center">
          <span>{room.occupancy ?? 0} / {room.capacity}</span>
          <div className="w-16 h-1 mt-1 rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full ${fillPct >= 90 ? "bg-red-500" : fillPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      </td>
      <td className="p-3 text-center">
        <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${statusColor(room.status)}`}>
          {room.status}
        </span>
      </td>
      <td className="p-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setEditing(true)} className="p-1.5 text-[#8a4a22]/60 hover:text-[#8a4a22] hover:bg-white rounded-md transition-colors">
            <Edit className="w-4 h-4" />
          </button>
          <button onClick={() => onDelete(room.roomNumber)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-white rounded-md transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const SCHOOL_LABELS: Record<string, string> = {
  soet: "SOET", sols: "SOLS", smas: "SMAS", soed: "SOED",
  sola: "SOLA", sbas: "SBAS", sprs: "SPRS", semc: "SEMCE",
  soad: "SOAD", somc: "SOMC",
};
const SCHOOL_COLORS: Record<string, string> = {
  soet: "bg-blue-500/10 text-blue-700",
  sols: "bg-emerald-500/10 text-emerald-700",
  smas: "bg-violet-500/10 text-violet-700",
  soed: "bg-amber-500/10 text-amber-700",
  sola: "bg-rose-500/10 text-rose-700",
  sbas: "bg-cyan-500/10 text-cyan-700",
  sprs: "bg-orange-500/10 text-orange-700",
  semc: "bg-pink-500/10 text-pink-700",
  soad: "bg-teal-500/10 text-teal-700",
  somc: "bg-indigo-500/10 text-indigo-700",
};

function pct(occupancy: number, capacity: number): number {
  if (!capacity) return 0;
  return Math.round((occupancy / capacity) * 100);
}

function statusColor(status: string) {
  if (status === "ACTIVE") return "text-emerald-700 bg-emerald-500/10";
  if (status === "BLOCKED") return "text-red-700 bg-red-500/10";
  return "text-amber-700 bg-amber-500/10";
}

type Room = {
  id: string;
  roomNumber: string;
  block: string;
  school: string;
  schoolCode: string;
  capacity: number;
  occupancy: number;
  remainingSeats: number;
  status: "ACTIVE" | "BLOCKED" | "MAINTENANCE";
  roomType: string;
  equipmentType: string;
  allocationOrder: number;
};

// ── Component ──────────────────────────────────────────────────────────────────
function AdminRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [seeding, setSeeding] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [editingRoom, setEditingRoom] = useState<Room | "new" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Real-time room listener ────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "rooms"), orderBy("allocationOrder", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Room));
      setRooms(data);
      setLoading(false);
    }, (err) => {
      console.error("Rooms listener error:", err);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Admin token helper ─────────────────────────────────────────────────────
  const adminToken = useCallback(async (): Promise<string | null> => {
    return auth.currentUser?.getIdToken() || null;
  }, []);

  // ── Handle Save/Delete ───────────────────────────────────────────────────
  const handleSaveRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const action = editingRoom === "new" ? "create_room" : "update_room";
    if (editingRoom !== "new" && editingRoom) {
      payload.originalRoomNumber = editingRoom.roomNumber;
    }
    
    const token = await adminToken();
    if (!token) return toast.error("Not authenticated");
    
    setSubmitting(true);
    try {
      const res = await fetch("/api/room-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(editingRoom === "new" ? "Room created" : "Room updated");
        setEditingRoom(null);
      } else {
        toast.error(data.error || "Failed to save room");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRoomInline = async (payload: any) => {
    const token = await adminToken();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    
    try {
      const res = await fetch("/api/room-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "update_room", ...payload }),
      });
      const data = await res.json();
      if (data.ok) toast.success("Room updated");
      else toast.error(data.error || "Failed to update room");
    } catch {
      toast.error("Network error");
    }
  };

  const handleDeleteRoom = async (roomNumber: string) => {
    if (!confirm(`Are you sure you want to delete room ${roomNumber}?`)) return;
    const token = await adminToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/room-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "delete_room", room_number: roomNumber }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Room deleted");
        setEditingRoom(null);
      } else {
        toast.error(data.error || "Failed to delete room");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Seed rooms ────────────────────────────────────────────────────────────
  const handleSeed = useCallback(async () => {
    const token = await adminToken();
    if (!token) return toast.error("Not authenticated");
    setSeeding(true);
    try {
      const res = await fetch("/api/room-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "seed" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Seeded ${data.created} rooms (${data.skipped} already existed)`);
      } else {
        toast.error(data.error || "Seed failed");
      }
    } catch {
      toast.error("Network error during seed");
    } finally {
      setSeeding(false);
    }
  }, [adminToken]);

  // ── Recalculate (emergency recovery) ─────────────────────────────────────
  const handleRecalculate = useCallback(async () => {
    const token = await adminToken();
    if (!token) return toast.error("Not authenticated");
    setRecalculating(true);
    try {
      const res = await fetch("/api/room-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "recalculate" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(
          `Recovery complete — ${data.allocated} allocated, ${data.stillPending} still pending`,
        );
      } else {
        toast.error(data.error || "Recalculate failed");
      }
    } catch {
      toast.error("Network error during recalculate");
    } finally {
      setRecalculating(false);
    }
  }, [adminToken]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const rows = rooms.map((r) => [
      r.roomNumber, r.block, r.schoolCode, r.capacity,
      r.occupancy, r.remainingSeats,
      pct(r.occupancy, r.capacity) + "%",
      r.status, r.equipmentType,
    ]);
    const headers = ["Room", "Block", "School", "Capacity", "Occupied", "Remaining", "Fill%", "Status", "Equipment"];
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "rooms_export.csv";
    a.click();
    toast.success("Exported rooms CSV");
  }, [rooms]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const schools = [...new Set(rooms.map((r) => r.school))].sort();
  const filtered = rooms.filter((r) => {
    if (schoolFilter !== "all" && r.school !== schoolFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !r.roomNumber.toLowerCase().includes(search.toLowerCase()) &&
        !r.school.toLowerCase().includes(search.toLowerCase()) &&
        !r.block.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalCapacity = rooms.reduce((s, r) => s + r.capacity, 0);
  const totalOccupied  = rooms.reduce((s, r) => s + (r.occupancy ?? 0), 0);
  const totalFree      = rooms.reduce((s, r) => s + (r.remainingSeats ?? r.capacity - (r.occupancy ?? 0)), 0);
  const pendingRooms   = rooms.filter((r) => r.status !== "ACTIVE").length;

  // School KPIs
  const schoolKPIs = schools.map((school) => {
    const schoolRooms = rooms.filter((r) => r.school === school);
    const cap  = schoolRooms.reduce((s, r) => s + r.capacity, 0);
    const occ  = schoolRooms.reduce((s, r) => s + (r.occupancy ?? 0), 0);
    return { school, cap, occ, free: cap - occ, pct: pct(occ, cap) };
  });

  return (
    <AdminShell
      title="Room Allocation"
      subtitle={`Live occupancy across ${rooms.length} rooms · Aarambh 2026`}
    >
      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Capacity", value: totalCapacity, icon: Building4, color: "text-blue-600", bg: "bg-blue-500/10" },
          { label: "Occupied",       value: totalOccupied, icon: Users,     color: "text-emerald-600", bg: "bg-emerald-500/10" },
          { label: "Available",      value: totalFree,     icon: CheckCircle2, color: "text-violet-600", bg: "bg-violet-500/10" },
          { label: "Unavailable",    value: pendingRooms,  icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-500/10" },
        ].map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-premium-v2 rounded-2xl p-5 flex flex-col gap-2"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${kpi.bg}`}>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <div className="text-2xl font-bold text-[#2c1208]">{kpi.value}</div>
            <div className="text-xs font-semibold text-[#7a4020]/70 uppercase tracking-wide">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Overall Fill Bar ──────────────────────────────────────────────── */}
      {totalCapacity > 0 && (
        <div className="mb-8">
          <div className="flex justify-between text-xs font-semibold text-[#7a4020]/70 mb-1">
            <span>Overall fill rate</span>
            <span>{pct(totalOccupied, totalCapacity)}% · {totalOccupied}/{totalCapacity}</span>
          </div>
          <div className="h-3 rounded-full bg-[#8a4a22]/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#8a4a22] to-[#c4714a]"
              initial={{ width: 0 }}
              animate={{ width: `${pct(totalOccupied, totalCapacity)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* ── School Summary ────────────────────────────────────────────────── */}
      {schoolKPIs.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-bold text-[#7a4020]/60 uppercase tracking-wider mb-3">By School</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {schoolKPIs.map((s) => (
              <div
                key={s.school}
                className={`glass-premium-v2 rounded-xl p-3 cursor-pointer transition-all hover:scale-[1.02] ${schoolFilter === s.school ? "ring-2 ring-[#8a4a22]" : ""}`}
                onClick={() => setSchoolFilter(schoolFilter === s.school ? "all" : s.school)}
              >
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${SCHOOL_COLORS[s.school] ?? "bg-gray-100 text-gray-600"}`}>
                  {SCHOOL_LABELS[s.school] ?? s.school.toUpperCase()}
                </span>
                <div className="mt-2 text-base font-bold text-[#2c1208]">{s.pct}%</div>
                <div className="text-[10px] text-[#7a4020]/70">{s.occ}/{s.cap}</div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#8a4a22]/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#8a4a22]"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px]">
          <SearchNormal1 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a4a22]/50" />
          <input
            type="text"
            placeholder="Search room, block, school…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white/60 border border-[#8a4a22]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/40 text-[#2c1208] placeholder:text-[#8a4a22]/40"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm bg-white/60 border border-[#8a4a22]/20 rounded-xl px-3 py-2 text-[#2c1208] focus:outline-none focus:ring-2 focus:ring-[#8a4a22]/40"
        >
          <option value="all">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="BLOCKED">Blocked</option>
          <option value="MAINTENANCE">Maintenance</option>
        </select>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="liquidGlassWhite"
            size="sm"
            className="rounded-full text-[#2c1208]"
            onClick={() => setEditingRoom("new")}
          >
            + Add Room
          </Button>

          <Button
            variant="liquidGlassWhite"
            size="sm"
            className="rounded-full text-[#2c1208]"
            onClick={handleExport}
            disabled={rooms.length === 0}
          >
            <Export className="w-4 h-4 mr-1.5" />
            Export
          </Button>

          {/* Seed — only useful once */}
          {rooms.length === 0 && (
            <Button
              variant="liquidGlassMaroon"
              size="sm"
              className="rounded-full"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? "Seeding…" : "Seed Rooms"}
            </Button>
          )}

          {/* Emergency recovery */}
          <Button
            variant="liquidGlassWhite"
            size="sm"
            className="rounded-full text-[#2c1208]"
            onClick={handleRecalculate}
            disabled={recalculating}
          >
            <Refresh className={`w-4 h-4 mr-1.5 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recovering…" : "Recover Pending"}
          </Button>
        </div>
      </div>

      {/* ── Rooms Grid ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="skeleton-glass skeleton-card" style={{ minHeight: 110 }} />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-16 text-[#7a4020]/60">
          <Building4 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-semibold text-lg">No rooms found in Firestore.</p>
          <p className="text-sm mt-1">Click <strong>Seed Rooms</strong> to initialize from master data.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#7a4020]/60">
          <SearchNormal1 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No rooms match your filters.</p>
        </div>
      ) : (
        <div className="glass-premium-v2 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-black/5 text-[#7a4020]/80 text-xs uppercase tracking-wider">
                <th className="p-3 font-bold">Room No</th>
                <th className="p-3 font-bold">Block</th>
                <th className="p-3 font-bold">School</th>
                <th className="p-3 font-bold text-center">Capacity</th>
                <th className="p-3 font-bold text-center">Occupancy</th>
                <th className="p-3 font-bold text-center">Status</th>
                <th className="p-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((room) => (
                <RoomRow 
                  key={room.id} 
                  room={room} 
                  onUpdate={handleUpdateRoomInline}
                  onDelete={handleDeleteRoom}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer info ───────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <p className="mt-6 text-center text-[10px] text-[#7a4020]/50 font-medium">
          Showing {filtered.length} of {rooms.length} rooms · Updates in real-time
        </p>
      )}

      {/* ── Room Modal ──────────────────────────────────────────────────────── */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-[#2c1208] text-lg">
                {editingRoom === "new" ? "Add New Room" : `Edit Room: ${(editingRoom as Room).roomNumber}`}
              </h3>
              <button
                onClick={() => setEditingRoom(null)}
                className="text-gray-400 hover:text-gray-600"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSaveRoom} className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Room Number *</label>
                  <input required name="roomNumber" defaultValue={editingRoom !== "new" ? editingRoom.roomNumber : ""} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Block</label>
                  <input name="block" defaultValue={editingRoom !== "new" ? editingRoom.block : ""} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">School ID *</label>
                  <select required name="school" defaultValue={editingRoom !== "new" ? editingRoom.school : ""} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm">
                    <option value="">Select...</option>
                    {Object.keys(SCHOOL_LABELS).map(k => <option key={k} value={k}>{SCHOOL_LABELS[k]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">School Code</label>
                  <input name="schoolCode" defaultValue={editingRoom !== "new" ? editingRoom.schoolCode : ""} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm uppercase" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Capacity *</label>
                  <input required type="number" min="1" name="capacity" defaultValue={editingRoom !== "new" ? editingRoom.capacity : 60} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Allocation Order</label>
                  <input type="number" name="allocationOrder" defaultValue={editingRoom !== "new" ? editingRoom.allocationOrder : 99} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
                  <select name="status" defaultValue={editingRoom !== "new" ? editingRoom.status : "ACTIVE"} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm">
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="BLOCKED">BLOCKED</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Room Type</label>
                  <input name="roomType" defaultValue={editingRoom !== "new" ? editingRoom.roomType : "classroom"} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Equipment Type</label>
                <input name="equipmentType" defaultValue={editingRoom !== "new" ? editingRoom.equipmentType : ""} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-[#8a4a22]/40 outline-none text-sm" />
              </div>
              
              <div className="mt-4 flex items-center justify-between gap-3 pt-4 border-t border-gray-100">
                {editingRoom !== "new" ? (
                  <button 
                    type="button" 
                    onClick={() => handleDeleteRoom(editingRoom.roomNumber)}
                    className="text-red-500 hover:text-red-600 text-sm font-semibold flex items-center gap-1"
                    disabled={submitting}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                ) : <div />}
                
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => setEditingRoom(null)} disabled={submitting}>Cancel</Button>
                  <Button type="submit" disabled={submitting} className="bg-[#8a4a22] text-white hover:bg-[#6a3818]">
                    {submitting ? "Saving..." : "Save Room"}
                  </Button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AdminShell>
  );
}
