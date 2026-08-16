import React, { useState, useMemo } from 'react';
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
  const [health, setHealth] = useState<number>(100);
  const [mode, setMode] = useState<string>('mp');
  
  const [damages, setDamages] = useState<Record<PartId, string>>({
    head: '',
    chest: '',
    stomach: '',
    upper_arm: '',
    lower_arm: '',
    leg: '',
  });

  const [activePart, setActivePart] = useState<PartId | null>(null);

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
      <header className="header">
        <h1>CODM STK RATIO</h1>
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
                  <p style={{ color: '#aaa', marginBottom: '1rem', lineHeight: '1.5' }}>
                    Minimum body part combinations required to kill.
                  </p>
                  
                  {Object.keys(combinations).map(stkStr => {
                    const stk = parseInt(stkStr);
                    const combs = combinations[stk];
                    if (combs.length === 0) return null;

                    return (
                      <div key={stk} style={{ marginBottom: '1.5rem', backgroundColor: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}>
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
                    <div style={{ marginBottom: '1.5rem', backgroundColor: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}>
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
                <p style={{ color: '#ddd' }}>Please enter valid damage values for all body parts to view the analysis.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
