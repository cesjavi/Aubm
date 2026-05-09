import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GuideTooltipProps {
  title: string;
  description: string;
  children: React.ReactNode;
  active: boolean;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const GuideTooltip: React.FC<GuideTooltipProps> = ({ 
  title, 
  description, 
  children, 
  active,
  position = 'top' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
      return () => {
        window.removeEventListener('scroll', updateCoords, true);
        window.removeEventListener('resize', updateCoords);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!active) return <>{children}</>;

  const getPopoverStyles = () => {
    const gap = 12;
    switch (position) {
      case 'bottom': 
        return { 
          top: coords.top + coords.height + gap, 
          left: coords.left + coords.width / 2, 
          x: '-50%' 
        };
      case 'left': 
        return { 
          top: coords.top + coords.height / 2, 
          left: coords.left - gap, 
          x: '-100%', 
          y: '-50%' 
        };
      case 'right': 
        return { 
          top: coords.top + coords.height / 2, 
          left: coords.left + coords.width + gap, 
          y: '-50%' 
        };
      default: // top
        return { 
          top: coords.top - gap, 
          left: coords.left + coords.width / 2, 
          x: '-50%', 
          y: '-100%' 
        };
    }
  };

  return (
    <div ref={triggerRef} className="guide-wrapper" style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      <div className={isOpen ? 'guide-highlight-active' : ''}>
        {children}
      </div>
      
      <button 
        className="guide-indicator"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          zIndex: 10,
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 0 10px var(--accent)',
          padding: 0
        }}
      >
        {isOpen ? <X size={12} /> : <HelpCircle size={12} />}
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              key="guide-popover"
              initial={{ opacity: 0, scale: 0.9, ...getPopoverStyles() }}
              animate={{ opacity: 1, scale: 1, ...getPopoverStyles() }}
              exit={{ opacity: 0, scale: 0.9, ...getPopoverStyles() }}
              className="glass-panel guide-popover"
              style={{
                position: 'fixed',
                zIndex: 9999,
                width: '240px',
                padding: 'var(--space-md)',
                border: '1px solid var(--accent)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(var(--accent-rgb), 0.2)',
                pointerEvents: 'auto'
              }}
            >
              <h4 style={{ margin: '0 0 var(--space-xs) 0', color: 'var(--accent)', fontSize: '0.9rem', textTransform: 'uppercase' }}>
                {title}
              </h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                {description}
              </p>
              <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.7rem', color: 'var(--text-dim)', textAlign: 'right', fontStyle: 'italic' }}>
                Click anywhere to close
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default GuideTooltip;
