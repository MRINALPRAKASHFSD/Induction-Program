import { useEffect, useState } from "react";
import { localDb, type LocalStudent } from "@/lib/local-db";
import { lookupStudent } from "@/lib/students.functions";
import { listClubs, listClubRegistrations } from "@/lib/admin.functions";
import { fetchPlannerDashboard } from "@/lib/planner.functions";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export function useDashboardData(firebaseUser: any, authLoading: boolean) {
  const [profile, setProfile] = useState<LocalStudent | null>(null);
  const [livePoints, setLivePoints] = useState<number | null>(null);
  const [liveRoomAssignment, setLiveRoomAssignment] = useState<any | null>(null);
  const [liveStudent, setLiveStudent] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [clubs, setClubs] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [planner, setPlanner] = useState<any | null>(null);
  const [plannerLoading, setPlannerLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) return;

    let isMounted = true;

    async function loadDashboardData() {
      const p = localDb.getStudentProfile();
      const savedStudentId = localStorage.getItem("krmu_verified_student_id");
      let enrollmentNo = p?.enrollment_no || savedStudentId;
      
      let liveStudentData = null;

      if (enrollmentNo) {
        if (!p) {
          // Fetch profile with retry if local profile missing
          for (let i = 0; i < 3; i++) {
            try {
              const res: any = await lookupStudent({ data: { enrollment_no: enrollmentNo } });
              if (res?.student) {
                liveStudentData = res.student;
                break;
              }
            } catch (err) { }
            await new Promise(r => setTimeout(r, 500));
          }
          if (!isMounted) return;
          
          if (liveStudentData) {
            const recoveredProfile: LocalStudent = {
              id: liveStudentData.id,
              full_name: liveStudentData.full_name || liveStudentData.name || "Student",
              enrollment_no: liveStudentData.enrollment_no || enrollmentNo,
              branch: liveStudentData.branch_id ? `${liveStudentData.branch_id} · ${liveStudentData.department_id ?? ""}` : (liveStudentData.course || "KRMU"),
              semester: liveStudentData.semester ? `Semester ${liveStudentData.semester}` : (liveStudentData.year ? `Session 2026–2027` : "1st"),
              created_at: liveStudentData.created_at || new Date().toISOString(),
              department_id: liveStudentData.department_id,
              program: liveStudentData.branch_id || liveStudentData.program || "",
              course: liveStudentData.course || "",
            };
            setProfile(recoveredProfile);
          }
        } else {
          setProfile(p);
          // Still fetch live student once to update points etc. (no retry needed for live points, just best-effort)
          try {
            const res: any = await lookupStudent({ data: { enrollment_no: enrollmentNo } });
            if (res?.student) {
              liveStudentData = res.student;
            }
          } catch (err) { }
        }
      } else {
        // Firebase session exists but no enrollment number in localStorage.
        let userEmail = firebaseUser.email;
        if (!userEmail && firebaseUser.uid && firebaseUser.uid.startsWith("email:")) {
          userEmail = firebaseUser.uid.replace("email:", "");
        }
        
        if (userEmail) {
          for (let i = 0; i < 3; i++) {
            try {
              const indexRef = doc(db, "email_index", userEmail);
              const indexSnap = await getDoc(indexRef);
              
              if (indexSnap.exists()) {
                const recoveredEnrollmentNo = indexSnap.data().enrollment_no || indexSnap.data().application_number;
                if (recoveredEnrollmentNo) {
                  const res: any = await lookupStudent({ data: { enrollment_no: recoveredEnrollmentNo } });
                  if (res?.student) {
                    liveStudentData = res.student;
                    break;
                  }
                }
              }
            } catch (err) { }
            await new Promise(r => setTimeout(r, 500));
          }
          
          if (!isMounted) return;
          if (liveStudentData) {
            enrollmentNo = liveStudentData.enrollment_no || liveStudentData.application_number;
            const recoveredProfile: LocalStudent = {
              id: liveStudentData.id,
              full_name: liveStudentData.full_name || liveStudentData.name || "Student",
              enrollment_no: enrollmentNo || "",
              branch: liveStudentData.branch_id ? `${liveStudentData.branch_id} · ${liveStudentData.department_id ?? ""}` : (liveStudentData.course || ""),
              semester: liveStudentData.semester ? `Semester ${liveStudentData.semester}` : (liveStudentData.year ? `Session 2026–2027` : ""),
              created_at: liveStudentData.created_at || new Date().toISOString(),
              department_id: liveStudentData.department_id,
              program: liveStudentData.branch_id || liveStudentData.program || "",
              course: liveStudentData.course || "",
            };
            localDb.saveStudentProfile(recoveredProfile);
            setProfile(recoveredProfile);
          }
        }
      }
      
      if (!isMounted) return;

      // Update live points and room assignment
      if (liveStudentData) {
        setLiveStudent(liveStudentData);
        setLivePoints(liveStudentData.points || 0);
        const ra = liveStudentData.roomAssignment;
        if (liveStudentData.roomNumber && liveStudentData.allocationStatus) {
          setLiveRoomAssignment({
            allocationStatus: liveStudentData.allocationStatus,
            roomNumber: liveStudentData.roomNumber,
            block: liveStudentData.block || '?',
            capacity: liveStudentData.capacity || '?',
            plannerId: liveStudentData.plannerId,
          });
        } else if (ra) {
          setLiveRoomAssignment(ra);
        } else if (liveStudentData.room_no || p?.room_no) {
          setLiveRoomAssignment({
            allocationStatus: 'ALLOCATED',
            roomNumber: liveStudentData.room_no || p?.room_no,
            block: liveStudentData.block || (p as any)?.block || '?',
            capacity: liveStudentData.capacity || '?'
          });
        } else {
          setLiveRoomAssignment({ allocationStatus: 'PENDING' });
        }
      }

      setLoading(false);

      if (enrollmentNo) {
        Promise.all([
          listClubs().catch(() => ({ clubs: [] })),
          listClubRegistrations().catch(() => []),
        ]).then(([clubsRes, allRegs]: [any, any[]]) => {
          if (!isMounted) return;
          const allClubs = Array.isArray(clubsRes?.clubs) ? clubsRes.clubs : [];
          setClubs(allClubs);
          if (Array.isArray(allRegs)) {
            const myRegs = allRegs.filter(
              (r: any) =>
                r.enrollment_no === enrollmentNo ||
                r.student_id === enrollmentNo ||
                (liveStudentData && r.student_id === liveStudentData.id)
            );
            setRegistrations(myRegs);
          }
        });
      }
    }
    
    loadDashboardData();

    // Fetch planner dashboard
    fetchPlannerDashboard()
      .then(data => { if (isMounted) setPlanner(data); })
      .catch(() => { if (isMounted) setPlanner(null); })
      .finally(() => { if (isMounted) setPlannerLoading(false); });

    return () => { isMounted = false; };
  }, [authLoading, firebaseUser]);

  return {
    profile,
    livePoints,
    liveRoomAssignment,
    liveStudent,
    loading,
    clubs,
    registrations,
    planner,
    plannerLoading
  };
}
