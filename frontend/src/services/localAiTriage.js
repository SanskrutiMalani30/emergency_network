/**
 * RESQMesh — On-Device AI Emergency Triage Module
 *
 * Lightweight, client-side NLP classifier running 100% locally in-browser without cloud API calls.
 * Bundled and cached for air-gapped natural disaster environments.
 *
 * Principles:
 * 1. Probabilistic triage: Classifies emergency category, urgency level, and resource requirements.
 * 2. Transparent reasoning: Explains urgency rationale in plain language.
 * 3. Humane Safety Rule: Never rejects or suppresses requests for help; marks as UNVERIFIED or NEEDS_REVIEW.
 */

export const EMERGENCY_CATEGORIES = {
  MEDICAL: 'MEDICAL',
  FLOOD_RESCUE: 'FLOOD_RESCUE',
  STRUCTURAL_COLLAPSE: 'STRUCTURAL_COLLAPSE',
  FIRE_HAZARD: 'FIRE_HAZARD',
  SUPPLY_DEFICIT: 'SUPPLY_DEFICIT',
  GENERAL: 'GENERAL'
};

export const URGENCY_LEVELS = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MODERATE: 'MODERATE',
  LOW: 'LOW'
};

export const RESOURCE_TYPES = {
  FIRST_AID: 'FIRST_AID',
  OXYGEN: 'OXYGEN',
  TRANSPORT: 'TRANSPORT',
  BOAT: 'BOAT',
  FOOD_WATER: 'FOOD_WATER',
  SEARCH_RESCUE: 'SEARCH_RESCUE',
  STRETCHER: 'STRETCHER'
};

// Tactical Vocabulary Weights
const CRITICAL_PATTERNS = [
  /\b(unconscious|not breathing|cardiac|heart attack|stroke|severe bleeding|arterial|choking)\b/i,
  /\b(drowning|submerged|swept away|chest deep|water rising fast|neck level|roof submerged)\b/i,
  /\b(building collapsed|trapped under rubble|buried alive|crushed|severe head injury)\b/i,
  /\b(infant|newborn|baby|pregnant labour|critical patient|ventilator|dialysis overdue)\b/i,
  /(बेहोश|सांस नहीं|दिल का दौरा|खून बह रहा|डूब रहे|मलबे में दबे|तातडीने|वेगाने शिरत)/i
];

const HIGH_PATTERNS = [
  /\b(insulin|diabetic|asthma|inhaler|fracture|broken bone|deep wound|burns)\b/i,
  /\b(trapped on roof|terrace|water entered house|first floor|stranded|boat needed)\b/i,
  /\b(wall collapsed|landslide blocked|fire spreading|gas leak|smoke inhalation)\b/i,
  /\b(elderly|bedridden|wheelchair|children trapped|hypothermia)\b/i,
  /(इन्सुलिन|दवा|हड्डी टूट|छत पर फंसे|नाव चाहिए|आग लगी|पुराचे पाणी)/i
];

const MODERATE_PATTERNS = [
  /\b(drinking water|ration|food|starving|dehydration|fever|infection)\b/i,
  /\b(road blocked|tree fallen|power cut|darkness|no electricity|cell tower down)\b/i,
  /\b(minor injury|sprain|bruises|cut on leg|pain relief)\b/i,
  /(पीने का पानी|राशन|बिजली गुल|रास्ता बंद|ताप|जखम)/i
];

const CATEGORY_VOCAB = {
  [EMERGENCY_CATEGORIES.MEDICAL]: [
    'insulin', 'diabetic', 'dialysis', 'asthma', 'inhaler', 'heart', 'bleeding', 'oxygen',
    'wound', 'fracture', 'medicine', 'doctor', 'medic', 'hospital', 'pain', 'fever', 'burn',
    'stroke', 'seizure', 'pregnant', 'baby', 'elderly', 'ambulance', 'औषध', 'चिकित्सा', 'डॉक्टर'
  ],
  [EMERGENCY_CATEGORIES.FLOOD_RESCUE]: [
    'flood', 'water', 'rising', 'river', 'drowning', 'boat', 'zodiac', 'submerged', 'canal',
    'terrace', 'roof', 'swimming', 'current', 'drain', 'overflow', 'बाढ़', 'पानी', 'नाव', 'पुर'
  ],
  [EMERGENCY_CATEGORIES.STRUCTURAL_COLLAPSE]: [
    'collapse', 'wall', 'rubble', 'trapped', 'building', 'ceiling', 'slab', 'debris',
    'crushed', 'landslide', 'mudslide', 'beam', 'brick', 'मलबा', 'दीवार', 'पडझड'
  ],
  [EMERGENCY_CATEGORIES.FIRE_HAZARD]: [
    'fire', 'smoke', 'gas leak', 'cylinder', 'explosion', 'burning', 'flames', 'electrocution',
    'sparking', 'transformer', 'आग', 'धुआं', 'विस्फोट'
  ],
  [EMERGENCY_CATEGORIES.SUPPLY_DEFICIT]: [
    'food', 'water', 'ration', 'drinking', 'starving', 'dehydration', 'hunger', 'milk',
    'baby food', 'potable', 'राशन', 'अन्न', 'पाणी'
  ]
};

const RESOURCE_RULES = [
  { resource: RESOURCE_TYPES.FIRST_AID, patterns: [/\b(bleeding|wound|cut|burn|injury|fracture|broken|limb|insulin|diabetic|medicine|asthma|pain|first aid)\b/i] },
  { resource: RESOURCE_TYPES.OXYGEN, patterns: [/\b(oxygen|not breathing|choking|inhaler|asthma|ventilator|smoke)\b/i] },
  { resource: RESOURCE_TYPES.BOAT, patterns: [/\b(flood|water rising|river|boat|submerged|terrace|drowning|canal|island|canoe)\b/i] },
  { resource: RESOURCE_TYPES.SEARCH_RESCUE, patterns: [/\b(trapped|rubble|collapse|debris|buried|landslide|stranded|missing|lost)\b/i] },
  { resource: RESOURCE_TYPES.TRANSPORT, patterns: [/\b(evacuate|ambulance|transport|vehicle|hospital|stretcher|carry|move|bedridden)\b/i] },
  { resource: RESOURCE_TYPES.FOOD_WATER, patterns: [/\b(water|drinking|food|ration|hunger|starving|dehydration|baby food|milk)\b/i] },
  { resource: RESOURCE_TYPES.STRETCHER, patterns: [/\b(stretcher|bedridden|unconscious|cannot walk|spine|fracture|elderly immobile)\b/i] }
];

/**
 * Executes on-device emergency triage entirely in the browser.
 * Pure, deterministic function: zero network calls.
 *
 * @param {string} text Description of the emergency
 * @param {string} userCategory Optional category selected by user
 * @param {string[]} userResources Optional resources selected by user
 * @returns {object} Triage result with category, urgency, resources, reason, and verification status
 */
export function triageEmergencyLocally(text = '', userCategory = null, userResources = []) {
  const cleanText = (text || '').trim();

  // Fallback safety if text is empty
  if (!cleanText) {
    return {
      category: userCategory || EMERGENCY_CATEGORIES.GENERAL,
      urgency: URGENCY_LEVELS.MODERATE,
      help_needed: userResources.length > 0 ? userResources : [RESOURCE_TYPES.FIRST_AID],
      reason: 'Awaiting detailed description; initial triage defaulted to moderate priority.',
      verification_status: 'NEEDS_REVIEW',
      confidence: 0.5
    };
  }

  // 1. Urgency Classification
  let urgency = URGENCY_LEVELS.MODERATE;
  let reason = 'Standard emergency distress call requiring responder attention.';
  let confidence = 0.75;

  const isCritical = CRITICAL_PATTERNS.some(pat => pat.test(cleanText));
  const isHigh = HIGH_PATTERNS.some(pat => pat.test(cleanText));
  const isModerate = MODERATE_PATTERNS.some(pat => pat.test(cleanText));

  if (isCritical) {
    urgency = URGENCY_LEVELS.CRITICAL;
    reason = 'Immediate threat to life detected: severe physiological trauma or active drowning/collapse conditions.';
    confidence = 0.92;
  } else if (isHigh) {
    urgency = URGENCY_LEVELS.HIGH;
    reason = 'Urgent assistance required: deteriorating flood water, trapped occupants, or critical prescription dependency.';
    confidence = 0.85;
  } else if (isModerate) {
    urgency = URGENCY_LEVELS.MODERATE;
    reason = 'Localized emergency requiring timely response for injuries, shelter, or utility disruption.';
    confidence = 0.80;
  } else {
    // Check text length: very short reports or vague panic need review
    if (cleanText.length < 25) {
      urgency = URGENCY_LEVELS.MODERATE;
      reason = 'Brief or unstructured alert; requires responder clarification and radio check.';
      confidence = 0.60;
    } else {
      urgency = URGENCY_LEVELS.LOW;
      reason = 'Non-immediate support request or advisory observation.';
      confidence = 0.70;
    }
  }

  // 2. Category Classification
  let detectedCategory = userCategory || EMERGENCY_CATEGORIES.GENERAL;

  if (!userCategory || userCategory === 'OTHER' || userCategory === 'GENERAL') {
    const textLower = cleanText.toLowerCase();
    let bestCat = EMERGENCY_CATEGORIES.GENERAL;
    let maxHits = 0;

    for (const [cat, words] of Object.entries(CATEGORY_VOCAB)) {
      let hits = 0;
      for (const w of words) {
        if (textLower.includes(w)) hits++;
      }
      if (hits > maxHits) {
        maxHits = hits;
        bestCat = cat;
      }
    }

    if (maxHits > 0) {
      detectedCategory = bestCat;
    }
  }

  // 3. Resource Requirements Identification
  const detectedResources = new Set(userResources || []);

  for (const rule of RESOURCE_RULES) {
    if (rule.patterns.some(p => p.test(cleanText))) {
      detectedResources.add(rule.resource);
    }
  }

  // Ensure category has intuitive default resources if none detected
  if (detectedResources.size === 0) {
    if (detectedCategory === EMERGENCY_CATEGORIES.MEDICAL) detectedResources.add(RESOURCE_TYPES.FIRST_AID);
    else if (detectedCategory === EMERGENCY_CATEGORIES.FLOOD_RESCUE) detectedResources.add(RESOURCE_TYPES.BOAT);
    else if (detectedCategory === EMERGENCY_CATEGORIES.STRUCTURAL_COLLAPSE) detectedResources.add(RESOURCE_TYPES.SEARCH_RESCUE);
    else if (detectedCategory === EMERGENCY_CATEGORIES.SUPPLY_DEFICIT) detectedResources.add(RESOURCE_TYPES.FOOD_WATER);
    else detectedResources.add(RESOURCE_TYPES.FIRST_AID);
  }

  // 4. Verification Status
  // Rule: Do not claim AI can definitively prove truth; label as UNVERIFIED or NEEDS_REVIEW
  let verification_status = 'UNVERIFIED';
  if (cleanText.length < 15 || /^(help|emergency|urgent)\s*!*$/i.test(cleanText)) {
    verification_status = 'NEEDS_REVIEW';
  }

  return {
    category: detectedCategory,
    urgency,
    help_needed: Array.from(detectedResources),
    reason,
    verification_status,
    confidence
  };
}
