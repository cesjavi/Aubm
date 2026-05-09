import React from 'react';
import { motion } from 'framer-motion';

const AubixIcon: React.FC<{ size?: number; className?: string }> = ({ size = 100, className }) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      initial={{ y: 0 }}
      animate={{ y: [0, -10, 0] }}
      transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
    >
      {/* Robot Head / Helmet */}
      <circle cx="100" cy="80" r="60" fill="#1A1A1A" stroke="#6E59FF" strokeWidth="4" />
      <path d="M60 80C60 57.9086 77.9086 40 100 40C122.091 40 140 57.9086 140 80V90H60V80Z" fill="#2A2A2A" />
      
      {/* Face Screen */}
      <rect x="70" y="65" width="60" height="35" rx="10" fill="#000" stroke="#00F0FF" strokeWidth="2" />
      
      {/* Glowing Eyes */}
      <motion.circle 
        cx="85" cy="82" r="5" fill="#00F0FF" 
        animate={{ opacity: [1, 0.3, 1] }} 
        transition={{ repeat: Infinity, duration: 2 }}
      />
      <motion.circle 
        cx="115" cy="82" r="5" fill="#00F0FF" 
        animate={{ opacity: [1, 0.3, 1] }} 
        transition={{ repeat: Infinity, duration: 2, delay: 0.2 }}
      />
      
      {/* Tentacles (Techno-organic) */}
      <path d="M70 130C50 150 30 140 20 160" stroke="#6E59FF" strokeWidth="8" strokeLinecap="round" />
      <path d="M90 140C85 170 80 180 85 190" stroke="#6E59FF" strokeWidth="8" strokeLinecap="round" />
      <path d="M110 140C115 170 120 180 115 190" stroke="#6E59FF" strokeWidth="8" strokeLinecap="round" />
      <path d="M130 130C150 150 170 140 180 160" stroke="#6E59FF" strokeWidth="8" strokeLinecap="round" />
      
      <path d="M50 110C30 120 20 100 10 120" stroke="#5040CC" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
      <path d="M150 110C170 120 180 100 190 120" stroke="#5040CC" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
      
      {/* Chest Badge */}
      <rect x="85" y="105" width="30" height="15" rx="4" fill="#6E59FF" />
      <text x="100" y="116" fontSize="8" fill="white" textAnchor="middle" fontWeight="bold" fontFamily="Arial">AUBM</text>
      
      {/* Antenna/Sensors */}
      <line x1="100" y1="40" x2="100" y2="20" stroke="#00F0FF" strokeWidth="2" />
      <circle cx="100" cy="20" r="4" fill="#00F0FF">
        <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
      </circle>
    </motion.svg>
  );
};

export default AubixIcon;
