import React, { useState, useMemo, useEffect, useRef } from 'react';
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
    const saved = localStorage.getItem('locale') as Locale;
    return (saved && translations[saved]) ? saved : 'en';
  });

  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-lang', locale);
    localStorage.setItem('locale', locale);
  }, [locale]);

  const t = (key: string, ...args: (string | number)[]) => {
    const dict = translations[locale] || translations['en'];
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
          <div ref={langRef} style={{ position: 'relative' }}>
            <button 
              onClick={() => setLangOpen(!langOpen)}
              style={{
                background: 'transparent',
                color: 'var(--text-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '0.4rem 0.8rem',
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '1rem'
              }}
            >
              <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><circle cx='12' cy='12' r='10'></circle><line x1='2' y1='12' x2='22' y2='12'></line><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'></path></svg>
              {languageNames[locale]}
            </button>
            {langOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '0.5rem',
                background: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 100,
                minWidth: '150px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                {Object.entries(languageNames).map(([code, name]) => {
                  const flags: Record<string, string> = {
                    en: 'gb', vi: 'vn', th: 'th', zh: 'cn', ja: 'jp', ko: 'kr',
                    es: 'es', pt: 'pt', ms: 'my', id: 'id', hi: 'in'
                  };
                  return (
                    <button
                      key={code}
                      onClick={() => { setLocale(code as Locale); setLangOpen(false); }}
                      style={{
                        background: code === locale ? 'var(--card-bg)' : 'transparent',
                        color: 'var(--text-color)',
                        border: 'none',
                        padding: '0.6rem 1rem',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.8rem'
                      }}
                      onMouseOver={e => e.currentTarget.style.background = 'var(--card-bg)'}
                      onMouseOut={e => e.currentTarget.style.background = code === locale ? 'var(--card-bg)' : 'transparent'}
                    >
                      <img src={`https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/4.1.4/flags/4x3/${flags[code]}.svg`} alt={code} style={{ width: '20px', height: '15px', objectFit: 'cover', borderRadius: '2px' }} />
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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
                  <h2>{t('title.shot_combinations')}</h2>
                  <p style={{ opacity: 0.7, marginBottom: '1rem', lineHeight: '1.5' }}>
                    {t('subtitle.shot_combinations')}
                  </p>
                  
                  {Object.keys(combinations).map(stkStr => {
                    const stk = parseInt(stkStr);
                    const combs = combinations[stk];
                    if (combs.length === 0) return null;
                    const fi = parseFloat(fireInterval) || 0;
                    const formatTTK = (val: number) => parseFloat(val.toFixed(2));

                    const translatePartNames = (name: string) => {
                      if (name === 'Any Part') return t('part.any_part');
                      return name.split('/').map(n => t('part.' + n.toLowerCase().replace(' ', '_'))).join('/');
                    };

                    return (
                      <div key={stk} style={{ marginBottom: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>
                          {t('prob.shots_kill', stk)}
                          {fi > 0 && ` (TTK: ${formatTTK((stk - 1) * fi)} ms)`}
                        </h3>
                        {stk === maxSTK ? (
                          <p>{t('prob.consistent', stk)}</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                            {combs.map((comb, idx) => (
                              <li key={idx}>
                                {comb.parts.map(p => `${p.count}x ${translatePartNames(p.name)} (${p.damage})`).join(' + ')}
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
                          {t('prob.shots_kill', maxSTK)}
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

      <footer className="footer">
        <div className="contact-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
          </svg>
          <span className="contact-text">__tokisaki__kurumi__</span>
        </div>
        <div className="contact-item">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
          </svg>
          <span className="contact-text">@ckcbng</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
