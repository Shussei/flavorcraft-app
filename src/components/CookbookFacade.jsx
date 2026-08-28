import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Timer, ChefHat, Heart, Star, Clock, Flame, 
  Utensils, BookOpen, ChevronRight, X, Play, Pause, RotateCcw, Sparkles
} from 'lucide-react';
import { RECIPE_CATEGORIES, RECIPES_DATABASE } from '../data/recipesData';

export default function CookbookFacade({ onSecretTrigger, secretPin = '1314' }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [favorites, setFavorites] = useState(['creamy-garlic-pasta', 'avocado-salmon-bowl']);

  // Cooking Timer state
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(600); // Default 10 min
  const [timerActive, setTimerActive] = useState(false);
  const [timerInput, setTimerInput] = useState('');

  // Logo long press detection
  const logoPressTimer = useRef(null);

  // Filter recipes based on search and category
  const filteredRecipes = RECIPES_DATABASE.filter(recipe => {
    const matchesCategory = selectedCategory === 'all' || recipe.category === selectedCategory;
    const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          recipe.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Handle Search Submission (checks for Secret PIN 1314)
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const cleanSearch = searchQuery.trim();
    if (cleanSearch === secretPin || cleanSearch === '1314' || cleanSearch === 'vault') {
      setSearchQuery('');
      onSecretTrigger();
    }
  };

  // Logo long press handlers
  const handleLogoTouchStart = () => {
    logoPressTimer.current = setTimeout(() => {
      onSecretTrigger();
    }, 1800); // 1.8 seconds long press
  };

  const handleLogoTouchEnd = () => {
    if (logoPressTimer.current) {
      clearTimeout(logoPressTimer.current);
    }
  };

  // Cooking Timer countdown
  useEffect(() => {
    let interval = null;
    if (timerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  // Handle custom timer input submit (checks for 1314 or 13:14)
  const handleSetCustomTimer = () => {
    if (timerInput.trim() === secretPin || timerInput.trim() === '13:14' || timerInput.trim() === '1314') {
      setShowTimerModal(false);
      setTimerInput('');
      onSecretTrigger();
    } else {
      const parsedMin = parseInt(timerInput, 10);
      if (!isNaN(parsedMin) && parsedMin > 0) {
        setTimerSeconds(parsedMin * 60);
        setTimerInput('');
      }
    }
  };

  const toggleFavorite = (id, e) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f1117', color: '#f8fafc', paddingBottom: '80px' }}>
      
      {/* Top Navigation Bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: 'rgba(15, 17, 23, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        {/* Disguised Secret Trigger: Long Press Logo */}
        <div 
          onMouseDown={handleLogoTouchStart}
          onMouseUp={handleLogoTouchEnd}
          onTouchStart={handleLogoTouchStart}
          onTouchEnd={handleLogoTouchEnd}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
          }}>
            <ChefHat size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              FlavorCraft
            </h1>
            <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 600, letterSpacing: '0.05em' }}>
              GOURMET RECIPES
            </span>
          </div>
        </div>

        {/* Timer Button */}
        <button 
          onClick={() => setShowTimerModal(true)}
          className="btn-icon"
          title="Kitchen Cooking Timer"
          style={{ position: 'relative' }}
        >
          <Timer size={20} color="#f97316" />
          {timerActive && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981'
            }} />
          )}
        </button>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>

        {/* Hero Banner */}
        <div className="glass-panel" style={{
          padding: '28px', borderRadius: '24px', marginBottom: '28px',
          background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(15, 17, 23, 0.8))',
          border: '1px solid rgba(249, 115, 22, 0.2)',
          display: 'flex', flexDirection: 'column', gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f97316', fontWeight: 700, fontSize: '0.85rem' }}>
            <Sparkles size={16} /> RECIPE OF THE DAY
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.2 }}>
            Mastering Artisanal Comfort Food at Home
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '600px', lineHeight: 1.5 }}>
            Explore curated step-by-step recipes, precise kitchen timers, and chef notes for everyday gourmet cooking.
          </p>

          {/* Search Bar (Disguised Secret PIN Trigger) */}
          <form onSubmit={handleSearchSubmit} style={{ marginTop: '8px', position: 'relative', width: '100%', maxWidth: '520px' }}>
            <Search size={18} color="#64748b" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text"
              placeholder="Search recipes, ingredients or enter code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '14px 16px 14px 48px',
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px', color: '#fff', fontSize: '0.95rem',
                outline: 'none', transition: '0.2s ease'
              }}
            />
            <button 
              type="submit"
              className="btn-primary"
              style={{
                position: 'absolute', right: '6px', top: '6px', bottom: '6px',
                padding: '0 16px', borderRadius: '12px', fontSize: '0.85rem'
              }}
            >
              Search
            </button>
          </form>
        </div>

        {/* Category Pills */}
        <div style={{
          display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '28px',
          scrollbarWidth: 'none'
        }}>
          {RECIPE_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: '10px 18px', borderRadius: '14px', whiteSpace: 'nowrap',
                backgroundColor: selectedCategory === cat.id ? '#f97316' : 'rgba(255, 255, 255, 0.05)',
                color: selectedCategory === cat.id ? '#fff' : '#94a3b8',
                border: selectedCategory === cat.id ? '1px solid #ea580c' : '1px solid rgba(255, 255, 255, 0.08)',
                fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: '0.2s ease'
              }}
            >
              <span>{cat.icon}</span> {cat.label}
            </button>
          ))}
        </div>

        {/* Recipe Cards Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px'
        }}>
          {filteredRecipes.map(recipe => (
            <div 
              key={recipe.id}
              onClick={() => setActiveRecipe(recipe)}
              className="glass-panel"
              style={{
                borderRadius: '20px', overflow: 'hidden', cursor: 'pointer',
                transition: 'transform 0.25s ease, border-color 0.25s ease',
                display: 'flex', flexDirection: 'column'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              {/* Recipe Cover Art Card */}
              <div style={{
                height: '160px', background: recipe.gradient,
                padding: '16px', display: 'flex', flexDirection: 'column',
                justifyContract: 'space-between', position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: '20px',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)',
                    color: '#fff', fontSize: '0.75rem', fontWeight: 600
                  }}>
                    {recipe.difficulty}
                  </span>
                  <button 
                    onClick={(e) => toggleFavorite(recipe.id, e)}
                    style={{
                      width: '34px', height: '34px', borderRadius: '50%',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <Heart size={16} color={favorites.includes(recipe.id) ? '#f43f5e' : '#fff'} fill={favorites.includes(recipe.id) ? '#f43f5e' : 'none'} />
                  </button>
                </div>
                <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '3rem', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))' }}>{recipe.icon}</span>
                </div>
              </div>

              {/* Card Body */}
              <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 700 }}>
                  <Star size={14} fill="#f59e0b" /> {recipe.rating} Rating
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.3 }}>
                  {recipe.title}
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                  {recipe.description}
                </p>

                {/* Metadata Footer */}
                <div style={{
                  marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  color: '#64748b', fontSize: '0.8rem'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} /> {recipe.cookTime}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Flame size={14} /> {recipe.calories}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Recipe Detail Modal */}
      {activeRecipe && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-panel animate-fadeIn" style={{
            width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto',
            borderRadius: '24px', position: 'relative', border: '1px solid rgba(255, 255, 255, 0.12)'
          }}>
            {/* Modal Header Cover */}
            <div style={{
              height: '180px', background: activeRecipe.gradient, padding: '20px',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <button 
                onClick={() => setActiveRecipe(null)}
                style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)', border: 'none',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', alignSelf: 'flex-end'
                }}
              >
                <X size={20} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '3.5rem' }}>{activeRecipe.icon}</span>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{activeRecipe.title}</h2>
                  <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.85rem' }}>
                    {activeRecipe.prepTime} Prep • {activeRecipe.cookTime} Cook • Serves {activeRecipe.servings}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f97316', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Utensils size={16} /> INGREDIENTS LIST
                </h4>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeRecipe.ingredients.map((ing, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#cbd5e1' }}>
                      <input type="checkbox" style={{ accentColor: '#f97316', width: '16px', height: '16px' }} />
                      <span>{ing}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f97316', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BookOpen size={16} /> STEP-BY-STEP DIRECTIONS
                </h4>
                <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {activeRecipe.steps.map((step, i) => (
                    <li key={i} style={{ paddingLeft: '6px' }}>{step}</li>
                  ))}
                </ol>
              </div>

              <button 
                onClick={() => {
                  setActiveRecipe(null);
                  setShowTimerModal(true);
                }}
                className="btn-primary"
                style={{ width: '100%', marginTop: '10px' }}
              >
                <Timer size={18} /> Start Cooking Timer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cooking Timer Modal (Contains Disguised PIN Trigger: 13:14 or 1314) */}
      {showTimerModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div className="glass-panel animate-fadeIn" style={{
            width: '100%', maxWidth: '420px', padding: '24px', borderRadius: '24px',
            display: 'flex', flexDirection: 'column', gap: '20px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '1.1rem' }}>
                <Timer size={22} color="#f97316" /> Kitchen Timer
              </div>
              <button 
                onClick={() => setShowTimerModal(false)}
                className="btn-icon" style={{ width: '32px', height: '32px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Timer Clock Display */}
            <div style={{
              textAlign: 'center', padding: '24px', borderRadius: '20px',
              backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'monospace', color: '#f97316', letterSpacing: '0.05em' }}>
                {formatTime(timerSeconds)}
              </div>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {timerActive ? 'Timer running...' : 'Timer paused'}
              </span>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setTimerActive(!timerActive)}
                className="btn-primary"
                style={{ flex: 1 }}
              >
                {timerActive ? <Pause size={18} /> : <Play size={18} />}
                {timerActive ? 'Pause' : 'Start'}
              </button>
              <button 
                onClick={() => { setTimerActive(false); setTimerSeconds(600); }}
                className="btn-secondary"
              >
                <RotateCcw size={18} />
              </button>
            </div>

            {/* Custom Minutes Input (Disguised Secret PIN Trigger) */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '8px' }}>
                Set Custom Minutes:
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text"
                  placeholder="e.g. 15 or 13:14"
                  value={timerInput}
                  onChange={(e) => setTimerInput(e.target.value)}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff', fontSize: '0.9rem', outline: 'none'
                  }}
                />
                <button 
                  onClick={handleSetCustomTimer}
                  className="btn-secondary"
                  style={{ padding: '0 16px', fontSize: '0.85rem' }}
                >
                  Set
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
