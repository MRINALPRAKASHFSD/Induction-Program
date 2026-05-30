import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SuccessBurst } from "@/components/success-burst";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { localDb } from "@/lib/local-db";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register · KRMU Induction" },
      { name: "description", content: "Register for KRMU induction in 30 seconds." },
    ],
  }),
  component: RegisterPage,
});

// ─── Static KRMU data (no DB call needed) ──────────────────────────────────
const DEPARTMENTS = [
  { id: "soet", code: "SOET", name: "School of Engineering & Technology" },
  { id: "soms", code: "SOMS", name: "School of Management Studies" },
  { id: "sols", code: "SOLS", name: "School of Legal Studies" },
  { id: "soa", code: "SOA", name: "School of Architecture" },
  { id: "soah", code: "SOAH", name: "School of Allied Health Sciences" },
  { id: "soe", code: "SOE", name: "School of Education" },
  { id: "somc", code: "SOMC", name: "School of Media & Communication" },
  { id: "sosc", code: "SOSC", name: "School of Science" },
  { id: "sohs", code: "SOHS", name: "School of Hospitality Studies" },
  { id: "sofa", code: "SOFA", name: "School of Fine Arts & Design" },
];

const BRANCHES_BY_DEPT: Record<string, string[]> = {
  soet: ["Computer Science Engineering", "Civil Engineering", "Mechanical Engineering", "Electronics & Communication", "Electrical Engineering", "Information Technology", "AI & Machine Learning", "Data Science", "Cyber Security"],
  soms: ["MBA", "BBA", "BBA (Hons.)", "B.Com (Hons.)", "B.Com"],
  sols: ["LLB (3-Year)", "LLB (5-Year / BA LLB)", "LLM"],
  soa: ["B.Arch"],
  soah: ["B.Pharm", "Physiotherapy (BPT)", "Optometry", "Medical Lab Tech", "Radiology"],
  soe: ["B.Ed", "D.El.Ed", "M.Ed"],
  somc: ["B.Journalism & Mass Communication", "BA (Hons.) Media Studies"],
  sosc: ["B.Sc Chemistry", "B.Sc Physics", "B.Sc Mathematics", "B.Sc Biotechnology", "B.Sc Microbiology"],
  sohs: ["B.Sc Hotel Management"],
  sofa: ["B.Des (Fashion Design)", "B.Des (Interior Design)"],
};

function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "", enrollment_no: "", email: "", phone: "",
    department_id: "", branch: "", course: "", year: "1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const update = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === "department_id" ? { branch: "" } : {}) }));

  const branches = BRANCHES_BY_DEPT[form.department_id] ?? [];
  const deptName = DEPARTMENTS.find(d => d.id === form.department_id)?.name ?? "";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.enrollment_no || !form.email || !form.department_id || !form.branch || !form.course) {
      toast.error("Please fill all required fields.");
      return;
    }

    setSubmitting(true);

    // We'll unconditionally save to ensure they exist in krmu_local_students
    const profile = {
      id: "std_" + Date.now(),
      full_name: form.full_name,
      enrollment_no: form.enrollment_no.toUpperCase(),
      branch: `${form.branch} · ${deptName}`,
      semester: `Year ${form.year} · ${form.course}`,
      created_at: new Date().toISOString(),
      department_id: form.department_id,
    };

    const existing = localDb.getStudentProfile();
    if (existing && existing.enrollment_no === form.enrollment_no.toUpperCase()) {
      // Still save to make sure krmu_local_students has it!
      localDb.saveStudentProfile(profile);
      toast.info("You're already registered — welcome back!");
      setDone(form.enrollment_no.toUpperCase());
      setSubmitting(false);
      return;
    }

    localDb.saveStudentProfile(profile);
    toast.success("Registered successfully!");
    setDone(profile.enrollment_no);
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-12">
          <SuccessBurst
            title="You're in!"
            subtitle={`Enrollment ${done} is registered. Head to Attendance to scan the session QR.`}
          />
          <div className="mt-6 grid gap-2">
            <Button variant="liquidGlassMaroon" asChild size="lg" className="rounded-full font-semibold"><Link to="/attendance">Go to Attendance</Link></Button>
            <Button variant="liquidGlassDark" asChild size="lg" className="rounded-full font-medium"><Link to="/">Back to home</Link></Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-xl px-4 py-8 sm:py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-3xl font-bold">Student Registration</h1>
          <p className="mt-1 text-muted-foreground">Takes about 30 seconds. Required for QR attendance.</p>
        </motion.div>

        <form onSubmit={onSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-card-soft p-6 shadow-sm">
          <Field label="Full Name">
            <Input required minLength={2} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="e.g. Aarav Sharma" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Enrollment Number">
              <Input required value={form.enrollment_no} onChange={(e) => update("enrollment_no", e.target.value)} placeholder="KRMU24CS0001" className="uppercase" />
            </Field>
            <Field label="Phone (optional)">
              <Input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 9xxxxxxxxx" />
            </Field>
          </div>

          <Field label="Email">
            <Input required type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@krmangalam.edu.in" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department">
              <Select value={form.department_id} onValueChange={(v) => update("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={form.branch} onValueChange={(v) => update("branch", v)} disabled={!form.department_id}>
                <SelectTrigger><SelectValue placeholder={form.department_id ? "Select branch" : "Pick department first"} /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course">
              <Input required value={form.course} onChange={(e) => update("course", e.target.value)} placeholder="B.Tech / BBA / LLB…" />
            </Field>
            <Field label="Year">
              <Select value={form.year} onValueChange={(v) => update("year", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Button type="submit" variant="liquidGlassMaroon" size="lg" disabled={submitting} className="mt-2 h-12 text-base rounded-full font-semibold">
            {submitting ? "Registering…" : "Complete Registration"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By registering you agree to the KRMU induction code of conduct.
          </p>
        </form>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
