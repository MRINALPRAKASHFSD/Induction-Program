import React from 'react';

export function WaveDivider({ color = "#ffffff" }: { color?: string }) {
  return (
    <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0] transform translate-y-[1px]">
      <svg
        className="relative block w-[calc(100%+1.3px)] h-[50px] md:h-[80px]"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <path
          d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.8C59.71,118,137.31,123.63,207.41,115.35c67.4-8,133.37-33.15,199.19-53Z"
          fill={color}
        ></path>
      </svg>
    </div>
  );
}
