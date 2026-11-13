import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CharacterModel, bodyPartsList, partConfigs } from './components/CharacterModel';
import type { PartId } from './components/CharacterModel';
import { calculateKillProbabilities, calculateCombinations } from './utils/ttkMath';
import type { BodyPartStats } from './utils/ttkMath';
import { scanDamageImageFile, DAMAGE_TABLE_PARTS, type ExtractedRange } from './utils/imageScanner';
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

type FireMode = 'auto' | 'burst';

type SavedBuild = {
  id: number;
  name: string;
  damages: Record<PartId, string>;
  fireMode?: FireMode;
  fireInterval?: string;
  burstDelay?: string;
  burstCount?: string;
  extractedRanges?: ExtractedRange[];
  selectedRangeIndex?: number;
};

function App() {
  const [health, setHealth] = useState<number>(() => {
    const saved = localStorage.getItem('currentHealth');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [mode, setMode] = useState<string>(() => {
    return localStorage.getItem('currentMode') || 'mp';
  });
  const [fireMode, setFireMode] = useState<FireMode>(() => {
    return localStorage.getItem('currentFireMode') === 'burst' ? 'burst' : 'auto';
  });
  const [fireInterval, setFireInterval] = useState<string>(() => {
    return localStorage.getItem('currentFireInterval') || '';
  });
  const [burstDelay, setBurstDelay] = useState<string>(() => {
    return localStorage.getItem('currentBurstDelay') || '';
  });
  const [burstCount, setBurstCount] = useState<string>(() => {
    return localStorage.getItem('currentBurstCount') || '';
  });
  const [missedShots, setMissedShots] = useState<number>(() => {
    const saved = localStorage.getItem('currentMissedShots');
    const parsed = saved ? parseInt(saved, 10) : 0;
    return !isNaN(parsed) && parsed >= 0 ? parsed : 0;
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

  const [extractedRanges, setExtractedRanges] = useState<ExtractedRange[]>(() => {
    const saved = localStorage.getItem('currentExtractedRanges');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number>(() => {
    const saved = localStorage.getItem('currentSelectedRangeIndex');
    const parsed = saved ? parseInt(saved, 10) : 0;
    return !isNaN(parsed) && parsed >= 0 ? parsed : 0;
  });

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save inputs
  useEffect(() => {
    localStorage.setItem('currentHealth', health.toString());
    localStorage.setItem('currentMode', mode);
    localStorage.setItem('currentFireMode', fireMode);
    localStorage.setItem('currentFireInterval', fireInterval);
    localStorage.setItem('currentBurstDelay', burstDelay);
    localStorage.setItem('currentBurstCount', burstCount);
    localStorage.setItem('currentMissedShots', missedShots.toString());
    localStorage.setItem('currentDamages', JSON.stringify(damages));
    localStorage.setItem('currentExtractedRanges', JSON.stringify(extractedRanges));
    localStorage.setItem('currentSelectedRangeIndex', selectedRangeIndex.toString());
  }, [health, mode, fireMode, fireInterval, burstDelay, burstCount, missedShots, damages, extractedRanges, selectedRangeIndex]);

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
  const [savedBuilds, setSavedBuilds] = useState<SavedBuild[]>(() => {
    const saved = localStorage.getItem('savedBuilds');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((build: SavedBuild) => ({
        ...build,
        fireMode: build.fireMode === 'burst' ? 'burst' : 'auto',
      }));
    } catch {
      return [];
    }
  });
  const [modalState, setModalState] = useState<'none' | 'load' | 'save' | 'import' | 'chart'>('none');
  const [chartCopied, setChartCopied] = useState<boolean>(false);
  const [isDraggingImage, setIsDraggingImage] = useState<boolean>(false);
  const [newBuildName, setNewBuildName] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('savedBuilds', JSON.stringify(savedBuilds));
  }, [savedBuilds]);

  const [dialogConfig, setDialogConfig] = useState<DialogConfig>({ isOpen: false, type: 'alert', message: '' });

  const handleSaveDamages = () => {
    // 1. Check if damage configuration is identical to an existing build
    const isDuplicateDamage = savedBuilds.some(build => {
      const buildFireMode = build.fireMode || 'auto';
      const sameDamages = (Object.keys(damages) as PartId[]).every(key => 
        build.damages[key] === damages[key]
      );
      if (!sameDamages || buildFireMode !== fireMode || (build.fireInterval || '') !== fireInterval) {
        return false;
      }
      if (fireMode === 'burst') {
        return (build.burstDelay || '') === burstDelay && (build.burstCount || '') === burstCount;
      }
      return true;
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
        fireMode,
        fireInterval,
        burstDelay: fireMode === 'burst' ? burstDelay : '',
        burstCount: fireMode === 'burst' ? burstCount : '',
        extractedRanges: extractedRanges.length > 0 ? extractedRanges.map(r => ({ ...r, damages: { ...r.damages } })) : undefined,
        selectedRangeIndex: extractedRanges.length > 0 ? selectedRangeIndex : undefined,
      }
    ]);
    setModalState('none');
  };

  const handleOverwrite = (id: number) => {
    setSavedBuilds(prev => prev.map(b => b.id === id ? {
      ...b,
      damages: { ...damages },
      fireMode,
      fireInterval,
      burstDelay: fireMode === 'burst' ? burstDelay : '',
      burstCount: fireMode === 'burst' ? burstCount : '',
      extractedRanges: extractedRanges.length > 0 ? extractedRanges.map(r => ({ ...r, damages: { ...r.damages } })) : undefined,
      selectedRangeIndex: extractedRanges.length > 0 ? selectedRangeIndex : undefined,
    } : b));
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

  const handleLoadBuild = (build: SavedBuild) => {
    setDamages(build.damages);
    setFireMode(build.fireMode === 'burst' ? 'burst' : 'auto');
    setFireInterval(build.fireInterval || '');
    setBurstDelay(build.burstDelay || '');
    setBurstCount(build.burstCount || '');
    if (build.extractedRanges && build.extractedRanges.length > 0) {
      setExtractedRanges(build.extractedRanges.map(r => ({ ...r, damages: { ...r.damages } })));
      setSelectedRangeIndex(
        typeof build.selectedRangeIndex === 'number' &&
          build.selectedRangeIndex >= 0 &&
          build.selectedRangeIndex < build.extractedRanges.length
          ? build.selectedRangeIndex
          : 0
      );
    } else {
      setExtractedRanges([]);
      setSelectedRangeIndex(0);
    }
    setModalState('none');
  };

  const handleDeleteBuild = (id: number) => {
    setSavedBuilds(prev => prev.filter(b => b.id !== id));
    if (savedBuilds.length <= 1) setModalState('none');
  };

  const handleClearDamages = () => {
    setDamages({ head: '', chest: '', stomach: '', upper_arm: '', lower_arm: '', leg: '' });
    setFireInterval('');
    setBurstDelay('');
    setBurstCount('');
    setExtractedRanges([]);
    setSelectedRangeIndex(0);
  };

  const handleProcessImageFile = async (file: File | Blob) => {
    setIsScanning(true);
    try {
      const result = await scanDamageImageFile(file);
      if (!result || result.ranges.length === 0) {
        setDialogConfig({
          isOpen: true,
          type: 'alert',
          message: t('alert.scan_failed'),
        });
        return;
      }
      setExtractedRanges(result.ranges);
      setSelectedRangeIndex(0);
      setDamages({ ...result.ranges[0].damages });
      setModalState('none');
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessImageFile(file);
    }
    e.target.value = '';
  };

  useEffect(() => {
    if (modalState !== 'import') return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            handleProcessImageFile(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  });

  const handleSelectRange = (idx: number) => {
    if (idx < 0 || idx >= extractedRanges.length) return;
    setSelectedRangeIndex(idx);
    setDamages({ ...extractedRanges[idx].damages });
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
      setExtractedRanges(prev => {
        if (prev.length === 0 || !prev[selectedRangeIndex]) return prev;
        return prev.map((r, i) =>
          i === selectedRangeIndex
            ? { ...r, damages: { ...r.damages, [partId]: value } }
            : r
        );
      });
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

  const fiNum = parseFloat(fireInterval);
  const bdNum = parseFloat(burstDelay);
  const bcNum = parseInt(burstCount, 10);

  const hasValidTiming = fireMode === 'auto'
    ? (!isNaN(fiNum) && fiNum > 0)
    : (!isNaN(fiNum) && fiNum > 0 && burstDelay.trim() !== '' && !isNaN(bdNum) && bdNum >= 0 && !isNaN(bcNum) && bcNum >= 2);

  const getShotsTTK = (shots: number): number => {
    if (shots <= 1) return 0;
    if (fireMode === 'auto') {
      return (shots - 1) * fiNum;
    }
    const numDelays = Math.floor((shots - 1) / bcNum);
    const numIntra = (shots - 1) - numDelays;
    return numIntra * fiNum + numDelays * bdNum;
  };

  const formatTTK = (val: number) => parseFloat(val.toFixed(2));

  const effectiveBurstRPM = (fireMode === 'burst' && hasValidTiming)
    ? Math.round((60000 * bcNum) / ((bcNum - 1) * fiNum + bdNum))
    : null;

  const getProbTierColor = (cumulProb: number): string => {
    if (cumulProb >= 99.99) return '#00e5ff'; // Cyan: 100%
    if (cumulProb >= 70) return '#00e676';    // Green: >= 70%
    if (cumulProb >= 50) return '#ffd600';    // Yellow: >= 50%
    if (cumulProb >= 20) return '#ff9100';    // Orange: >= 20%
    return '#ff4d4d';                         // Red: < 20%
  };

  const rangeChartData = useMemo(() => {
    const sourceRanges: ExtractedRange[] =
      extractedRanges.length > 0
        ? extractedRanges
        : isReady
          ? [{ rangeIndex: 1, damages }]
          : [];

    if (sourceRanges.length === 0) return [];

    return sourceRanges
      .map((r, idx) => {
        const hasEmpty = bodyPartsList.some(
          p => !r.damages[p.id] || isNaN(parseFloat(r.damages[p.id])) || parseFloat(r.damages[p.id]) <= 0
        );
        if (hasEmpty) return null;

        const inputParts: BodyPartStats[] = bodyPartsList.map(p => ({
          name: p.label,
          damage: parseFloat(r.damages[p.id]),
          probability: FIXED_PROBABILITIES[mode][p.id],
        }));

        const probs = calculateKillProbabilities(health, inputParts, 20).filter(p => p.probability > 0.01);
        const levels = probs.map(p => {
          const totalShots = p.shots + missedShots;
          let yVal = totalShots;
          if (hasValidTiming) {
            if (totalShots <= 1) {
              yVal = 0;
            } else if (fireMode === 'auto') {
              yVal = formatTTK((totalShots - 1) * fiNum);
            } else {
              const numDelays = Math.floor((totalShots - 1) / bcNum);
              const numIntra = (totalShots - 1) - numDelays;
              yVal = formatTTK(numIntra * fiNum + numDelays * bdNum);
            }
          }
          return {
            shots: totalShots,
            yVal,
            exactProb: p.probability,
            cumulProb: p.cumulativeProbability,
            color: getProbTierColor(p.cumulativeProbability),
          };
        });

        return {
          idx,
          rangeIndex: r.rangeIndex,
          from: r.from,
          to: r.to,
          levels,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null && item.levels.length > 0);
  }, [extractedRanges, isReady, damages, mode, health, missedShots, hasValidTiming, fireMode, fiNum, bdNum, bcNum]);

  const handleCopyChart = async () => {
    if (rangeChartData.length === 0) return;

    try {
      const scale = 2;
      const canvasW = 880;
      const canvasH = 540;
      const canvas = document.createElement('canvas');
      canvas.width = canvasW * scale;
      canvas.height = canvasH * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);

      const fontFamily = getComputedStyle(document.body).fontFamily || "'LF Refrigerator Deluxe', sans-serif";

      // Outer background
      ctx.fillStyle = '#181a1f';
      ctx.fillRect(0, 0, canvasW, canvasH);

      // Title
      ctx.fillStyle = '#ff9800';
      ctx.font = `700 24px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(t('title.ttk_chart'), 20, 30);

      // Legend box
      const legX = 20;
      const legY = 52;
      const legW = 840;
      const legH = 40;
      ctx.fillStyle = '#22252a';
      ctx.strokeStyle = '#333842';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(legX, legY, legW, legH, 6);
      ctx.fill();
      ctx.stroke();

      const legendItems = [
        { color: '#00e5ff', label: '100%' },
        { color: '#00e676', label: '≥ 70%' },
        { color: '#ffd600', label: '≥ 50%' },
        { color: '#ff9100', label: '≥ 20%' },
        { color: '#ff4d4d', label: '< 20%' },
      ];
      let curLegX = legX + 18;
      const legCenterY = legY + legH / 2;
      ctx.font = `700 17px ${fontFamily}`;
      for (const item of legendItems) {
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(curLegX + 6, legCenterY, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(item.label, curLegX + 18, legCenterY + 1);
        curLegX += 18 + ctx.measureText(item.label).width + 26;
      }

      // Chart container box
      const chartX = 20;
      const chartY = 104;
      const svgW = 840;
      const svgH = 416;
      ctx.fillStyle = '#121418';
      ctx.strokeStyle = '#333842';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(chartX, chartY, svgW, svgH, 8);
      ctx.fill();
      ctx.stroke();

      // Chart coordinate system inside (chartX, chartY)
      ctx.save();
      ctx.translate(chartX, chartY);

      const allYVals = rangeChartData.flatMap(d => d.levels.map(l => l.yVal));
      const uniqueYVals = Array.from(new Set(allYVals)).sort((a, b) => a - b);
      const minRaw = Math.min(...allYVals);
      const maxRaw = Math.max(...allYVals);
      const span = Math.max(hasValidTiming ? 80 : 2, maxRaw - minRaw);
      const yMin = Math.max(0, minRaw - span * 0.25);
      const yMax = maxRaw + span * 0.25;
      const yRange = Math.max(1e-6, yMax - yMin);

      const padL = 78;
      const padR = 24;
      const padT = 40;
      const padB = 68;
      const plotW = svgW - padL - padR;
      const plotH = svgH - padT - padB;
      const nCols = rangeChartData.length;
      const colW = plotW / nCols;
      const pillW = Math.min(132, colW - 10);

      const getY = (val: number) => padT + plotH - ((val - yMin) / yRange) * plotH;

      // Active range highlight
      if (extractedRanges.length > 1) {
        rangeChartData.forEach((col, ci) => {
          if (col.idx !== selectedRangeIndex) return;
          const x0 = padL + ci * colW;
          ctx.fillStyle = 'rgba(255, 152, 0, 0.08)';
          ctx.fillRect(x0, padT, colW, plotH);
        });
      }

      // Horizontal grid lines & Y-axis labels
      uniqueYVals.forEach(yv => {
        const py = getY(yv);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, py);
        ctx.lineTo(padL + plotW, py);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `700 18px ${fontFamily}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const yLabel = hasValidTiming ? `${yv}ms` : `${yv}${t('table.shots_suffix')}`;
        ctx.fillText(yLabel, padL - 10, py);
      });

      // Vertical range dividers & X-axis labels
      rangeChartData.forEach((col, ci) => {
        const x0 = padL + ci * colW;
        const x1 = x0 + colW;
        const xMid = (x0 + x1) / 2;
        const isSelected = extractedRanges.length > 1 && col.idx === selectedRangeIndex;

        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, padT);
        ctx.lineTo(x0, padT + plotH);
        ctx.stroke();

        if (ci === nCols - 1) {
          ctx.beginPath();
          ctx.moveTo(x1, padT);
          ctx.lineTo(x1, padT + plotH);
          ctx.stroke();
        }

        ctx.fillStyle = isSelected ? '#ff9800' : '#ffffff';
        ctx.font = `700 19px ${fontFamily}`;
        ctx.textAlign = 'middle' as CanvasTextAlign;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(t('range.simple', col.rangeIndex), xMid, padT + plotH + 28);

        if (col.from !== undefined && col.to !== undefined) {
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = `400 16.5px ${fontFamily}`;
          ctx.fillText(`${col.from} - ${col.to}m`, xMid, padT + plotH + 50);
        }
      });

      // Baseline
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padL, padT + plotH);
      ctx.lineTo(padL + plotW, padT + plotH);
      ctx.stroke();

      // Vertical step connectors between adjacent ranges
      rangeChartData.slice(0, -1).forEach((col, ci) => {
        const nextCol = rangeChartData[ci + 1];
        const xBound = padL + (ci + 1) * colW;
        col.levels.forEach((lvl, li) => {
          const target =
            li === col.levels.length - 1
              ? nextCol.levels[nextCol.levels.length - 1]
              : nextCol.levels.reduce(
                  (best, cand) =>
                    Math.abs(cand.cumulProb - lvl.cumulProb) < Math.abs(best.cumulProb - lvl.cumulProb)
                      ? cand
                      : best,
                  nextCol.levels[0]
                );
          if (!target) return;
          const y1 = getY(lvl.yVal);
          const y2 = getY(target.yVal);
          if (Math.abs(y1 - y2) < 0.5) return;

          ctx.save();
          ctx.strokeStyle = lvl.color;
          ctx.lineWidth = 2.2;
          ctx.globalAlpha = 0.75;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(xBound, y1);
          ctx.lineTo(xBound, y2);
          ctx.stroke();
          ctx.restore();
        });
      });

      // Horizontal TTK lines & labels per range
      rangeChartData.forEach((col, ci) => {
        const x0 = padL + ci * colW;
        const x1 = x0 + colW;
        const xMid = (x0 + x1) / 2;

        col.levels.forEach(lvl => {
          const py = getY(lvl.yVal);
          const pctStr = `${parseFloat(lvl.cumulProb.toFixed(1))}%`;
          const labelText = hasValidTiming
            ? `${lvl.yVal}ms (${pctStr})`
            : `${lvl.yVal}${t('table.shots_suffix')} (${pctStr})`;

          // Horizontal line
          ctx.strokeStyle = lvl.color;
          ctx.lineWidth = 4;
          ctx.lineCap = 'butt';
          ctx.beginPath();
          ctx.moveTo(x0, py);
          ctx.lineTo(x1, py);
          ctx.stroke();

          // Label pill
          ctx.fillStyle = 'rgba(15, 17, 21, 0.92)';
          ctx.strokeStyle = lvl.color;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.roundRect(xMid - pillW / 2, py - 33, pillW, 26, 5);
          ctx.fill();
          ctx.stroke();

          // Label text
          ctx.fillStyle = lvl.color;
          ctx.font = `700 17px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(labelText, xMid, py - 14);
        });
      });

      ctx.restore();

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);

      setChartCopied(true);
      setTimeout(() => setChartCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy chart to clipboard:', err);
    }
  };

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
              <div className="custom-select-wrapper">
                <select value={mode} onChange={handleModeChange} className="custom-select">
                  {GAME_MODES.map(m => (
                    <option key={m.id} value={m.id}>{t(m.name)}</option>
                  ))}
                </select>
                <svg className="select-arrow-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
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
              <label>{t('app.fire_mode')}</label>
              <div className="fire-mode-toggle">
                <button
                  type="button"
                  className={`fire-mode-btn ${fireMode === 'auto' ? 'active' : ''}`}
                  onClick={() => setFireMode('auto')}
                >
                  {t('mode.full_auto')}
                </button>
                <button
                  type="button"
                  className={`fire-mode-btn ${fireMode === 'burst' ? 'active' : ''}`}
                  onClick={() => setFireMode('burst')}
                >
                  {t('mode.burst')}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label>{fireMode === 'burst' ? t('app.burst_fire_interval') : t('app.fire_interval')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input 
                  type="number" 
                  value={fireInterval} 
                  onChange={(e) => setFireInterval(e.target.value)}
                  placeholder={fireMode === 'burst' ? 'e.g. 50' : 'e.g. 100'}
                  min="0"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <span style={{
                  minWidth: '90px',
                  textAlign: 'right',
                  fontSize: '1.3rem',
                  fontWeight: 'bold',
                  color: fiNum > 0 ? 'var(--accent-color)' : 'var(--text-color)',
                  opacity: fiNum > 0 ? 1 : 0.5,
                  whiteSpace: 'nowrap'
                }}>
                  {fiNum > 0 ? `${Math.round(60000 / fiNum)} RPM` : '-- RPM'}
                </span>
              </div>
            </div>

            {fireMode === 'burst' && (
              <>
                <div className="input-group">
                  <label>{t('app.burst_delay')}</label>
                  <input 
                    type="number" 
                    value={burstDelay} 
                    onChange={(e) => setBurstDelay(e.target.value)}
                    placeholder="e.g. 200"
                    min="0"
                  />
                </div>

                <div className="input-group">
                  <label>{t('app.burst_count')}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <input 
                      type="number" 
                      value={burstCount} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '' || /^\d+$/.test(val)) {
                          setBurstCount(val);
                        }
                      }}
                      placeholder="e.g. 3"
                      min="2"
                      step="1"
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <span style={{
                      minWidth: '110px',
                      textAlign: 'right',
                      fontSize: '1.3rem',
                      fontWeight: 'bold',
                      color: effectiveBurstRPM !== null ? 'var(--accent-color)' : 'var(--text-color)',
                      opacity: effectiveBurstRPM !== null ? 1 : 0.5,
                      whiteSpace: 'nowrap'
                    }}>
                      {effectiveBurstRPM !== null ? t('app.avg_rpm', effectiveBurstRPM) : t('app.avg_rpm', '--')}
                    </span>
                  </div>
                </div>
              </>
            )}

            <div className="input-group" style={{ marginBottom: 0 }}>
              <label>{t('app.missed_shots')}</label>
              <div className="counter-control">
                <button
                  type="button"
                  className="counter-btn"
                  onClick={() => setMissedShots(prev => Math.max(0, prev - 1))}
                  disabled={missedShots <= 0}
                  aria-label="Decrease missed shots"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
                <input
                  type="number"
                  className={`counter-input ${missedShots > 0 ? 'has-missed' : ''}`}
                  value={missedShots}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setMissedShots(!isNaN(parsed) && parsed >= 0 ? parsed : 0);
                  }}
                  min="0"
                  step="1"
                />
                <button
                  type="button"
                  className="counter-btn"
                  onClick={() => setMissedShots(prev => prev + 1)}
                  aria-label="Increase missed shots"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: '2rem' }}>
            <h2>{t('app.quick_actions')}</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-import-image"
                onClick={() => setModalState('import')}
                disabled={isScanning}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                {t('btn.import_image')}
              </button>
              <button className="btn" onClick={handleSaveDamages}>{t('btn.save_build')}</button>
              <button className="btn" onClick={() => setModalState('load')} disabled={savedBuilds.length === 0}>
                {t('btn.load_build')} ({savedBuilds.length})
              </button>
              <button className="btn" onClick={handleClearDamages}>{t('btn.clear_all')}</button>
            </div>
          </div>

          {extractedRanges.length > 0 && (
            <div className="panel" style={{ marginBottom: '2rem' }}>
              <h2>{t('title.damage_ranges')}</h2>
              <div className="input-group" style={{ marginBottom: '1.2rem' }}>
                <label>{t('app.select_range')}</label>
                <div className="custom-select-wrapper">
                  <select
                    value={selectedRangeIndex}
                    onChange={(e) => handleSelectRange(parseInt(e.target.value, 10))}
                    className="custom-select"
                  >
                    {extractedRanges.map((r, idx) => (
                      <option key={r.rangeIndex} value={idx}>
                        {r.from !== undefined && r.to !== undefined
                          ? t('range.with_dist', r.rangeIndex, r.from, r.to)
                          : t('range.simple', r.rangeIndex)}
                      </option>
                    ))}
                  </select>
                  <svg className="select-arrow-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
              </div>

              <div className="damage-range-table-wrapper">
                <table className="damage-range-table">
                  <thead>
                    <tr>
                      <th>{t('table.body_part')}</th>
                      {extractedRanges.map((r, idx) => {
                        const isActive = idx === selectedRangeIndex;
                        return (
                          <th
                            key={r.rangeIndex}
                            className={`range-col-header ${isActive ? 'active' : ''}`}
                            onClick={() => handleSelectRange(idx)}
                          >
                            <div className="range-col-title">{t('range.simple', r.rangeIndex)}</div>
                            {r.from !== undefined && r.to !== undefined && (
                              <div className="range-col-dist">{r.from} - {r.to}m</div>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {DAMAGE_TABLE_PARTS.map((partId, rowIdx) => {
                      const partColor = partConfigs[partId]?.color || '#ffffff';
                      return (
                        <tr key={partId}>
                          <td className="part-name-cell">
                            <span className="part-row-badge">{rowIdx + 1}</span>
                            <span style={{ color: partColor, fontWeight: 700 }}>
                              {t(`part.${partId}`)}
                            </span>
                          </td>
                          {extractedRanges.map((r, idx) => {
                            const isActive = idx === selectedRangeIndex;
                            return (
                              <td
                                key={r.rangeIndex}
                                className={`range-val-cell ${isActive ? 'active' : ''}`}
                                style={{ color: partColor }}
                                onClick={() => handleSelectRange(idx)}
                              >
                                {r.damages[partId] || '--'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                  let expectedTTK = 0;
                  if (hasValidTiming) {
                    let weightedTTKSum = 0;
                    probResults.forEach(r => {
                      weightedTTKSum += (r.probability / 100) * getShotsTTK(r.shots + missedShots);
                    });
                    const maxCumul = probResults[probResults.length - 1].cumulativeProbability / 100;
                    if (maxCumul > 0) {
                      expectedTTK = weightedTTKSum / maxCumul;
                    }
                  }

                  return (
                    <>
                      {hasValidTiming && expectedTTK > 0 && (
                        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255, 152, 0, 0.1)', border: '1px solid var(--accent-color)', borderRadius: '4px' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{t('avg.ttk')}</span>
                          <span style={{ color: 'var(--accent-color)', fontSize: '1.2rem', fontWeight: 'bold' }}>{formatTTK(expectedTTK)} ms</span>
                        </div>
                      )}
                      
                      <table className="results-table">
                        <thead>
                          <tr>
                            <th>{t('table.shots')}</th>
                            {hasValidTiming && <th>{t('table.ttk')}</th>}
                            <th>{t('table.exact')}</th>
                            <th>{t('table.cumulative')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {probResults.map(r => {
                            const totalShots = r.shots + missedShots;
                            return r.probability > 0.01 && (
                              <tr key={r.shots}>
                                <td>{totalShots}{t('table.shots_suffix')}</td>
                                {hasValidTiming && <td>{formatTTK(getShotsTTK(totalShots))} ms</td>}
                                <td>{r.probability.toFixed(2)}%</td>
                                <td>{r.cumulativeProbability.toFixed(2)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </>
                  );
                })()}

                {rangeChartData.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-show-chart"
                      onClick={() => setModalState('chart')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                      {t('btn.show_chart')}
                    </button>
                  </div>
                )}
                
                <div style={{ marginTop: '3rem' }}>
                  <h2>{t('title.shot_combinations')}</h2>
                  <p style={{ opacity: 0.7, marginBottom: '1rem', lineHeight: '1.5' }}>
                    {t('subtitle.shot_combinations')}
                  </p>
                  
                  {Object.keys(combinations).map(stkStr => {
                    const stk = parseInt(stkStr);
                    const totalStk = stk + missedShots;
                    const combs = combinations[stk];
                    if (combs.length === 0) return null;

                    const translatePartNames = (name: string) => {
                      if (name === 'ANY_PART') return t('part.any_part');
                      return name.split('/').map(n => t('part.' + n.toLowerCase().replace(' ', '_'))).join('/');
                    };

                    return (
                      <div key={stk} style={{ marginBottom: '1.5rem', backgroundColor: 'var(--card-bg)', padding: '1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <h3 style={{ color: 'var(--accent-color)', margin: '0 0 1rem 0' }}>
                          {t('prob.shots_kill', totalStk)}
                          {hasValidTiming && ` (TTK: ${formatTTK(getShotsTTK(totalStk))} ms)`}
                        </h3>
                        {stk === maxSTK ? (
                          <p>{t('prob.consistent', totalStk)}</p>
                        ) : (
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
                            {combs.map((comb, idx) => (
                              <li key={idx}>
                                {comb.parts.map(p => `${p.count}x ${translatePartNames(p.name)} (${p.damage})`).join(' + ')}
                                {missedShots > 0 && ` + ${missedShots}x ${t('part.miss')} (0)`}
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
                          {t('prob.shots_kill', maxSTK + missedShots)}
                          {hasValidTiming && ` (TTK: ${formatTTK(getShotsTTK(maxSTK + missedShots))} ms)`}
                        </h3>
                        <p>{t('prob.consistent', maxSTK + missedShots)}</p>
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
              setIsDraggingImage(false);
              setModalState('none');
            }
          }}
        >
          <div
            className="modal-content"
            style={
              modalState === 'import'
                ? { maxWidth: '460px' }
                : modalState === 'chart'
                  ? { maxWidth: '960px', width: '94%', maxHeight: '90vh' }
                  : undefined
            }
          >
            <div className="modal-header">
              <h2>
                {modalState === 'import'
                  ? t('btn.import_image')
                  : modalState === 'chart'
                    ? t('title.ttk_chart')
                    : modalState === 'load'
                      ? t('btn.load_build')
                      : t('btn.save_build')}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                {modalState === 'chart' && (
                  <button
                    type="button"
                    className={`copy-chart-btn ${chartCopied ? 'copied' : ''}`}
                    onClick={handleCopyChart}
                  >
                    {chartCopied ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        {t('btn.copied')}
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        {t('btn.copy_chart')}
                      </>
                    )}
                  </button>
                )}
                <button
                  className="close-btn"
                  onClick={() => {
                    setIsDraggingImage(false);
                    setChartCopied(false);
                    setModalState('none');
                  }}
                >
                  &times;
                </button>
              </div>
            </div>

            {modalState === 'chart' ? (
              rangeChartData.length > 0 && (() => {
                const allYVals = rangeChartData.flatMap(d => d.levels.map(l => l.yVal));
                const uniqueYVals = Array.from(new Set(allYVals)).sort((a, b) => a - b);
                const minRaw = Math.min(...allYVals);
                const maxRaw = Math.max(...allYVals);
                const span = Math.max(hasValidTiming ? 80 : 2, maxRaw - minRaw);
                const yMin = Math.max(0, minRaw - span * 0.25);
                const yMax = maxRaw + span * 0.25;
                const yRange = Math.max(1e-6, yMax - yMin);

                const svgW = 840;
                const svgH = 420;
                const padL = 78;
                const padR = 24;
                const padT = 40;
                const padB = 68;
                const plotW = svgW - padL - padR;
                const plotH = svgH - padT - padB;
                const nCols = rangeChartData.length;
                const colW = plotW / nCols;
                const pillW = Math.min(132, colW - 10);

                const getY = (val: number) => padT + plotH - ((val - yMin) / yRange) * plotH;

                return (
                  <div className="modal-body" style={{ paddingRight: 0 }}>
                    {!hasValidTiming && (
                      <div className="ttk-chart-unit-note" style={{ marginBottom: '0.8rem' }}>
                        {t('chart.enter_fire_interval')}
                      </div>
                    )}

                    <div className="ttk-chart-legend">
                      <span className="ttk-legend-item">
                        <span className="ttk-legend-dot" style={{ backgroundColor: '#00e5ff' }}></span>
                        100%
                      </span>
                      <span className="ttk-legend-item">
                        <span className="ttk-legend-dot" style={{ backgroundColor: '#00e676' }}></span>
                        &ge; 70%
                      </span>
                      <span className="ttk-legend-item">
                        <span className="ttk-legend-dot" style={{ backgroundColor: '#ffd600' }}></span>
                        &ge; 50%
                      </span>
                      <span className="ttk-legend-item">
                        <span className="ttk-legend-dot" style={{ backgroundColor: '#ff9100' }}></span>
                        &ge; 20%
                      </span>
                      <span className="ttk-legend-item">
                        <span className="ttk-legend-dot" style={{ backgroundColor: '#ff4d4d' }}></span>
                        &lt; 20%
                      </span>
                    </div>

                    <div className="ttk-chart-wrapper">
                      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="ttk-chart-svg">
                        {/* Active range highlight */}
                        {extractedRanges.length > 1 && rangeChartData.map((col, ci) => {
                          if (col.idx !== selectedRangeIndex) return null;
                          const x0 = padL + ci * colW;
                          return (
                            <rect
                              key={`active-bg-${col.rangeIndex}`}
                              x={x0}
                              y={padT}
                              width={colW}
                              height={plotH}
                              fill="rgba(255, 152, 0, 0.08)"
                            />
                          );
                        })}

                        {/* Horizontal grid lines at each unique Y value */}
                        {uniqueYVals.map(yv => {
                          const py = getY(yv);
                          return (
                            <g key={`grid-y-${yv}`}>
                              <line
                                x1={padL}
                                y1={py}
                                x2={padL + plotW}
                                y2={py}
                                stroke="rgba(255,255,255,0.12)"
                                strokeDasharray="4 4"
                                strokeWidth="1"
                              />
                              <text
                                x={padL - 10}
                                y={py + 6}
                                textAnchor="end"
                                fill="rgba(255,255,255,0.9)"
                                fontSize="18"
                                fontWeight="700"
                              >
                                {hasValidTiming ? `${yv}ms` : `${yv}${t('table.shots_suffix')}`}
                              </text>
                            </g>
                          );
                        })}

                        {/* Vertical range dividers & X-axis labels */}
                        {rangeChartData.map((col, ci) => {
                          const x0 = padL + ci * colW;
                          const x1 = x0 + colW;
                          const xMid = (x0 + x1) / 2;
                          const isSelected = extractedRanges.length > 1 && col.idx === selectedRangeIndex;

                          return (
                            <g
                              key={`col-axis-${col.rangeIndex}`}
                              style={{ cursor: extractedRanges.length > 1 ? 'pointer' : 'default' }}
                              onClick={() => {
                                if (extractedRanges.length > 1) handleSelectRange(col.idx);
                              }}
                            >
                              <line
                                x1={x0}
                                y1={padT}
                                x2={x0}
                                y2={padT + plotH}
                                stroke="rgba(255,255,255,0.18)"
                                strokeWidth="1"
                              />
                              {ci === nCols - 1 && (
                                <line
                                  x1={x1}
                                  y1={padT}
                                  x2={x1}
                                  y2={padT + plotH}
                                  stroke="rgba(255,255,255,0.18)"
                                  strokeWidth="1"
                                />
                              )}
                              <text
                                x={xMid}
                                y={padT + plotH + 28}
                                textAnchor="middle"
                                fill={isSelected ? '#ff9800' : '#ffffff'}
                                fontSize="19"
                                fontWeight="700"
                              >
                                {t('range.simple', col.rangeIndex)}
                              </text>
                              {col.from !== undefined && col.to !== undefined && (
                                <text
                                  x={xMid}
                                  y={padT + plotH + 50}
                                  textAnchor="middle"
                                  fill="rgba(255,255,255,0.75)"
                                  fontSize="16.5"
                                >
                                  {col.from} - {col.to}m
                                </text>
                              )}
                            </g>
                          );
                        })}

                        {/* Baseline */}
                        <line
                          x1={padL}
                          y1={padT + plotH}
                          x2={padL + plotW}
                          y2={padT + plotH}
                          stroke="rgba(255,255,255,0.35)"
                          strokeWidth="1.5"
                        />

                        {/* Vertical step connectors between adjacent ranges */}
                        {rangeChartData.slice(0, -1).map((col, ci) => {
                          const nextCol = rangeChartData[ci + 1];
                          const xBound = padL + (ci + 1) * colW;
                          return col.levels.map((lvl, li) => {
                            const target =
                              li === col.levels.length - 1
                                ? nextCol.levels[nextCol.levels.length - 1]
                                : nextCol.levels.reduce((best, cand) =>
                                    Math.abs(cand.cumulProb - lvl.cumulProb) < Math.abs(best.cumulProb - lvl.cumulProb)
                                      ? cand
                                      : best
                                  , nextCol.levels[0]);
                            if (!target) return null;
                            const y1 = getY(lvl.yVal);
                            const y2 = getY(target.yVal);
                            if (Math.abs(y1 - y2) < 0.5) return null;
                            return (
                              <line
                                key={`step-${ci}-${li}`}
                                x1={xBound}
                                y1={y1}
                                x2={xBound}
                                y2={y2}
                                stroke={lvl.color}
                                strokeWidth="2.2"
                                strokeDasharray="4 4"
                                opacity="0.75"
                              />
                            );
                          });
                        })}

                        {/* Horizontal TTK lines & labels per range */}
                        {rangeChartData.map((col, ci) => {
                          const x0 = padL + ci * colW;
                          const x1 = x0 + colW;
                          const xMid = (x0 + x1) / 2;

                          return col.levels.map((lvl, li) => {
                            const py = getY(lvl.yVal);
                            const pctStr = `${parseFloat(lvl.cumulProb.toFixed(1))}%`;
                            const labelText = hasValidTiming
                              ? `${lvl.yVal}ms (${pctStr})`
                              : `${lvl.yVal}${t('table.shots_suffix')} (${pctStr})`;

                            return (
                              <g
                                key={`seg-${col.rangeIndex}-${li}`}
                                style={{ cursor: extractedRanges.length > 1 ? 'pointer' : 'default' }}
                                onClick={() => {
                                  if (extractedRanges.length > 1) handleSelectRange(col.idx);
                                }}
                              >
                                <line
                                  x1={x0}
                                  y1={py}
                                  x2={x1}
                                  y2={py}
                                  stroke={lvl.color}
                                  strokeWidth="4"
                                />
                                <rect
                                  x={xMid - pillW / 2}
                                  y={py - 33}
                                  width={pillW}
                                  height="26"
                                  rx="5"
                                  fill="rgba(15, 17, 21, 0.92)"
                                  stroke={lvl.color}
                                  strokeWidth="1.3"
                                />
                                <text
                                  x={xMid}
                                  y={py - 14}
                                  textAnchor="middle"
                                  fill={lvl.color}
                                  fontSize="17"
                                  fontWeight="700"
                                >
                                  {labelText}
                                </text>
                              </g>
                            );
                          });
                        })}
                      </svg>
                    </div>
                  </div>
                );
              })()
            ) : modalState === 'import' ? (
              <>
                <div className="import-warning-box">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="import-warning-icon">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <span>{t('import.warning_crosshair')}</span>
                </div>
                <div
                  className={`import-dropzone ${isDraggingImage ? 'dragging' : ''}`}
                  onClick={() => {
                    if (!isScanning) fileInputRef.current?.click();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingImage(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isDraggingImage) setIsDraggingImage(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setIsDraggingImage(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingImage(false);
                    if (isScanning) return;
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      handleProcessImageFile(file);
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="import-dropzone-icon">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <p className="import-dropzone-title">
                    {isScanning ? t('btn.scanning') : t('import.drop_or_paste')}
                  </p>
                  {!isScanning && (
                    <p className="import-dropzone-sub">
                      {t('import.click_to_browse')}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
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
                            <button onClick={() => handleLoadBuild(build)} className="btn" style={{ padding: '0.3rem 0.8rem' }}>{t('btn.load')}</button>
                            <button onClick={() => handleRenameBuild(build.id)} className="btn" style={{ padding: '0.3rem 0.8rem' }}>{t('btn.rename')}</button>
                            <button onClick={() => handleDeleteBuild(build.id)} className="btn" style={{ padding: '0.3rem 0.8rem', backgroundColor: '#d32f2f', borderColor: '#d32f2f', color: 'white' }}>{t('btn.delete')}</button>
                          </div>
                        ) : (
                          <button onClick={() => handleOverwrite(build.id)} className="btn" style={{ padding: '0.3rem 0.8rem', backgroundColor: 'var(--accent-color)', borderColor: 'var(--accent-color)', color: 'var(--accent-text-color)' }}>{t('btn.overwrite')}</button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
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
