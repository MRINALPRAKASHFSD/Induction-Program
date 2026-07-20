import { createLazyFileRoute } from '@tanstack/react-router';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export const Route = createLazyFileRoute('/campus')({
  component: CampusRoute,
});

function CampusRoute() {
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50 relative">
      <div className="px-4 py-3 bg-white border-b shadow-sm z-10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#5a1a25]">Campus Map</h1>
          <p className="text-xs text-slate-500 font-medium">Pinch or scroll to zoom, drag to pan</p>
        </div>
      </div>
      
      <div className="flex-1 w-full relative overflow-hidden bg-[#e8e4e1] touch-none">
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={4}
          centerOnInit={true}
          wheel={{ step: 0.1 }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Floating Controls */}
              <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-slate-200/50">
                <button 
                  className="p-2.5 bg-transparent hover:bg-slate-100 rounded-lg text-slate-700 transition-colors" 
                  onClick={() => zoomIn()}
                  aria-label="Zoom In"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <div className="h-px bg-slate-200 mx-1" />
                <button 
                  className="p-2.5 bg-transparent hover:bg-slate-100 rounded-lg text-slate-700 transition-colors" 
                  onClick={() => zoomOut()}
                  aria-label="Zoom Out"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <div className="h-px bg-slate-200 mx-1" />
                <button 
                  className="p-2.5 bg-transparent hover:bg-slate-100 rounded-lg text-slate-700 transition-colors flex flex-col items-center" 
                  onClick={() => resetTransform()}
                  aria-label="Reset Zoom"
                >
                  <Maximize className="w-5 h-5" />
                </button>
              </div>

              {/* Map Viewer */}
              <TransformComponent 
                wrapperStyle={{ width: "100%", height: "100%" }} 
                contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <img
                  src="/campus-map.jpg"
                  alt="KRMU Campus Map"
                  className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
                  style={{ maxHeight: '100%', maxWidth: '100%' }}
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}
