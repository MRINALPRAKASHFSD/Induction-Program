import { Link } from "@tanstack/react-router";
import { Notification, User, Logout } from "iconsax-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase/config";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { localDb } from "@/lib/local-db";

export function SiteHeader() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("krmu_active_profile");
      toast.success("Logged out successfully");
      window.location.href = "/";
    } catch (err) {
      toast.error("Failed to log out");
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full panel-liquid-glass">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3 font-semibold">
          <img src="/krmu-emblem.jpg" alt="KRMU Emblem" className="h-11 w-auto mix-blend-multiply object-contain" />
          <span className="text-xl tracking-tight text-[#6b3517]">KRMU Induction</span>
        </Link>
        <nav className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full text-foreground/80 hover:text-foreground">
                <User variant="TwoTone" className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-background/95 backdrop-blur-md border-white/20">
              {user ? (
                <>
                  <DropdownMenuItem className="text-muted-foreground text-xs pointer-events-none">
                    {user.email}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer mt-1 font-medium">
                    <Logout variant="TwoTone" className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem asChild className="cursor-pointer font-medium">
                  <Link to="/register" className="flex items-center w-full">
                    <span>Register now</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild variant="ghost" size="icon" className="rounded-full text-foreground/80 hover:text-foreground">
            <Link to="/announcements">
              <Notification variant="TwoTone" className="h-5 w-5" />
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
