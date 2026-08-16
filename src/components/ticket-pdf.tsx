import React, { useEffect, useRef, useState } from 'react';
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';

interface TicketPDFProps {
  event: any;
  resultData: any;
  type: 'pdf' | 'png';
  onComplete: () => void;
}

export function TicketPDF({ event, resultData, type, onComplete }: TicketPDFProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // 1. Generate QR Code
  useEffect(() => {
    const payload = String(resultData.applicationNumber || resultData.studentName || 'UNKNOWN');
    QRCode.toDataURL(payload, {
      width: 200,
      margin: 1,
      color: {
        dark: '#8B1E2D',
        light: '#FFFFFF'
      }
    })
      .then(setQrDataUrl)
      .catch((err) => {
        console.error('QR Code error:', err);
        setQrDataUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'); // empty fallback
      });
  }, [resultData]);

  // 2. Trigger generation after a short delay to ensure rendering
  useEffect(() => {
    if (!qrDataUrl || !containerRef.current) return;

    const generate = async () => {
      try {
        // Wait an extra moment for the logo image to fully load
        await new Promise(resolve => setTimeout(resolve, 800));

        const element = containerRef.current;
        if (!element) return;

        const appNum = resultData.applicationNumber || 'UNKNOWN';
        const filename = `Aarambh-2026-Entry-Pass-${appNum}`;

        if (type === 'pdf') {
          const imgData = await toJpeg(element, {
            quality: 1.0,
            pixelRatio: 3,
            backgroundColor: '#FFFDFC',
          });
          // Landscape, units in px, 1200x675
          const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [1200, 675]
          });
          pdf.addImage(imgData, 'JPEG', 0, 0, 1200, 675);
          pdf.save(`${filename}.pdf`);
        } else if (type === 'png') {
          const imgData = await toPng(element, {
            pixelRatio: 3,
            backgroundColor: '#FFFDFC',
          });
          const link = document.createElement('a');
          link.href = imgData;
          link.download = `${filename}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } catch (err: any) {
        console.error('Error generating pass:', err);
        alert('Failed to generate pass: ' + (err?.message || err));
      } finally {
        onComplete();
      }
    };

    generate();
  }, [qrDataUrl, type, resultData, onComplete]);

  // Dynamic accent color
  const getAccentColor = () => {
    const status = resultData.status?.toLowerCase() || '';
    const typeStr = resultData.studentType?.toLowerCase() || '';
    
    if (status === 'late') return '#F97316'; // Orange
    if (typeStr === 'vip') return '#C8A55A'; // Gold
    if (typeStr === 'faculty') return '#3B82F6'; // Blue
    if (typeStr === 'volunteer') return '#A855F7'; // Purple
    return '#00B26F'; // Default On Time / Present -> Green
  };

  const accentColor = getAccentColor();
  const guestCount = resultData.guests ? Number(resultData.guests) : 0;
  const passId = `A26-${resultData.applicationNumber || 'UNKNOWN'}`;

  // Helper to format date
  const eventDate = event?.starts_at ? new Date(event.starts_at) : new Date();

  return (
    <div className="opacity-0 pointer-events-none fixed top-0 left-0 z-[-50]">
      <div 
        ref={containerRef}
        className="relative overflow-hidden flex"
        style={{ 
          width: '1200px', 
          height: '675px', 
          backgroundColor: '#FFFDFC',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        {/* Background Gradients & Patterns */}
        <div className="absolute inset-0 z-0 opacity-40" style={{
          background: 'radial-gradient(circle at 0% 0%, rgba(137,32,44,0.15) 0%, transparent 40%), radial-gradient(circle at 100% 100%, rgba(200,165,90,0.1) 0%, transparent 40%)'
        }} />
        
        {/* Diagonal Watermark */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex flex-col justify-center items-center" style={{ opacity: 0.02, transform: 'rotate(-15deg) scale(1.5)' }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="whitespace-nowrap text-[80px] font-black tracking-widest text-black leading-none mb-8">
              AARAMBH AARAMBH AARAMBH AARAMBH AARAMBH AARAMBH
            </div>
          ))}
        </div>

        {/* Faded ADMIT ONE */}
        <div className="absolute bottom-4 left-10 z-0 pointer-events-none opacity-5">
          <h1 className="text-[120px] font-black tracking-tighter text-[#8B1E2D] m-0 leading-none">
            ADMIT ONE
          </h1>
        </div>

        {/* Left Section (Content) */}
        <div className="w-[850px] h-full p-12 flex flex-col justify-between z-10 relative border-r-2 border-dashed border-[#8B1E2D]/20">
          
          {/* Top Header */}
          <div className="flex items-start justify-between">
            <div>
              <img src="/krmu-logo-transparent.png" alt="KRMU" className="h-16 mb-4" />
              <h2 className="text-4xl font-black text-[#8B1E2D] tracking-widest uppercase mb-1">
                AARAMBH 2026
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xl font-medium tracking-[0.2em] text-[#C8A55A] uppercase">
                  ENTRY PASS
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B1E2D]/30" />
                <span className="text-xl font-light text-gray-500 uppercase tracking-widest">
                  Orientation Programme
                </span>
              </div>
            </div>
            
            {/* Status Badge */}
            <div 
              className="px-4 py-2 rounded-full border flex items-center gap-2"
              style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}10` }}
            >
              <CheckCircle2 size={18} color={accentColor} />
              <span style={{ color: accentColor }} className="text-sm font-bold uppercase tracking-wide">
                Attendance Verified
              </span>
            </div>
          </div>

          {/* Middle Content - Split Event & Student */}
          <div className="flex gap-12 mt-10">
            {/* Student Info */}
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">Student</p>
              <h1 className="text-[42px] font-black text-[#1A1A1A] leading-none mb-2 tracking-tight">
                {resultData.studentName || resultData.applicationNumber || 'Student Name'}
              </h1>
              <p className="text-2xl font-medium text-[#8B1E2D] mb-6">
                {resultData.programme || 'B.Tech Computer Science'}
              </p>
              
              <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Application No.</p>
                  <p className="text-lg font-bold text-gray-800">{resultData.applicationNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">School</p>
                  <p className="text-lg font-bold text-gray-800 truncate">{resultData.school || 'SOET'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Batch</p>
                  <p className="text-lg font-bold text-gray-800">{resultData.batch || '2026-2030'}</p>
                </div>
                {resultData.section && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Section</p>
                    <p className="text-lg font-bold text-gray-800">{resultData.section}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Event Info Card */}
            <div className="w-[300px] bg-[#FFFDFC] border border-[#8B1E2D]/10 rounded-2xl p-6 shadow-[0_8px_30px_rgb(137,32,44,0.06)] relative overflow-hidden h-fit">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#C8A55A]" />
              
              <p className="text-xs font-bold text-[#8B1E2D] uppercase tracking-widest mb-4">Event Details</p>
              
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Date</p>
                  <p className="text-sm font-bold text-gray-800">{format(eventDate, 'EEEE, dd MMM yyyy')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Time</p>
                  <p className="text-sm font-bold text-gray-800">{format(eventDate, 'hh:mm a')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Venue</p>
                  <p className="text-sm font-bold text-gray-800">{event?.venue || 'Campus'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Strip */}
          <div className="mt-auto border-t border-[#8B1E2D]/10 pt-4 flex justify-between items-end">
            <div>
              <p className="text-xs font-bold text-[#8B1E2D] uppercase tracking-widest mb-1">Official Digital Entry Pass</p>
              <p className="text-[10px] text-gray-500">Issued under Aarambh 2026 • Powered by eOzka</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400 mb-0.5">This pass is digitally generated. Non-transferable.</p>
              <p className="text-[10px] text-gray-400">Valid only with official verification.</p>
            </div>
          </div>

        </div>

        {/* Right Section (Verification & QR) */}
        <div className="w-[350px] h-full p-10 flex flex-col items-center justify-center z-10 relative bg-[#8B1E2D]/[0.02]">
          
          <div className="text-center w-full mb-8">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Pass ID</p>
            <p className="text-xl font-black text-[#8B1E2D] tracking-wider bg-white py-2 px-4 rounded-lg border border-[#8B1E2D]/10 inline-block shadow-sm">
              {passId}
            </p>
          </div>

          {/* Guest Badge */}
          <div className="w-full text-center mb-10">
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8B1E2D]/20 to-transparent mb-4" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ENTRY</p>
            <p className="text-lg font-bold text-gray-800">
              Student <span className="text-[#8B1E2D] mx-2">+</span> {guestCount} Guest{guestCount !== 1 ? 's' : ''}
            </p>
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8B1E2D]/20 to-transparent mt-4" />
          </div>

          {/* QR Code */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#8B1E2D]/10 mb-4">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-[180px] h-[180px]" />
            ) : (
              <div className="w-[180px] h-[180px] bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                Generating...
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[#8B1E2D] uppercase tracking-widest mb-1">SCAN TO VERIFY</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Official Verification Code</p>
          </div>

          <div className="mt-auto text-center">
            <p className="text-[10px] font-medium text-gray-400">
              Issued: {format(new Date(), 'dd MMM yyyy • hh:mm a')}
            </p>
          </div>
          
        </div>

      </div>
    </div>
  );
}
