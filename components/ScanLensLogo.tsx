import React from 'react';
import Svg, { Circle, Rect, Path, Line, G, Defs, ClipPath } from 'react-native-svg';

interface LogoProps {
  size?: number;
  theme?: 'light' | 'dark';
}

const PlantLensLogo: React.FC<LogoProps> = ({ size = 40, theme = 'light' }) => {
  const frameColor = theme === 'dark' ? '#9ca3af' : '#374151';
  const leafColor = theme === 'dark' ? '#4ade80' : '#22c55e';
  const veinColor = theme === 'dark' ? '#bbf7d0' : '#15803d';
  const lensColor = theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.1)';

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
    >
      <Defs>
        <ClipPath id="lensClipPath">
          <Circle cx="45" cy="45" r="30" />
        </ClipPath>
      </Defs>
      
      {/* Handle */}
      <Rect 
        x="68" y="68" 
        width="20" height="20" 
        rx="5" ry="5" 
        rotation={45}
        origin="78, 78"
        fill={frameColor}
      />
      
      {/* Frame */}
      <Circle 
        cx="45" cy="45" r="30" 
        fill="none" 
        stroke={frameColor}
        strokeWidth="8"
      />
      
      {/* Lens with Leaf */}
      <G clipPath="url(#lensClipPath)">
        {/* Lens Glass Effect */}
        <Circle 
          cx="45" cy="45" r="30" 
          fill={lensColor}
        />
        
        {/* Leaf */}
        <Path 
          d="M 45,20 C 65,25 65,65 45,70 C 25,65 25,25 45,20 Z" 
          fill={leafColor}
        />
        {/* Leaf Vein */}
        <Line 
          x1="45" y1="22" x2="45" y2="68" 
          stroke={veinColor}
          strokeWidth="3" 
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
};

export default PlantLensLogo;
