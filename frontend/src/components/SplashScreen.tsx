import React from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

const SplashScreen: React.FC = () => {
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'var(--bg-dark)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          type: "spring",
          stiffness: 260,
          damping: 20,
          delay: 0.2
        }}
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '30px',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--primary) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-xl)',
          boxShadow: '0 20px 40px rgba(110, 89, 255, 0.3)',
        }}
      >
        <Bot size={60} color="white" />
      </motion.div>

      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{ 
          fontSize: '3rem', 
          fontWeight: 'bold', 
          background: 'linear-gradient(to right, #fff, #6e59ff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 'var(--space-md)'
        }}
      >
        Aubm
      </motion.h1>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.6, duration: 1.5, ease: "easeInOut" }}
        style={{
          width: '200px',
          height: '4px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <motion.div
          animate={{ 
            x: ['-100%', '100%']
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 1.5,
            ease: "linear"
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'var(--accent)',
            boxShadow: '0 0 10px var(--accent)'
          }}
        />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        style={{ 
          marginTop: 'var(--space-lg)', 
          color: 'var(--text-dim)',
          fontSize: '0.9rem',
          letterSpacing: '2px',
          textTransform: 'uppercase'
        }}
      >
        Orchestrating Intelligence
      </motion.p>
    </motion.div>
  );
};

export default SplashScreen;
