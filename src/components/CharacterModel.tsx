import React from 'react';

export type PartId = 'head' | 'chest' | 'stomach' | 'upper_arm' | 'lower_arm' | 'leg';

export const bodyPartsList: { id: PartId; src: string; label: string }[] = [
  { id: 'head', src: `${import.meta.env.BASE_URL}image/bodyparts/head.png`, label: 'Head' },
  { id: 'chest', src: `${import.meta.env.BASE_URL}image/bodyparts/chest.png`, label: 'Chest' },
  { id: 'stomach', src: `${import.meta.env.BASE_URL}image/bodyparts/stomach.png`, label: 'Stomach' },
  { id: 'upper_arm', src: `${import.meta.env.BASE_URL}image/bodyparts/upper_arm.png`, label: 'Upper Arm' },
  { id: 'lower_arm', src: `${import.meta.env.BASE_URL}image/bodyparts/lower_arm.png`, label: 'Lower Arm' },
  { id: 'leg', src: `${import.meta.env.BASE_URL}image/bodyparts/leg.png`, label: 'Leg' },
];

// All coordinates are relative to the central image wrapper (1207x1303)
export const partConfigs: Record<PartId, any> = {
  head: {
    color: '#FF0000',
    inputBox: { right: '102%', top: '10%' },
    lineStart: { x: '0%', y: '10%' }, 
    target: { x: '50%', y: '13.13%' }
  },
  chest: {
    color: '#FF6A00',
    inputBox: { right: '102%', top: '45%' },
    lineStart: { x: '0%', y: '45%' },
    target: { x: '49.86%', y: '40.14%' }
  },
  stomach: {
    color: '#FFD800',
    inputBox: { right: '102%', top: '80%' },
    lineStart: { x: '0%', y: '80%' },
    target: { x: '49.78%', y: '64.94%' }
  },
  upper_arm: {
    color: '#4CFF00',
    inputBox: { left: '102%', top: '20%' },
    lineStart: { x: '100%', y: '20%' },
    target: { x: '74%', y: '43.52%' } // Target right upper arm
  },
  lower_arm: {
    color: '#0094FF',
    inputBox: { left: '102%', top: '50%' },
    lineStart: { x: '100%', y: '50%' },
    target: { x: '79%', y: '73.47%' } // Target right lower arm
  },
  leg: {
    color: '#B200FF',
    inputBox: { left: '102%', top: '80%' },
    lineStart: { x: '100%', y: '80%' },
    target: { x: '58%', y: '85.74%' } // Target right leg
  }
};

interface CharacterModelProps {
  damages: Record<PartId, string>;
  onDamageChange: (part: PartId, value: string) => void;
  activePart: PartId | null;
  onPartClick: (part: PartId) => void;
}

export const CharacterModel: React.FC<CharacterModelProps> = ({ 
  damages, 
  onDamageChange,
  activePart,
  onPartClick
}) => {
  return (
    <div className="model-layout-container">
      <div className="character-images-wrapper">
        
        {/* SVG Lines */}
        <svg className="connections-svg" style={{ overflow: 'visible' }}>
          {bodyPartsList.map(part => {
            const config = partConfigs[part.id];
            const isActive = activePart === part.id;
            return (
              <g key={`line-${part.id}`}>
                <line 
                  x1={config.lineStart.x} 
                  y1={config.lineStart.y} 
                  x2={config.target.x} 
                  y2={config.target.y} 
                  stroke={isActive ? config.color : 'var(--line-inactive)'} 
                  strokeWidth={isActive ? 3 : 1}
                  strokeDasharray={isActive ? "none" : "5,5"}
                  className="connection-line"
                />
                <circle 
                  cx={config.target.x} 
                  cy={config.target.y} 
                  r={isActive ? 6 : 4} 
                  fill={isActive ? config.color : 'var(--line-inactive)'} 
                />
              </g>
            );
          })}
        </svg>

        {/* Input Boxes */}
        {bodyPartsList.map(part => {
          const config = partConfigs[part.id];
          const isActive = activePart === part.id;
          return (
            <div 
              key={`input-${part.id}`}
              className={`floating-input-box ${isActive ? 'active' : ''}`}
              style={{ 
                left: config.inputBox.left,
                right: config.inputBox.right,
                top: config.inputBox.top,
                borderColor: isActive ? config.color : '#444',
                boxShadow: isActive ? `0 0 10px ${config.color}40` : 'none'
              }}
              onClick={() => onPartClick(part.id)}
            >
              <div className="part-label" style={{ color: config.color }}>{part.label}</div>
              <input 
                type="number"
                value={damages[part.id] || ''}
                onChange={(e) => {
                  onDamageChange(part.id, e.target.value);
                  onPartClick(part.id); // keep active
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          );
        })}

        {/* Character Images */}
        <img src={`${import.meta.env.BASE_URL}image/bodyparts/full body.png`} alt="Base" className="body-part-img base-img" />
        
        {bodyPartsList.map(part => {
          const isActive = activePart === part.id;
          return (
            <div key={`img-${part.id}`} className="part-img-container" onClick={() => onPartClick(part.id)}>
              <img 
                src={part.src} 
                alt={part.label} 
                className="body-part-img"
                style={{
                  filter: isActive ? 'drop-shadow(0 0 8px rgba(255,255,255,0.8)) brightness(1.2)' : 'none',
                  zIndex: isActive ? 10 : 2
                }} 
              />
            </div>
          );
        })}

      </div>
    </div>
  );
};
