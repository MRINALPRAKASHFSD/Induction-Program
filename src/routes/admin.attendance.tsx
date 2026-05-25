import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, QrCode as QrIcon, Users } from "lucide-react";
import { localDb, type LocalSession, type LocalAttendance } from "@/lib/local-db";

export const Route = createFileRoute("/admin/attendance")({
  head: () => ({ meta: [{ title: "Attendance Session · KRMU Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminAttendance,
});

function AdminAttendance() {
  const [sessions, setSessions] = useState<LocalSession[]>([]);
  const [activeSession, setActiveSession] = useState<LocalSession | null>(null);
  const [attendances, setAttendances] = useState<LocalAttendance[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const refreshData = () => {
    const all = localDb.getSessions();
    setSessions(all);
    const active = all.find(s => s.is_active) || null;
    setActiveSession(active);
    
    if (active) {
      setAttendances(localDb.getAttendanceForSession(active.id));
      QRCode.toDataURL(active.id, {
        width: 400,
        margin: 2,
        color: { dark: "#2d0d12", light: "#fdfaf6" },
        errorCorrectionLevel: "H",
      }).then(setQrCodeUrl);
    } else {
      setAttendances([]);
      setQrCodeUrl("");
    }
  };

  useEffect(() => {
    refreshData();
    
    // Listen for cross-tab updates (when student scans the QR in another tab)
    const handleStorageUpdate = () => refreshData();
    window.addEventListener("local-db-update", handleStorageUpdate);
    
    // Also set an interval to catch manual storage events if across different tabs natively
    // (StorageEvent doesn't fire for the same window, but since our localDb fires a custom event, we're covered for same window. For cross-tab, the native 'storage' event fires.)
    window.addEventListener("storage", handleStorageUpdate);
    
    return () => {
      window.removeEventListener("local-db-update", handleStorageUpdate);
      window.removeEventListener("storage", handleStorageUpdate);
    };
  }, []);

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    localDb.createSession(newTitle);
    setNewTitle("");
    refreshData();
  };

  const handleActivate = (id: string) => {
    localDb.activateSession(id);
    refreshData();
  };

  return (
    <AdminShell title="Session Manager" subtitle="Generate a master QR code for students to scan.">
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <PlusCircle className="h-5 w-5 text-primary" /> Create New Session
            </h2>
            <form onSubmit={handleCreateSession} className="flex gap-2">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Day 1 Morning Session"
                className="flex-1"
                required
              />
              <Button type="submit">Create & Activate</Button>
            </form>
          </div>

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted/30 px-5 py-3 border-b flex justify-between items-center">
              <h2 className="font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" /> Live Scans
              </h2>
              <div className="text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">
                {attendances.length} Present
              </div>
            </div>
            {attendances.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No scans yet for the active session.
              </div>
            ) : (
              <div className="divide-y max-h-[400px] overflow-auto">
                {attendances.map((a, i) => (
                  <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex justify-between items-center px-5 py-3 hover:bg-muted/30">
                    <div>
                      <div className="font-medium">{a.student_name}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">{a.enrollment_no}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(a.scanned_at).toLocaleTimeString()}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          
        </div>

        {/* Right column: QR Display and Session List */}
        <div className="space-y-6">
          
          {activeSession ? (
            <div className="rounded-3xl border bg-card shadow-elegant overflow-hidden flex flex-col items-center p-6 text-center">
              <div className="bg-success/20 text-success text-xs font-bold px-3 py-1 rounded-full mb-4 animate-pulse">
                ACTIVE SESSION
              </div>
              <h3 className="font-bold text-lg leading-tight mb-6">{activeSession.title}</h3>
              {qrCodeUrl && (
                <div className="bg-white p-4 rounded-2xl shadow-inner border inline-block">
                  <img src={qrCodeUrl} alt="Session QR" className="w-56 h-56 object-contain" />
                </div>
              )}
              <p className="mt-6 text-sm text-muted-foreground">
                Students should scan this code from their Attendance Dashboard.
              </p>
            </div>
          ) : (
             <div className="rounded-3xl border bg-card shadow-sm p-8 text-center flex flex-col items-center">
               <QrIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
               <p className="text-sm text-muted-foreground">No active session.</p>
               <p className="text-xs text-muted-foreground mt-2">Create one to generate a QR.</p>
             </div>
          )}

          <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
             <div className="bg-muted/30 px-4 py-3 border-b">
               <h3 className="font-semibold text-sm">Past Sessions</h3>
             </div>
             <div className="divide-y max-h-[300px] overflow-auto">
               {sessions.map(s => (
                 <div key={s.id} className="p-3 flex items-center justify-between hover:bg-muted/30">
                    <div className="truncate pr-2">
                       <p className={`text-sm font-medium truncate ${s.is_active ? 'text-primary' : ''}`}>{s.title}</p>
                       <p className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</p>
                    </div>
                    {!s.is_active && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleActivate(s.id)}>
                        Activate
                      </Button>
                    )}
                 </div>
               ))}
               {sessions.length === 0 && (
                 <p className="p-4 text-xs text-muted-foreground text-center">No sessions found.</p>
               )}
             </div>
          </div>
          
        </div>
      </div>
    </AdminShell>
  );
}
