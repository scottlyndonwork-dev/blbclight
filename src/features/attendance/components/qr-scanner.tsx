"use client";

import { Camera, Keyboard } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { recordByMemberNoAction } from "../actions";
import type { AttendanceRow } from "./attendance-recorder";

// Minimal typing for the browser BarcodeDetector API (Chrome, Edge, Android).
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
}

/**
 * Scans member QR codes with the device camera. Where the browser has no
 * BarcodeDetector, a USB/Bluetooth QR scanner (which types like a keyboard)
 * can be used with the input field instead.
 */
export function QrScanner({
  sessionId,
  onRecorded,
  trigger,
}: {
  sessionId: string;
  onRecorded: (row: AttendanceRow, created: boolean) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const recent = useRef(new Map<string, number>());
  const busy = useRef(false);

  async function handleCode(code: string) {
    const now = Date.now();
    const seenAt = recent.current.get(code);
    if (busy.current || (seenAt && now - seenAt < 4000)) return; // ignore repeated frames
    recent.current.set(code, now);
    busy.current = true;
    try {
      const result = await recordByMemberNoAction(sessionId, code);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const d = result.data;
      if (!d.created && d.previousStatus === d.status) {
        toast.warning(`${d.fullName} is already recorded.`);
      } else {
        toast.success(`${d.fullName} — Present`, { duration: 1500 });
      }
      setLast(`${d.fullName} (${d.memberNo})`);
      onRecorded(
        {
          record_id: d.recordId,
          member_id: d.memberId,
          member_no: d.memberNo,
          full_name: d.fullName,
          status: d.status,
          method: "qr",
          checked_in_at: new Date().toISOString(),
          correction_reason: null,
        },
        d.created || d.previousStatus !== d.status,
      );
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!open) return;
    const detector = getDetector();
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;

    async function start() {
      if (!detector) {
        setCameraError("Camera scanning is not supported in this browser. Use a QR scanner device or type the member ID below.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraError(null);
        const tick = async () => {
          if (cancelled || !videoRef.current || !detector) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) await handleCode(codes[0].rawValue);
          } catch {
            // Frame not ready; try again on the next tick.
          }
          frame = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setCameraError("The camera could not be opened. Allow camera access, or use the field below.");
      }
    }
    start();

    return () => {
      cancelled = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // handleCode is stable for the lifetime of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan member QR codes</DialogTitle>
          <DialogDescription>Hold each member&apos;s QR card in front of the camera. Each scan is saved immediately.</DialogDescription>
        </DialogHeader>
        {cameraError ? (
          <p className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <Camera className="mt-0.5 size-4 shrink-0" /> {cameraError}
          </p>
        ) : (
          <video ref={videoRef} className="aspect-video w-full rounded-md bg-black object-cover" muted playsInline />
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) handleCode(manual.trim());
            setManual("");
          }}
        >
          <div className="relative flex-1">
            <Keyboard className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Scanner input or member ID" className="pl-8" autoFocus />
          </div>
          <Button type="submit" variant="outline">
            Record
          </Button>
        </form>
        {last && <p className="text-sm text-muted-foreground">Last recorded: {last}</p>}
      </DialogContent>
    </Dialog>
  );
}
