import React from 'react';

export default function EngineBackground() {
  return (
    <div 
      id="eret-blueprint-root"
      className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-slate-50 dark:bg-black flex items-center justify-center transition-colors duration-300"
    >
      {/* Premium background image from Eret.co.za (Ford Ranger 2.2 and 3.2 engine & rebuild image) */}
      <div 
        className="absolute inset-0 opacity-[0.26] dark:opacity-[0.35] transition-opacity duration-300 mix-blend-multiply dark:mix-blend-screen dark:invert eret-engine-bg-image"
        style={{
          backgroundImage: `url("https://eret.co.za/_Webmoduledata/Images/Raw/FORD%20RANGER%2022%20and%2032.jpg")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      />

      {/* Subtle blueprint grid layout lines with no moving parts */}
      <div 
        className="absolute inset-0 opacity-[0.015] dark:opacity-[0.04]" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M80 0H0v80h80V0zM40 0h1v80h-1V0zm0 40h40v1H40v-1zm-40 0h40v1H0v-1z' fill-opacity='0.4' fill='%23cc0000' fill-rule='evenodd'/%3E%3C/svg%3E")`
        }} 
      />

      {/* Subtle secondary fine grid pattern in dark mode to align with workshop precision */}
      <div 
        className="hidden dark:block absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(204, 0, 0, 0.15) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(204, 0, 0, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />

      {/* Subtle scanline overlay mock-CRT diagnostic screen effect */}
      <div 
        className="hidden dark:block absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 1) 50%)',
          backgroundSize: '100% 4px',
        }}
      />

      {/* Mechanical corner-marker drafting brackets */}
      <div className="hidden dark:block absolute top-6 left-6 w-8 h-8 border-t border-l border-red-900/30 shrink-0 pointer-events-none" />
      <div className="hidden dark:block absolute top-6 right-6 w-8 h-8 border-t border-r border-red-900/30 shrink-0 pointer-events-none" />
      <div className="hidden dark:block absolute bottom-6 left-6 w-8 h-8 border-b border-l border-red-900/30 shrink-0 pointer-events-none" />
      <div className="hidden dark:block absolute bottom-6 right-6 w-8 h-8 border-b border-r border-red-900/30 shrink-0 pointer-events-none" />
    </div>
  );
}

