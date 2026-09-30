import React, { useState, useMemo, useEffect } from 'react';
import { CharacterModel, bodyPartsList } from './components/CharacterModel';
import type { PartId } from './components/CharacterModel';
import { calculateKillProbabilities, calculateCombinations } from './utils/ttkMath';
import type { BodyPartStats } from './utils/ttkMath';
import { translations, languageNames, type Locale } from './locales';
import './index.css';

const GAME_MODES = [
  { id: 'mp', name: 'app.mp_100', defaultHp: 100 },
  { id: 'br', name: 'app.br_300', defaultHp: 300 },
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

type DialogConfig = {
  isOpen: boolean;
  type: 'alert' | 'prompt';
  message: string;
  defaultValue?: string;
  onConfirm?: (value?: string) => void;
  onCancel?: () => void;
};

const CustomDialog = ({ config, onClose, t }: { config: DialogConfig, onClose: () => void, t: (key: string) => string }) => {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (config.isOpen) {
      setInputValue(config.defaultValue || '');
    }
  }, [config.isOpen, config.defaultValue]);

  if (!config.isOpen) return null;

  const handleConfirm = () => {
    if (config.onConfirm) {
      config.onConfirm(config.type === 'prompt' ? inputValue : undefined);
    }
    onClose();
  };

  const handleCancel = () => {
    if (config.onCancel) config.onCancel();
    onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
      <div className="modal-content" style={{ maxWidth: '400px', padding: '1.5rem', textAlign: 'center' }}>
        <div className="modal-header" style={{ marginBottom: '1rem', borderBottom: 'none', paddingBottom: 0, justifyContent: 'center' }}>
          <h2 style={{ fontSize: '1.4rem' }}>{config.type === 'alert' ? t('title.alert') : t('title.prompt')}</h2>
        </div>
        <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem', wordBreak: 'break-word', marginTop: 0 }}>{config.message}</p>
        
        {config.type === 'prompt' && (
          <input 
            type="text" 
            value={inputValue} 
            onChange={e => setInputValue(e.target.value)}
            autoFocus
            style={{ 
              width: 'calc(100% - 1.2rem)', padding: '0.6rem', marginBottom: '1.5rem',
              background: 'var(--input-bg)', color: 'var(--text-color)', 
              border: '1px solid var(--border-color)', borderRadius: '4px',
              fontFamily: 'inherit', fontSize: '1.1rem' 
            }}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          {config.type === 'prompt' && (
            <button className="btn" onClick={handleCancel} style={{ backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-color)' }}>
              {t('btn.cancel')}
            </button>
          )}
          <button className="btn" onClick={handleConfirm} style={{ minWidth: '80px' }}>
            {t('btn.ok')}
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [health, setHealth] = useState<number>(() => {
    const saved = localStorage.getItem('currentHealth');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [mode, setMode] = useState<string>(() => {
    return localStorage.getItem('currentMode') || 'mp';
  });
  const [fireInterval, setFireInterval] = useState<string>(() => {
    return localStorage.getItem('currentFireInterval') || '';
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
    localStorage.setItem('currentFireInterval', fireInterval);
    localStorage.setItem('currentDamages', JSON.stringify(damages));
  }, [health, mode, damages, fireInterval]);

  const [activePart, setActivePart] = useState<PartId | null>(null);

  // --- Theme State ---
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

  // --- Locale State ---
  const [locale, setLocale] = useState<Locale>(() => {
    return (localStorage.getItem('locale') as Locale) || 'vi';
  });

  useEffect(() => {
    document.body.setAttribute('data-lang', locale);
    localStorage.setItem('locale', locale);
  }, [locale]);

  const t = (key: string, ...args: (string | number)[]) => {
    const dict = translations[locale];
    let str = dict[key] || key;
    args.forEach((arg, i) => {
      str = str.replace(`{${i}}`, String(arg));
    });
    return str;
  };

  // --- NEW: Saved Builds State ---
  const [savedBuilds, setSavedBuilds] = useState<{id: number, name: string, damages: Record<PartId, string>, fireInterval?: string}[]>(() => {
    const saved = localStorage.getItem('savedBuilds');
    return saved ? JSON.parse(saved) : [];
  });
  const [modalState, setModalState] = useState<'none' | 'load' | 'save'>('none');
  const [newBuildName, setNewBuildName] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('savedBuilds', JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({ isOpen: false, type: 'alert', message: '' });

  const handleSaveDamages = () => {
    // 1. Check if damage configuration is identical to an existing build
    const isDuplicateDamage = savedBuilds.some(build => {
      return (Object.keys(damages) as PartId[]).every(key => 
        build.damages[key] === damages[key]
      ) && build.fireInterval === fireInterval;
    });

    if (isDuplicateDamage) {
      setDialogConfig({ isOpen: true, type: 'alert', message: t('alert.duplicate_damage') });
      return;
    }

    setNewBuildName(`Build ${savedBuilds.length + 1}`);
    setModalState('save');
  };
  
  const handleSaveNew = () => {
    let name = newBuildName.trim();
    if (!name) return;
    
    const isDuplicateName = savedBuilds.some(b => b.name.toLowerCase() === name.toLowerCase());
    if (isDuplicateName) {
      setDialogConfig({ isOpen: true, type: 'alert', message: t('alert.duplicate_name') });
      return;
    }
    
    setSavedBuilds(prev => [
      ...prev,
      {
        id: Date.now(),
        name,
        damages: { ...damages },
        fireInterval
      }
    ]);
    setModalState('none');
  };

  const handleOverwrite = (id: number) => {
    setSavedBuilds(prev => prev.map(b => b.id === id ? { ...b, damages: { ...damages }, fireInterval } : b));
    setModalState('none');
  };

  const handleRenameBuild = (id: number) => {
    const build = savedBuilds.find(b => b.id === id);
    if (!build) return;
    
    setDialogConfig({
      isOpen: true,
      type: 'prompt',
      message: t('prompt.rename_build'),
      defaultValue: build.name,
      onConfirm: (newNameRaw) => {
        if (!newNameRaw) return;
        const newName = newNameRaw.trim();
        if (!newName || newName === build.name) return;
        
        const isDuplicateName = savedBuilds.some(b => b.id !== id && b.name.toLowerCase() === newName.toLowerCase());
        if (isDuplicateName) {
          setTimeout(() => setDialogConfig({ isOpen: true, type: 'alert', message: t('alert.duplicate_name') }), 100);
          return;
        }

        setSavedBuilds(prev => prev.map(b => b.id === id ? { ...b, name: newName } : b));
      }
    });
  };

  const handleLoadBuild = (buildDamages: Record<PartId, string>, buildFireInterval?: string) => {
    setDamages(buildDamages);
    setFireInterval(buildFireInterval || '');
    setModalState('none');
  };

  const handleDeleteBuild = (id: number) => {
    setSavedBuilds(prev => prev.filter(b => b.id !== id));
    if (savedBuilds.length <= 1) setModalState('none');
  };

  const handleClearDamages = () => {
    setDamages({ head: '', chest: '', stomach: '', upper_arm: '', lower_arm: '', leg: '' });
    setFireInterval('');
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
      <header className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>CODM STK RATIO</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select 
            value={locale}
            onChange={e => setLocale(e.target.value as Locale)}
            style={{
              background: 'transparent',
              color: 'var(--text-color)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '0.4rem 0.5rem 0.4rem 2rem',
              fontFamily: 'inherit',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'></circle><line x1='2' y1='12' x2='22' y2='12'></line><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'></path></svg>")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: '6px center'
            }}
          >
            {Object.entries(languageNames).map(([code, name]) => (
              <option key={code} value={code} style={{ color: '#000' }}>{name}</option>
            ))}
          </select>

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
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              </>
            )}
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className="left-panel">
          <div className="panel" style={{ marginBottom: '2rem' }}>
            <div className="input-group">
              <label>{t('app.game_mode')}</label>
              <select value={mode} onChange={handleModeChange}>
                {GAME_MODES.map(m => (
                  <option key={m.id} value={m.id}>{t(m.name)}</option>
                ))}
              </select>
            </div>
            
            <div className="input-group">
              <label>{t('app.custom_health')}</label>
              <input 
                type="number" 
                value={health} 
                onChange={(e) => setHealth(Math.max(1, parseInt(e.target.value) || 100))}
                min="1"
                max="1000"
              />
            </div>

            <div className="input-group">
              <label>{t('app.fire_interval')}</label>
              <input 
                type="number" 
                value={fireInterval} 
                onChange={(e) => setFireInterval(e.target.value)}
                placeholder="e.g. 100"
                min="0"
              />
            </div>
          </div>

          <div className="panel" style={{ marginBottom: '2rem' }}>
            <h2>{t('app.quick_actions')}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn" onClick={handleSaveDamages}>{t('btn.save_build')}</button>
              <button className="btn" onClick={() => setModalState('load')} disabled={savedBuilds.length === 0}>
                {t('btn.load_build')} ({savedBuilds.length})
              </button>
              <button className="btn" onClick={handleClearDamages}>{t('btn.clear_all')}</button>
            </div>
          </div>

          <div className="panel" style={{ padding: '1rem' }}>
            <h2 style={{ padding: '0 1rem' }}>{t('title.character_model')}</h2>
            <CharacterModel 
              damages={damages}
              onDamageChange={handleDamageChange}
              activePart={activePart} 
              onPartClick={(part) => setActivePart(part === activePart ? null : part)} 
              t={t}
            />
          </div>
        </div>

        <div className="right-panel">
          <div className="panel">
            <h2>{t('title.kill_prob')}</h2>
            
            {isReady && probResults.length > 0 ? (
              <>
                {(() => {
                  const fi = parseFloat(fireInterval) || 0;
                  let expectedTTK = 0;
                  if (fi > 0) {
                    let expectedShots = 0;
                    probResults.forEach(r => {
                      expectedShots += (r.probability / 100) * r.shots;
                    });
                    const maxCumul = probResults[probResults.length - 1].cumulativeProbability / 100;
                    if (maxCumul > 0) {
                      expectedShots = expectedShots / maxCumul;
                    }
                    expectedTTK = (expectedShots - 1) * fi;
                  }

                  const formatTTK = (val: number) => parseFloat(val.toFixed(2));

                  return (
                    <>
                      {fi > 0 && expectedTTK > 0 && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255, 152, 0, 0.1)', border: '1px solid var(--accent-color)', borderRadius: '4px' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{t('avg.ttk')}</span>
                          <span style={{ color: 'var(--accent-color)', fontSize: '1.2rem', fontWeight: 'bold' }}>{formatTTK(expectedTTK)} ms</span>
                        </div>
                      )}
                      
                      <table className="results-table">
                        <thead>
                          <tr>
                            <th>{t('table.shots')}</th>
                            {fi > 0 && <th>{t('table.ttk')}</th>}
                            <th>{t('table.exact')}</th>
                            <th>{t('table.cumulative')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {probResults.map(r => (
                            r.probability > 0.01 && (
                              <tr key={r.shots}>
                                <td>{r.shots}{t('table.shots_suffix')}</td>
                                {fi > 0 && <td>{formatTTK((r.shots - 1) * fi)} ms</td>}
                                <td>{r.probability.toFixed(2)}%</td>
                                <td>{r.cumulativeProbability.toFixed(2)}%</td>
                              </tr>
                            )
                          ))}
                        </tbody>
                      </table>
                    </>
                  );
                })()}
                
                <div style={{ marginTop: '3rem' }}>
                  <h2>Shot Combinations</h2>
                  <p style={{ opacity: 0.7, marginBottom: '1rem', lineHeight: '1.5' }}>
                    Minimum body part combinations required to kill.
                  </p>
                  
                  {Object.keys(combinations).map(stkStr => {
                    const stk = parseInt(stkStr);
                    const combs = combinations[stk];
                    if (combs.length === 0) return null;
                    const fi = parseFloat(fireInterval) || 0;
                    const formatTTK = (val: number) => parseFloat(val.toFixed(2));

                    return (
                      <div key={stk} style={{ marginBottom: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>
                          {stk}{t('table.shots_suffix')} Kill
                          {fi > 0 && ` (TTK: ${formatTTK((stk - 1) * fi)} ms)`}
                        </h3>
                        {stk === maxSTK ? (
                          <p>{t('prob.consistent', stk)}</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                            {combs.map((comb, idx) => (
                              <li key={idx}>
                                {comb.parts.map(p => `${p.count}x ${t('part.' + p.name)} (${p.damage})`).join(' + ')}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {maxSTK > 0 && !combinations[maxSTK] && (
                    <div style={{ marginBottom: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>
                          {maxSTK}{t('table.shots_suffix')} Kill
                          {parseFloat(fireInterval) > 0 && ` (TTK: ${parseFloat(((maxSTK - 1) * parseFloat(fireInterval)).toFixed(2))} ms)`}
                        </h3>
                        <p>{t('prob.consistent', maxSTK)}</p>
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
                <h3 style={{ color: 'var(--accent-color)', marginTop: 0 }}>{t('prob.waiting')}</h3>
                <p style={{ opacity: 0.8 }}>{t('prob.enter_valid')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {modalState !== 'none' && (
        <div 
          className="modal-overlay" 
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setModalState('none');
            }
          }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <h2>{modalState === 'load' ? t('btn.load_build') : t('btn.save_build')}</h2>
              <button className="close-btn" onClick={() => setModalState('none')}>&times;</button>
            </div>
            
            {modalState === 'save' && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '1.2rem' }}>{t('modal.save_new')}</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    style={{ flex: 1, padding: '0.6rem', background: 'var(--input-bg)', color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '1.1rem' }}
                    value={newBuildName}
                    onChange={e => setNewBuildName(e.target.value)}
                    placeholder={t('modal.build_name')}
                  />
                  <button className="btn" onClick={handleSaveNew}>{t('btn.save_new')}</button>
                </div>
              </div>
            )}

            {modalState === 'save' && savedBuilds.length > 0 && (
              <h3 style={{ marginTop: 0, marginBottom: '0.8rem', fontSize: '1.2rem' }}>{t('modal.overwrite_existing')}</h3>
            )}
            
            <div className="modal-body" style={{ gap: '0.8rem' }}>
              {savedBuilds.length === 0 && modalState === 'load' ? (
                <p>{t('modal.no_saved')}</p>
              ) : (
                savedBuilds.map(build => (
                  <div key={build.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    backgroundColor: 'var(--card-bg)', 
                    padding: '0.8rem 1rem', 
                    borderRadius: '4px', 
                    border: '1px solid var(--border-color)',
                    flexShrink: 0
                  }}>
                    <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{build.name}</span>
                    
                    {modalState === 'load' ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleLoadBuild(build.damages, build.fireInterval)} className="btn" style={{ padding: '0.3rem 0.8rem' }}>{t('btn.load')}</button>
                        <button onClick={() => handleRenameBuild(build.id)} className="btn" style={{ padding: '0.3rem 0.8rem' }}>{t('btn.rename')}</button>
                        <button onClick={() => handleDeleteBuild(build.id)} className="btn" style={{ padding: '0.3rem 0.8rem', backgroundColor: '#d32f2f', borderColor: '#d32f2f', color: 'white' }}>{t('btn.delete')}</button>
                      </div>
                    ) : (
                      <button onClick={() => handleOverwrite(build.id)} className="btn" style={{ padding: '0.3rem 0.8rem', backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)', color: 'white' }}>{t('btn.overwrite')}</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <CustomDialog 
        config={dialogConfig} 
        onClose={() => setDialogConfig(prev => ({ ...prev, isOpen: false }))} 
        t={t}
      />
    </div>
  );
}

export default App;
