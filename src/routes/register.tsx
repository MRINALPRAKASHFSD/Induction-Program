import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SuccessBurst } from "@/components/success-burst";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { registerStudent } from "@/lib/students.functions";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register · KRMU Induction" },
      { name: "description", content: "Register for KRMU induction in 30 seconds." },
    ],
  }),
  component: RegisterPage,
});

type Dept = { id: string; code: string; name: string };
type Branch = { id: string; name: string; department_id: string };

function RegisterPage() {
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({
    full_name: "", enrollment_no: "", email: "", phone: "",
    department_id: "", branch_id: "", course: "", year: "1",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ enrollment_no: string } | null>(null);
  const submit = useServerFn(registerStudent);

  useEffect(() => {
    supabase.from("departments").select("*").order("name").then(({ data }) => setDepartments(data ?? []));
    supabase.from("branches").select("*").order("name").then(({ data }) => setBranches(data ?? []));
  }, []);

  const filteredBranches = useMemo(
    () => branches.filter((b) => b.department_id === form.department_id),
    [branches, form.department_id],
  );

  const update = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v, ...(k === "department_id" ? { branch_id: "" } : {}) }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await submit({
        data: {
          full_name: form.full_name,
          enrollment_no: form.enrollment_no,
          email: form.email,
          phone: form.phone,
          department_id: form.department_id,
          branch_id: form.branch_id || null,
          course: form.course,
          year: Number(form.year),
        },
      });
      if (res.duplicate) toast.info("You're already registered — welcome back!");
      else toast.success("Registered successfully!");
      setDone({ enrollment_no: form.enrollment_no });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto max-w-md px-4 py-12">
          <SuccessBurst
            title="You're in!"
            subtitle={`Enrollment ${done.enrollment_no} is registered. Show your enrollment number at any event QR.`}
          />
          <div className="mt-6 grid gap-2">
            <Button asChild size="lg"><Link to="/clubs">Browse clubs</Link></Button>
            <Button asChild variant="outline" size="lg"><Link to="/">Back to home</Link></Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto max-w-xl px-4 py-8 sm:py-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold">Student registration</h1>
          <p className="mt-1 text-muted-foreground">Takes about 30 seconds. Required for QR check-ins.</p>
        </motion.div>

        <form onSubmit={onSubmit} className="mt-8 grid gap-4 rounded-2xl border bg-card-soft p-6 shadow-sm">
          <Field label="Full name">
            <Input required minLength={2} value={form.full_name} onChange={(e) => update("full_name", e.target.value)} placeholder="Aarav Sharma" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Enrollment number">
              <Input required value={form.enrollment_no} onChange={(e) => update("enrollment_no", e.target.value.toUpperCase())} placeholder="KRMU24CS0001" />
            </Field>
            <Field label="Phone">
              <Input required type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 9xxxxxxxxx" />
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
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.code} — {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={form.branch_id} onValueChange={(v) => update("branch_id", v)} disabled={!form.department_id}>
                <SelectTrigger><SelectValue placeholder={form.department_id ? "Select branch" : "Pick department first"} /></SelectTrigger>
                <SelectContent>
                  {filteredBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
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
                  {[1, 2, 3, 4, 5].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Button type="submit" size="lg" disabled={submitting || !form.department_id} className="mt-2 h-12 text-base">
            {submitting ? "Registering…" : "Complete registration"}
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
