// Normes environnementales pour les zones minières
// OMS (Organisation Mondiale de la Santé), AFC (Afrique), Sénégal

const STANDARDS = [
  // 💧 Eau
  { 
    parametre: "Arsenic", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.01, "AFC": 0.01, "Sénégal": 0.01 } 
  },
  { 
    parametre: "Mercure", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.006, "AFC": 0.005, "Sénégal": 0.006 } 
  },
  { 
    parametre: "Cyanures", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.07, "AFC": 0.07, "Sénégal": 0.07 } 
  },
  { 
    parametre: "Plomb", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.01, "AFC": 0.01, "Sénégal": 0.01 } 
  },
  { 
    parametre: "Cadmium", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.003, "AFC": 0.003, "Sénégal": 0.003 } 
  },
  { 
    parametre: "Chrome", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.05, "AFC": 0.05, "Sénégal": 0.05 } 
  },
  { 
    parametre: "Nickel", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 0.07, "AFC": 0.07, "Sénégal": 0.07 } 
  },
  { 
    parametre: "Zinc", 
    unite: "mg/L", 
    type: "Eau", 
    sources: { "OMS": 3, "AFC": 3, "Sénégal": 3 } 
  },

  // 🌬️ Air
  { 
    parametre: "PM2.5", 
    unite: "µg/m³", 
    type: "Air", 
    sources: { "OMS": 25, "AFC": 25, "Sénégal": 25 } 
  },
  { 
    parametre: "PM10", 
    unite: "µg/m³", 
    type: "Air", 
    sources: { "OMS": 50, "AFC": 50, "Sénégal": 50 } 
  },
  { 
    parametre: "SO2", 
    unite: "µg/m³", 
    type: "Air", 
    sources: { "OMS": 20, "AFC": 20, "Sénégal": 20 } 
  },
  { 
    parametre: "NO2", 
    unite: "µg/m³", 
    type: "Air", 
    sources: { "OMS": 40, "AFC": 40, "Sénégal": 40 } 
  },
  { 
    parametre: "CO", 
    unite: "mg/m³", 
    type: "Air", 
    sources: { "OMS": 10, "AFC": 10, "Sénégal": 10 } 
  },
  { 
    parametre: "O3", 
    unite: "µg/m³", 
    type: "Air", 
    sources: { "OMS": 100, "AFC": 100, "Sénégal": 100 } 
  },

  // 🌍 Sol
  { 
    parametre: "Plomb (sol)", 
    unite: "mg/kg", 
    type: "Sol", 
    sources: { "OMS": 70, "AFC": 70, "Sénégal": 70 } 
  },
  { 
    parametre: "Cadmium (sol)", 
    unite: "mg/kg", 
    type: "Sol", 
    sources: { "OMS": 3, "AFC": 3, "Sénégal": 3 } 
  },
  { 
    parametre: "Mercure (sol)", 
    unite: "mg/kg", 
    type: "Sol", 
    sources: { "OMS": 2, "AFC": 2, "Sénégal": 2 } 
  },
  { 
    parametre: "Arsenic (sol)", 
    unite: "mg/kg", 
    type: "Sol", 
    sources: { "OMS": 20, "AFC": 20, "Sénégal": 20 } 
  },
  { 
    parametre: "Chrome (sol)", 
    unite: "mg/kg", 
    type: "Sol", 
    sources: { "OMS": 100, "AFC": 100, "Sénégal": 100 } 
  },
  { 
    parametre: "Nickel (sol)", 
    unite: "mg/kg", 
    type: "Sol", 
    sources: { "OMS": 50, "AFC": 50, "Sénégal": 50 } 
  },

  // ♻️ Déchets
  { 
    parametre: "Hydrocarbures totaux", 
    unite: "mg/kg", 
    type: "Déchets", 
    sources: { "OMS": 500, "AFC": 500, "Sénégal": 500 } 
  },
  { 
    parametre: "Métaux lourds totaux", 
    unite: "mg/kg", 
    type: "Déchets", 
    sources: { "OMS": 100, "AFC": 100, "Sénégal": 100 } 
  },
  { 
    parametre: "PCB", 
    unite: "mg/kg", 
    type: "Déchets", 
    sources: { "OMS": 0.1, "AFC": 0.1, "Sénégal": 0.1 } 
  },

  // 🔊 Bruit
  { 
    parametre: "Bruit (jour résidentiel)", 
    unite: "dB(A)", 
    type: "Bruit", 
    sources: { "OMS": 55, "AFC": 55, "Sénégal": 55 } 
  },
  { 
    parametre: "Bruit (nuit résidentiel)", 
    unite: "dB(A)", 
    type: "Bruit", 
    sources: { "OMS": 45, "AFC": 45, "Sénégal": 45 } 
  },
  { 
    parametre: "Bruit (zone industrielle)", 
    unite: "dB(A)", 
    type: "Bruit", 
    sources: { "OMS": 70, "AFC": 70, "Sénégal": 70 } 
  },
  { 
    parametre: "Bruit (zone commerciale)", 
    unite: "dB(A)", 
    type: "Bruit", 
    sources: { "OMS": 65, "AFC": 65, "Sénégal": 65 } 
  }
];

// Fonction pour obtenir les normes d'un paramètre
function getStandardsForParameter(parametre) {
  return STANDARDS.find(standard => standard.parametre === parametre);
}

// Fonction pour obtenir tous les paramètres d'un type
function getParametersByType(type) {
  return STANDARDS.filter(standard => standard.type === type);
}

// Fonction pour obtenir tous les types disponibles
function getAllTypes() {
  return [...new Set(STANDARDS.map(standard => standard.type))];
}
