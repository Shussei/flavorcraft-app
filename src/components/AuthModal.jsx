import React, { useState } from 'react';
import { Lock, KeyRound, Shield, X, ArrowRight, Delete } from 'lucide-react';

export default function AuthModal({ onCancel, onUnlockSecret, onUnlockDecoy, secretPin = '1515', decoyPin = '0000' }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleKeyPress = (num) => {
    if (pin.length >= 4) {
      return;
    }

    const nextPin = pin + num;
    setPin(nextPin);
    setErrorMsg('');

    if (nextPin.length === 4) {
      window.setTimeout(() => {
        submitPin(nextPin);
      }, 80);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setErrorMsg('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  const submitPin = (value) => {
    if (value === secretPin) {
      onUnlockSecret();
      return;
    }

    if (value === decoyPin) {
      onUnlockDecoy();
      return;
    }

    setShake(true);
    setErrorMsg('Incorrect authentication PIN');
    setTimeout(() => setShake(false), 500);
    setPin('');
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    submitPin(pin);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div className={`glass-panel animate-fadeIn ${shake ? 'animate-shake' : ''}`} style={{
        width: '100%', maxWidth: '380px', padding: '28px', borderRadius: '28px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px'
      }}>
        {/* Top Header */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.85rem' }}>
            <Shield size={16} color="#f97316" /> Chef Cloud Access
          </div>
          <button 
            onClick={onCancel}
            className="btn-icon" style={{ width: '32px', height: '32px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Lock Icon Header */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(15, 17, 23, 0.8))',
          border: '1px solid rgba(249, 115, 22, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <KeyRound size={28} color="#f97316" />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
            Security Keypad
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>
            Enter your secret PIN code to proceed
          </p>
        </div>

        {/* PIN Display Dots */}
        <div style={{
          display: 'flex', gap: '12px', padding: '12px 24px', borderRadius: '16px',
          backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {[0, 1, 2, 3].map((i) => (
            <div 
              key={i}
              style={{
                width: '14px', height: '14px', borderRadius: '50%',
                backgroundColor: pin.length > i ? '#f97316' : 'rgba(255, 255, 255, 0.15)',
                boxShadow: pin.length > i ? '0 0 10px #f97316' : 'none',
                transition: '0.15s ease'
              }}
            />
          ))}
        </div>

        {errorMsg && (
          <span style={{ fontSize: '0.8rem', color: '#f43f5e', fontWeight: 600 }}>
            {errorMsg}
          </span>
        )}

        {/* Numeric Keypad Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', width: '100%'
        }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              style={{
                height: '54px', borderRadius: '16px', fontSize: '1.25rem', fontWeight: 700,
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fff', cursor: 'pointer', transition: '0.15s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
              onMouseDown={(e) => e.currentTarget.style.backgroundColor = 'rgba(249, 115, 22, 0.2)'}
              onMouseUp={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
            >
              {num}
            </button>
          ))}

          <button 
            onClick={handleClear}
            style={{
              height: '54px', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 600,
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#94a3b8', cursor: 'pointer'
            }}
          >
            CLR
          </button>

          <button
            onClick={() => handleKeyPress('0')}
            style={{
              height: '54px', borderRadius: '16px', fontSize: '1.25rem', fontWeight: 700,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff', cursor: 'pointer'
            }}
          >
            0
          </button>

          <button 
            onClick={handleDelete}
            style={{
              height: '54px', borderRadius: '16px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              color: '#94a3b8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Submit Unlock Button */}
        <button 
          onClick={handleSubmit}
          className="btn-primary"
          style={{ width: '100%', marginTop: '6px' }}
        >
          Unlock Portal <ArrowRight size={18} />
        </button>

        <span style={{ fontSize: '0.725rem', color: '#64748b', textAlign: 'center' }}>
          Protected by AES-256 local encrypted storage
        </span>
      </div>
    </div>
  );
}
