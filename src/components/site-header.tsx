import { Link } from "@tanstack/react-router";
import { GraduationCap, QrCode } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-hero text-primary-foreground shadow-elegant">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span>KRMU Induction</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/register" className="rounded-md px-3 py-2 hover:bg-muted transition-colors">
            Register
          </Link>
          <Link to="/clubs" className="rounded-md px-3 py-2 hover:bg-muted transition-colors">
            Clubs
          </Link>
          <Link
            to="/attendance"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
          >
            <QrCode className="h-3.5 w-3.5" />
            Attendance
          </Link>
          <Link
            to="/my-pass"
            className="rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            My Pass
          </Link>
          <Link
            to="/admin/login"
            className="rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
