import { Link } from "@tanstack/react-router";
import { GraduationCap, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full panel-liquid-glass">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-hero text-primary-foreground shadow-elegant">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span>KRMU Induction</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="rounded-full text-foreground/80 hover:text-foreground">
            <Link to="/announcements">
              <Bell className="h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="liquidGlassDark" className="h-9 px-5 rounded-full font-medium text-xs">
            <Link to="/admin/login">
              Admin Panel
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
