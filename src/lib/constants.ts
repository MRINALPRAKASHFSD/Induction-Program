export const CLUB_REGISTRATION_OPEN_DATE = "2026-08-22T00:00:00+05:30";

export function isClubRegistrationOpen(): boolean {
  return new Date() >= new Date(CLUB_REGISTRATION_OPEN_DATE);
}
