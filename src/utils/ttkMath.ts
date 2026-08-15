export interface BodyPartStats {
  name: string;
  damage: number;
  probability: number; // 0 to 100
}

export interface KillProbabilityResult {
  shots: number;
  probability: number; // 0 to 100
  cumulativeProbability: number; // 0 to 100
}

export interface KillCombination {
  shots: number;
  parts: { name: string; count: number; damage: number }[];
}

export function calculateKillProbabilities(
  health: number,
  bodyParts: BodyPartStats[],
  maxShots: number = 20
): KillProbabilityResult[] {
  // Normalize probabilities to sum to 1
  const totalProb = bodyParts.reduce((sum, part) => sum + part.probability, 0);
  if (totalProb === 0) return [];

  const parts = bodyParts.map(p => ({
    damage: Math.floor(p.damage),
    prob: p.probability / totalProb
  })).filter(p => p.damage > 0);

  if (parts.length === 0) return [];

  let currentDp = new Map<number, number>();
  currentDp.set(0, 1.0); 

  const results: KillProbabilityResult[] = [];
  let cumulative = 0;

  for (let n = 1; n <= maxShots; n++) {
    const nextDp = new Map<number, number>();
    let probKilledThisShot = 0;

    for (const [dmg, prob] of currentDp.entries()) {
      if (dmg >= health) continue;

      for (const part of parts) {
        const newDmg = dmg + part.damage;
        const transitionProb = prob * part.prob;

        if (newDmg >= health) {
          probKilledThisShot += transitionProb;
        } else {
          nextDp.set(newDmg, (nextDp.get(newDmg) || 0) + transitionProb);
        }
      }
    }

    cumulative += probKilledThisShot;
    results.push({
      shots: n,
      probability: probKilledThisShot * 100,
      cumulativeProbability: cumulative * 100
    });

    currentDp = nextDp;

    if (cumulative >= 0.9999) {
      break;
    }
  }

  return results;
}

function getLabelForDamage(reqDmg: number, uniqueDamages: number[], dmgGroups: Map<number, string[]>): string {
  let applicableParts: string[] = [];
  
  for (const dmg of uniqueDamages) {
    if (dmg >= reqDmg) {
      applicableParts.push(...dmgGroups.get(dmg)!);
    }
  }

  applicableParts = Array.from(new Set(applicableParts));
  
  const hasHead = applicableParts.includes('Head');
  
  if (applicableParts.length > 1 && hasHead) {
    applicableParts = applicableParts.filter(p => p !== 'Head');
  }

  // Total non-head parts is 5 (Chest, Stomach, Upper Arm, Lower Arm, Leg)
  if (applicableParts.length === 5) {
    return 'Any Part';
  }

  return applicableParts.join('/');
}

export function calculateCombinations(health: number, bodyParts: BodyPartStats[]): Record<number, KillCombination[]> {
  // Group by damage to reduce duplicates (e.g. if Stomach and Arms have same damage, treat as one)
  const dmgGroups = new Map<number, string[]>();
  for (const part of bodyParts) {
    const dmg = Math.floor(part.damage);
    if (dmg <= 0) continue;
    if (!dmgGroups.has(dmg)) dmgGroups.set(dmg, []);
    dmgGroups.get(dmg)!.push(part.name);
  }

  // Sort damages descending
  const uniqueDamages = Array.from(dmgGroups.keys()).sort((a, b) => b - a);
  const minDamage = uniqueDamages[uniqueDamages.length - 1];
  
  if (!minDamage) return {};

  const maxShots = Math.ceil(health / minDamage);
  const combinations: Record<number, KillCombination[]> = {};

  const findCombs = (
    index: number,
    currentCount: number,
    currentSum: number,
    currentCombination: { dmg: number; count: number }[]
  ) => {
    // If we've reached or exceeded health
    if (currentSum >= health) {
      
      // The condition for a "minimal" kill combination: removing the smallest shot does NOT kill
      const minDmgInComb = currentCombination[currentCombination.length - 1].dmg;
      
      if (currentSum - minDmgInComb < health) {
        
        // Ensure it is a "boundary" combination: 
        // Lowering ANY single shot to the NEXT available lower damage tier must drop the sum below health.
        // If it doesn't, this combination is redundant (a strictly better version of another valid combination).
        let isBoundary = true;
        
        for (let i = 0; i < currentCombination.length; i++) {
          const dmg = currentCombination[i].dmg;
          const nextSmallerIndex = uniqueDamages.indexOf(dmg) + 1;
          
          if (nextSmallerIndex < uniqueDamages.length) {
            const lowerDmg = uniqueDamages[nextSmallerIndex];
            const downgradedSum = currentSum - dmg + lowerDmg;
            
            if (downgradedSum >= health) {
              isBoundary = false;
              break;
            }
          }
        }

        if (isBoundary) {
          if (!combinations[currentCount]) combinations[currentCount] = [];
          
          combinations[currentCount].push({
            shots: currentCount,
            parts: currentCombination.map(c => ({
              damage: c.dmg,
              count: c.count,
              name: getLabelForDamage(c.dmg, uniqueDamages, dmgGroups)
            }))
          });
        }
      }
      return;
    }

    if (index >= uniqueDamages.length || currentCount >= maxShots) return;

    const dmg = uniqueDamages[index];
    // Max times we could potentially pick this damage
    const maxPicks = Math.ceil((health - currentSum) / dmg);

    for (let count = maxPicks; count >= 0; count--) {
      if (count > 0) {
        currentCombination.push({ dmg, count });
      }
      
      findCombs(index + 1, currentCount + count, currentSum + (dmg * count), currentCombination);
      
      if (count > 0) {
        currentCombination.pop();
      }
    }
  };

  findCombs(0, 0, 0, []);

  // Post-processing: If a specific STK has combinations that DO NOT require a strict Headshot,
  // hide the combinations that DO require a strict Headshot for that same STK.
  for (const stkStr in combinations) {
    const stk = parseInt(stkStr);
    const combs = combinations[stk];
    
    // A strict headshot is a part that is exactly "Head" (no other body part shares this damage)
    const hasNonHeadshotComb = combs.some(comb => 
      !comb.parts.some(p => p.name === 'Head')
    );
    
    if (hasNonHeadshotComb) {
      combinations[stk] = combs.filter(comb => 
        !comb.parts.some(p => p.name === 'Head')
      );
    }
  }

  return combinations;
}
