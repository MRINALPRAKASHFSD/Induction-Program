import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from "@/components/ui/drawer";
import { CampusMap } from "./campus-map";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface VenueDrawerProps {
  venue: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getDirections(venue: string) {
  const v = venue.toLowerCase();
  if (v.includes("block a")) return "Enter through the main gate, Block A is the first building on your right. Take the elevator to the designated floor.";
  if (v.includes("block b")) return "Located past the library. Follow the blue signboards from the central courtyard.";
  if (v.includes("auditorium")) return "The Main Auditorium is opposite the Central Lawn. Entrance is on the ground floor.";
  if (v.includes("lawn")) return "The outdoor Central Lawn is in the heart of the campus. Perfect for open-air events.";
  if (v.includes("sports") || v.includes("arena")) return "Walk past Block B towards the back of the campus. The Arena is next to the tennis courts.";
  return "Head to the main reception for specific directions to this venue.";
}

export function VenueDrawer({ venue, open, onOpenChange }: VenueDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-4 pb-8 pt-2">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader className="text-left px-0">
            <div className="flex items-center gap-2 text-primary">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
                <MapPin className="h-4 w-4" />
              </div>
              <DrawerTitle className="text-xl">Venue Map</DrawerTitle>
            </div>
            <DrawerDescription className="mt-1.5">
              {venue || "Select a venue to see its location on campus."}
            </DrawerDescription>
          </DrawerHeader>

          <div className="mt-4">
            <CampusMap activeVenue={venue || undefined} />
          </div>

          {venue && (
            <div className="mt-6 rounded-xl border bg-card-soft p-4 shadow-sm">
              <h4 className="flex items-center gap-2 font-semibold">
                <Navigation className="h-4 w-4 text-primary" />
                Directions
              </h4>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {getDirections(venue)}
              </p>
            </div>
          )}

          <DrawerClose asChild>
            <Button variant="outline" className="mt-6 w-full">Close Map</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
