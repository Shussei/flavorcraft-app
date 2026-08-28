import React, { useState } from 'react';
import { ShoppingBag, CheckSquare, Square, Plus, Trash2, ArrowLeft, Lock } from 'lucide-react';

export default function DecoyGroceryList({ onLock }) {
  const [items, setItems] = useState([
    { id: 1, text: 'Organic Whole Milk (1 Gallon)', checked: true, category: 'Dairy' },
    { id: 2, text: 'Extra Virgin Olive Oil', checked: false, category: 'Pantry' },
    { id: 3, text: 'Fresh Basil & Parsley', checked: true, category: 'Produce' },
    { id: 4, text: 'Parmigiano-Reggiano Wedge', checked: false, category: 'Dairy' },
    { id: 5, text: 'Fettuccine Pasta (500g)', checked: true, category: 'Pantry' },
    { id: 6, text: 'Hass Avocados (4-pack)', checked: false, category: 'Produce' }
  ]);
  const [newItemText, setNewItemText] = useState('');

  const toggleCheck = (id) => {
    setItems(items.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const addItem = (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    setItems([...items, { id: Date.now(), text: newItemText.trim(), checked: false, category: 'General' }]);
    setNewItemText('');
  };

  const deleteItem = (id) => {
    setItems(items.filter(item => item.id !== id));
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f8fafc', padding: '20px' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: '20px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            backgroundColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShoppingBag size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Weekly Grocery Notes</h2>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Decoy Storage • 6 items saved</span>
          </div>
        </div>

        <button 
          onClick={onLock}
          className="btn-secondary"
          style={{ padding: '8px 14px', fontSize: '0.85rem' }}
        >
          <Lock size={16} /> Exit Notes
        </button>
      </header>

      <main style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <form onSubmit={addItem} style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text"
            placeholder="Add new grocery item..."
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: '14px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff', fontSize: '0.9rem', outline: 'none'
            }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '0 20px' }}>
            <Plus size={18} /> Add
          </button>
        </form>

        <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(item => (
            <div 
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                cursor: 'pointer', transition: '0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {item.checked ? (
                  <CheckSquare size={20} color="#10b981" />
                ) : (
                  <Square size={20} color="#64748b" />
                )}
                <span style={{
                  fontSize: '0.95rem',
                  textDecoration: item.checked ? 'line-through' : 'none',
                  color: item.checked ? '#64748b' : '#f8fafc'
                }}>
                  {item.text}
                </span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
