import React from 'react';

export default function Logo({ 
  className = "h-12",
  iconOnly = false,
  inverse = false, // Not heavily used now but keeping signature
  outlined = false
}: { 
  className?: string; 
  iconOnly?: boolean;
  inverse?: boolean;
  outlined?: boolean;
}) {
  // We use the className (like "h-9 sm:h-11") to derive the scale of our oval logo
  let scaleMainFontSize = "text-xl sm:text-2xl";
  let scaleSubFontSize = "text-[7px] sm:text-[8px]";
  let paddingClasses = "px-5 py-2.5";
  let borderClass = "border-[2px]";
  let marginTop = "mt-1";
  let radiusClass = "rounded-[1.5rem]";

  if (className.includes("h-4") || className.includes("h-5")) {
    scaleMainFontSize = "text-[9px]";
    scaleSubFontSize = "text-[3px]";
    paddingClasses = "px-2 py-0.5";
    borderClass = "border-[1px]";
    marginTop = "mt-0.5";
    radiusClass = "rounded-md";
  } else if (className.includes("h-6") || className.includes("text-xs")) {
    scaleMainFontSize = "text-[12px]";
    scaleSubFontSize = "text-[4.5px]";
    paddingClasses = "px-3 py-1";
    borderClass = "border-[1.5px]";
    marginTop = "mt-0.5";
    radiusClass = "rounded-lg";
  } else if (className.includes("h-8")) {
    scaleMainFontSize = "text-sm";
    scaleSubFontSize = "text-[5.5px]";
    paddingClasses = "px-4 py-1.5";
    borderClass = "border-[1.5px]";
    marginTop = "mt-0.5";
    radiusClass = "rounded-xl";
  } else if (className.includes("h-9") || className.includes("h-10")) {
    scaleMainFontSize = "text-lg sm:text-[22px]";
    scaleSubFontSize = "text-[7px] sm:text-[8px]";
    paddingClasses = "px-5 py-1.5 z-10";
    borderClass = "border-[2.5px] border-slate-900";
    marginTop = "mt-[3px]";
    radiusClass = "rounded-2xl";
  } else if (className.includes("h-11") || className.includes("h-12")) {
    scaleMainFontSize = "text-[22px] sm:text-[26px]";
    scaleSubFontSize = "text-[8px] sm:text-[9px]";
    paddingClasses = "px-7 py-2 z-10";
    borderClass = "border-[3px] border-slate-900";
    marginTop = "mt-[3px]";
    radiusClass = "rounded-[1.5rem]";
  } else if (className.includes("h-16") || className.includes("h-20") || className.includes("h-24")) {
    scaleMainFontSize = "text-5xl md:text-7xl";
    scaleSubFontSize = "text-sm md:text-xl";
    paddingClasses = "px-14 md:px-20 py-8 md:py-12 z-10";
    borderClass = "border-[5px] border-slate-950";
    marginTop = "mt-3";
    radiusClass = "rounded-[2rem]";
  }

  // Remove `h-` classes so the oval container can size freely around the text via padding
  const containerClasses = className.replace(/h-\d+|sm:h-\d+|md:h-\d+|lg:h-\d+/g, "").trim();

  // If icon only, just render a tiny version without text if needed, but since it's an oval text logo we just render a tiny oval.
  if (iconOnly) {
    return (
      <div 
        className={`inline-flex items-center justify-center bg-white border-black border-2 px-3 py-2 ${containerClasses} rounded-xl`}
      >
        <span className="text-[10px] font-black tracking-tighter">
          <span className="text-slate-950">E</span>
          <span className="text-[#cc0000]">R</span>
        </span>
      </div>
    );
  }

  return (
    <div 
      className={`inline-flex flex-col items-center justify-center bg-white ${paddingClasses} ${borderClass} ${containerClasses} shadow-[2px_2px_0px_#000] hover:shadow-[3px_3px_0px_#000] hover:-translate-y-0.5 transition-all outline-none ${radiusClass}`}
    >
      <div className={`${scaleMainFontSize} font-sans font-black tracking-tighter leading-none flex items-center`}>
        <span className="text-slate-950">EAST</span>
        <span className="text-[#cc0000]">RAND</span>
      </div>
      <div className={`${marginTop} ${scaleSubFontSize} tracking-[0.3em] font-sans font-black text-slate-800 uppercase leading-none text-center`}>
        ENGINE & TURBO
      </div>
    </div>
  );
}
