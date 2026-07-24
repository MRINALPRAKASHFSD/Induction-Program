import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/config";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export class ClubImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClubImageUploadError";
  }
}

/**
 * Validate and upload a club logo to Firebase Storage.
 * Returns the secure download URL on success.
 *
 * @param file - The image file selected by the user
 * @param clubId - Used to namespace the storage path; for new clubs pass "new"
 */
export async function uploadClubImage(file: File, clubId = "new"): Promise<string> {
  // ── Client-side validation ──────────────────────────────────────────────
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new ClubImageUploadError("Only PNG, JPG, JPEG, and WEBP images are allowed.");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new ClubImageUploadError("Image must be smaller than 5 MB.");
  }

  // ── Upload ──────────────────────────────────────────────────────────────
  const ext = file.name.split(".").pop() ?? "jpg";
  const filename = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
  const storagePath = `club-images/${clubId}/${filename}`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, file, { contentType: file.type });
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}
