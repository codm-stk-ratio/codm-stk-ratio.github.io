import React, { useState, useMemo, useEffect } from 'react';
import { CharacterModel, bodyPartsList } from './components/CharacterModel';
import type { PartId } from './components/CharacterModel';
import { calculateKillProbabilities, calculateCombinations } from './utils/ttkMath';
import type { BodyPartStats } from './utils/ttkMath';
import './index.css';

const GAME_MODES = [
  { id: 'mp', name: 'Multiplayer (100 HP)', defaultHp: 100 },
  { id: 'br', name: 'Battle Royale (300 HP)', defaultHp: 300 },
];

const FIXED_PROBABILITIES: Record<string, Record<PartId, number>> = {
  mp: {
    head: 0,
    chest: 15,
    upper_arm: 15,
    lower_arm: 30,
    stomach: 30,
    leg: 10
  },
  br: {
    head: 0,
    chest: 20,
    upper_arm: 15,
    lower_arm: 25,
    stomach: 30,
    leg: 10
  }
};

function App() {
  const [health, setHealth] = useState<number>(() => {
    const saved = localStorage.getItem('currentHealth');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [mode, setMode] = useState<string>(() => {
    return localStorage.getItem('currentMode') || 'mp';
  });
  
  const [damages, setDamages] = useState<Record<PartId, string>>(() => {
    const saved = localStorage.getItem('currentDamages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved damages');
      }
    }
    return {
      head: '', chest: '', stomach: '', upper_arm: '', lower_arm: '', leg: '',
    };
  });

  // Auto-save inputs
  useEffect(() => {
    localStorage.setItem('currentHealth', health.toString());
    localStorage.setItem('currentMode', mode);
    localStorage.setItem('currentDamages', JSON.stringify(damages));
  }, [health, mode, damages]);

  const [activePart, setActivePart] = useState<PartId | null>(null);

  // --- NEW: Theme State ---
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // --- NEW: Saved Builds State ---
  const [savedBuilds, setSavedBuilds] = useState<{id: number, name: string, damages: Record<PartId, string>}[]>(() => {
    const saved = localStorage.getItem('savedBuilds');
    return saved ? JSON.parse(saved) : [];
  });
  const [showLoadMenu, setShowLoadMenu] = useState(false);

  useEffect(() => {
    localStorage.setItem('savedBuilds', JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  const handleSaveDamages = () => {
    // 1. Check if damage configuration is identical to an existing build
    const isDuplicateDamage = savedBuilds.some(build => {
      return (Object.keys(damages) as PartId[]).every(key => 
        build.damages[key] === damages[key]
      );
    });

    if (isDuplicateDamage) {
      window.alert('Lỗi: Một cấu hình với các chỉ số sát thương y hệt đã được lưu trước đó!');
      return;
    }

    const defaultName = `Build ${savedBuilds.length + 1}`;
    let buildName = window.prompt('Nhập tên cho cấu hình này:', defaultName);
    
    if (buildName === null) return;
    
    buildName = buildName.trim() || defaultName;

    // 2. Check if name already exists
    const isDuplicateName = savedBuilds.some(build => build.name.toLowerCase() === buildName!.toLowerCase());
    
    if (isDuplicateName) {
      window.alert('Lỗi: Tên cấu hình này đã tồn tại. Vui lòng chọn một tên khác!');
      return;
    }

    setSavedBuilds(prev => [
      ...prev,
      {
        id: Date.now(),
        name: buildName!,
        damages: { ...damages }
      }
    ]);
    setShowLoadMenu(true);
  };

  const handleToggleLoadMenu = () => {
    setShowLoadMenu(!showLoadMenu);
  };

  const handleLoadBuild = (buildDamages: Record<PartId, string>) => {
    setDamages(buildDamages);
    setShowLoadMenu(false);
  };

  const handleDeleteBuild = (id: number) => {
    setSavedBuilds(prev => prev.filter(b => b.id !== id));
    if (savedBuilds.length <= 1) setShowLoadMenu(false);
  };

  const handleClearDamages = () => {
    setDamages({ head: '', chest: '', stomach: '', upper_arm: '', lower_arm: '', leg: '' });
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value;
    setMode(newMode);
    const modeData = GAME_MODES.find(m => m.id === newMode);
    if (modeData) {
      setHealth(modeData.defaultHp);
    }
  };

  const handleDamageChange = (partId: PartId, value: string) => {
    // Only allow digits and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setDamages(prev => ({
        ...prev,
        [partId]: value
      }));
    }
  };

  const { probResults, combinations, maxSTK, isReady } = useMemo(() => {
    // Check if any damage field is empty or 0
    const hasEmpty = bodyPartsList.some(p => damages[p.id] === '' || parseFloat(damages[p.id]) === 0);
    
    if (hasEmpty) {
      return { probResults: [], combinations: {}, maxSTK: 0, isReady: false };
    }

    const inputParts: BodyPartStats[] = bodyPartsList.map(p => ({
      name: p.label,
      damage: parseFloat(damages[p.id]),
      probability: FIXED_PROBABILITIES[mode][p.id]
    }));
    
    const probs = calculateKillProbabilities(health, inputParts, 20);
    const combs = calculateCombinations(health, inputParts);
    
    const allDamages = inputParts.map(p => p.damage).filter(d => d > 0);
    const minDmg = allDamages.length > 0 ? Math.min(...allDamages) : 1;
    const max = Math.ceil(health / minDmg);

    return { probResults: probs, combinations: combs, maxSTK: max, isReady: true };
  }, [health, damages, mode]);

  return (
    <div className="app-container">
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>CODM STK RATIO</h1>
        <button className="theme-toggle" onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {theme === 'dark' ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
              Light Mode
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
              Dark Mode
            </>
          )}
        </button>
      </header>

      <div className="main-content">
        <div className="left-panel">
          <div className="panel" style={{ marginBottom: '2rem' }}>
            <h2>Settings</h2>
            <div className="input-group">
              <label>Game Mode</label>
              <select value={mode} onChange={handleModeChange}>
                {GAME_MODES.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            
            <div className="input-group">
              <label>Custom Health</label>
              <input 
                type="number" 
                value={health} 
                onChange={(e) => setHealth(Math.max(1, parseInt(e.target.value) || 100))}
                min="1"
                max="1000"
              />
            </div>
          </div>

          <div className="panel" style={{ marginBottom: '2rem' }}>
            <h2>Quick Actions</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn" onClick={handleSaveDamages}>Save Build</button>
              <button className="btn" onClick={handleToggleLoadMenu} disabled={savedBuilds.length === 0}>
                Load Build ({savedBuilds.length})
              </button>
              <button className="btn" onClick={handleClearDamages}>Clear All</button>
            </div>
            
            {showLoadMenu && savedBuilds.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {savedBuilds.map(build => (
                  <div key={build.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    backgroundColor: 'var(--card-bg)', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '4px', 
                    border: '1px solid var(--border-color)' 
                  }}>
                    <span style={{ fontWeight: 'bold' }}>{build.name}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => handleLoadBuild(build.damages)} className="btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.9rem' }}>Load</button>
                      <button onClick={() => handleDeleteBuild(build.id)} className="btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.9rem', backgroundColor: '#d32f2f', borderColor: '#d32f2f', color: 'white' }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: '1rem' }}>
            <h2 style={{ padding: '0 1rem' }}>Character Model</h2>
            <CharacterModel 
              damages={damages}
              onDamageChange={handleDamageChange}
              activePart={activePart} 
              onPartClick={(part) => setActivePart(part === activePart ? null : part)} 
            />
          </div>
        </div>

        <div className="right-panel">
          <div className="panel">
            <h2>Kill Probability Analysis</h2>
            
            {isReady && probResults.length > 0 ? (
              <>
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Shots (STK)</th>
                      <th>Exact Prob.</th>
                      <th>Cumulative Prob.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {probResults.map(r => (
                      r.probability > 0.01 && (
                        <tr key={r.shots}>
                          <td>{r.shots} Shots</td>
                          <td>{r.probability.toFixed(2)}%</td>
                          <td>{r.cumulativeProbability.toFixed(2)}%</td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
                
                <div style={{ marginTop: '3rem' }}>
                  <h2>Shot Combinations</h2>
                  <p style={{ opacity: 0.7, marginBottom: '1rem', lineHeight: '1.5' }}>
                    Minimum body part combinations required to kill.
                  </p>
                  
                  {Object.keys(combinations).map(stkStr => {
                    const stk = parseInt(stkStr);
                    const combs = combinations[stk];
                    if (combs.length === 0) return null;

                    return (
                      <div key={stk} style={{ marginBottom: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>{stk}-Shot Kill Combinations</h3>
                        {stk === maxSTK ? (
                          <p>100% Consistent (Any remaining combinations guarantee a kill in {stk} shots).</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                            {combs.map((comb, idx) => (
                              <li key={idx}>
                                {comb.parts.map(p => `${p.count}x ${p.name} (${p.damage})`).join(' + ')}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {maxSTK > 0 && !combinations[maxSTK] && (
                    <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>{maxSTK}-Shot Kill</h3>
                        <p>100% Consistent (Any remaining combinations guarantee a kill in {maxSTK} shots).</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{
                backgroundColor: 'rgba(255, 152, 0, 0.1)',
                border: '1px solid var(--accent-color)',
                padding: '1.5rem',
                borderRadius: '8px',
                textAlign: 'center',
                marginTop: '2rem'
              }}>
                <h3 style={{ color: 'var(--accent-color)', marginTop: 0 }}>Waiting for Input...</h3>
                <p style={{ opacity: 0.8 }}>Please enter valid damage values for all body parts to view the analysis.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
