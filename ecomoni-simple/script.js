// EcoMoni - Script principal
// Gestion des données, alertes, export/import, carte
// Backend optionnel: Netlify Function + GitHub (fallback localStorage)

const REMOTE_ENDPOINT = '/api/github-db';
let useRemoteStore = true; // bascule automatique après test
const REQUIRE_REMOTE = true; // impose GitHub comme source unique (pas d'écriture locale)

function initRemoteStore() {
  // Teste l'endpoint et remplit le cache local en arrière-plan
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 3500);
  fetch(REMOTE_ENDPOINT, { method: 'GET', signal: ctrl.signal })
    .then(res => {
      clearTimeout(id);
      if (!res.ok) throw new Error('endpoint indisponible');
      useRemoteStore = true;
      return res.json();
    })
    .then(json => {
      const data = Array.isArray(json?.data) ? json.data : [];
      if (data.length) {
        localStorage.setItem('ecomoni_echantillons', JSON.stringify(data));
      }
    })
    .catch(() => {
      useRemoteStore = false;
    });
}

function syncRemoteEchantillons(echantillons) {
  if (!useRemoteStore) return;
  try {
    fetch(REMOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(echantillons)
    }).catch(() => {});
  } catch (_) {}
}

// Réactive la synchronisation distante au chargement
document.addEventListener('DOMContentLoaded', function () {
  try { initRemoteStore(); } catch (_) {}
});

// Ré-synchronise régulièrement (toutes les 60s)
try {
  setInterval(() => { try { initRemoteStore(); } catch (_) {} }, 60000);
} catch (_) {}

// ===== GESTION DES ÉCHANTILLONS =====

function ajouterEchantillon(sample) {
  try {
    // Validation des données
    if (!sample.parametre || !sample.valeur || !sample.unite || !sample.latitude || !sample.longitude) {
      throw new Error('Tous les champs sont obligatoires');
    }

    // Ajouter un ID unique et la date
    sample.id = Date.now().toString();
    sample.date = new Date().toISOString();
    sample.timestamp = Date.now();

    // Récupérer les échantillons existants
    let echantillons = chargerEchantillons();
    
    // Ajouter le nouvel échantillon
    echantillons.push(sample);
    
    // Écriture: priorité au distant pour garantir la même base pour tous
    if (useRemoteStore) {
      try {
        // tente le POST synchronisant l'ensemble
        const xhr = new XMLHttpRequest();
        xhr.open('POST', REMOTE_ENDPOINT, false); // synchro pour garantir le résultat
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(echantillons));
        if (xhr.status < 200 || xhr.status >= 300) {
          if (REQUIRE_REMOTE) throw new Error('API distante indisponible');
          // fallback local autorisé seulement si REQUIRE_REMOTE = false
          localStorage.setItem('ecomoni_echantillons', JSON.stringify(echantillons));
        } else {
          // succès → met à jour cache local
          localStorage.setItem('ecomoni_echantillons', JSON.stringify(echantillons));
        }
      } catch (e) {
        if (REQUIRE_REMOTE) throw e;
        localStorage.setItem('ecomoni_echantillons', JSON.stringify(echantillons));
      }
    } else {
      if (REQUIRE_REMOTE) {
        throw new Error('API distante non configurée');
      }
      // mode local autorisé seulement si REQUIRE_REMOTE = false
      localStorage.setItem('ecomoni_echantillons', JSON.stringify(echantillons));
      syncRemoteEchantillons(echantillons);
    }
    
    // Générer les alertes si nécessaire
    genererAlertesPourEchantillon(sample);
    
    return { success: true, message: 'Échantillon ajouté avec succès' };
  } catch (error) {
    const msg = (error && error.message) ? error.message : "Enregistrement impossible. Vérifiez l'API / les variables Netlify.";
    return { success: false, message: msg };
  }
}

function chargerEchantillons() {
  // Mode strict: cache-first (rapide), puis refresh async via initRemoteStore()
  try {
    const cached = localStorage.getItem('ecomoni_echantillons');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (_) {}

  if (REQUIRE_REMOTE) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', REMOTE_ENDPOINT, false);
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        const json = JSON.parse(xhr.responseText || '{}');
        const data = Array.isArray(json.data) ? json.data : [];
        localStorage.setItem('ecomoni_echantillons', JSON.stringify(data));
        return data;
      }
      throw new Error('API distante indisponible');
    } catch (e) {
      console.error('Lecture distante échouée:', e);
      return [];
    }
  }

  try {
    const echantillons = localStorage.getItem('ecomoni_echantillons');
    return echantillons ? JSON.parse(echantillons) : [];
  } catch (error) {
    console.error('Erreur lors du chargement des échantillons:', error);
    return [];
  }
}

// Recalcule les alertes à partir des échantillons (sans persister en local)
function calculerAlertesDepuisEchantillons(echantillons) {
  const alertes = [];
  echantillons.forEach(sample => {
    const standards = getStandardsForParameter(sample.parametre);
    if (!standards) return;
    Object.keys(standards.sources).forEach(norme => {
      const seuil = standards.sources[norme];
      const valeur = parseFloat(sample.valeur);
      if (valeur > seuil) {
        const gravite = determinerGravite(valeur, seuil);
        alertes.push({
          id: `${sample.id || (sample.timestamp || Date.now())}_${norme}`,
          echantillonId: sample.id,
          parametre: sample.parametre,
          valeur: sample.valeur,
          unite: sample.unite,
          norme: norme,
          seuil: seuil,
          date: sample.date,
          gravite: gravite,
          latitude: sample.latitude,
          longitude: sample.longitude
        });
      }
    });
  });
  return alertes;
}

function filtrerEchantillons(type, parametre, dateRange) {
  let echantillons = chargerEchantillons();
  
  // Filtrer par type
  if (type && type !== 'Tous') {
    echantillons = echantillons.filter(e => e.type === type);
  }
  
  // Filtrer par paramètre
  if (parametre && parametre !== 'Tous') {
    echantillons = echantillons.filter(e => e.parametre === parametre);
  }
  
  // Filtrer par période
  if (dateRange && dateRange.debut && dateRange.fin) {
    const debut = new Date(dateRange.debut);
    const fin = new Date(dateRange.fin);
    echantillons = echantillons.filter(e => {
      const dateEchantillon = new Date(e.date);
      return dateEchantillon >= debut && dateEchantillon <= fin;
    });
  }
  
  return echantillons;
}

// ===== GESTION DES ALERTES =====

function genererAlertesPourEchantillon(sample) {
  const standards = getStandardsForParameter(sample.parametre);
  if (!standards) return;

  const alertes = [];
  
  // Comparer avec chaque norme
  Object.keys(standards.sources).forEach(norme => {
    const seuil = standards.sources[norme];
    const valeur = parseFloat(sample.valeur);
    
    if (valeur > seuil) {
      const gravite = determinerGravite(valeur, seuil);
      const alerte = {
        id: Date.now().toString() + '_' + norme,
        echantillonId: sample.id,
        parametre: sample.parametre,
        valeur: sample.valeur,
        unite: sample.unite,
        norme: norme,
        seuil: seuil,
        date: sample.date,
        gravite: gravite,
        latitude: sample.latitude,
        longitude: sample.longitude
      };
      alertes.push(alerte);
    }
  });
  
  // Sauvegarder les alertes
  if (alertes.length > 0) {
    let toutesAlertes = chargerAlertes();
    toutesAlertes.push(...alertes);
    localStorage.setItem('ecomoni_alertes', JSON.stringify(toutesAlertes));
  }
}

function determinerGravite(valeur, seuil) {
  const ratio = valeur / seuil;
  if (ratio >= 2) return 'critique';
  if (ratio >= 1.5) return 'avertissement';
  return 'conforme';
}

function chargerAlertes() {
  // Toujours baser les alertes sur l’état courant des échantillons (GitHub)
  const echantillons = chargerEchantillons();
  return calculerAlertesDepuisEchantillons(echantillons);
}

// Export Excel pour les alertes
function exporterAlertesExcel() {
  const alertes = chargerAlertes();
  if (alertes.length === 0) {
    alert('Aucune alerte à exporter');
    return;
  }
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <style>
        table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #1e3c72; color: white; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>⚠️ Alertes EcoMonitoring</h1>
      <table>
        <tr>
          <th>Paramètre</th>
          <th>Valeur</th>
          <th>Unité</th>
          <th>Norme</th>
          <th>Seuil</th>
          <th>Gravité</th>
          <th>Date</th>
          <th>Latitude</th>
          <th>Longitude</th>
        </tr>`;
  alertes.forEach(a => {
    html += `
      <tr>
        <td>${a.parametre}</td>
        <td>${a.valeur}</td>
        <td>${a.unite}</td>
        <td>${a.norme}</td>
        <td>${a.seuil}</td>
        <td>${a.gravite}</td>
        <td>${formaterDate(a.date)}</td>
        <td>${a.latitude}</td>
        <td>${a.longitude}</td>
      </tr>`;
  });
  html += `</table></body></html>`;
  telechargerFichier(html, `alertes_rapport_${new Date().toISOString().split('T')[0]}.xls`, 'application/vnd.ms-excel');
}

function filtrerAlertes(parametre, gravite, norme) {
  let alertes = chargerAlertes();
  
  // Filtrer par paramètre
  if (parametre && parametre !== 'Tous') {
    alertes = alertes.filter(a => a.parametre === parametre);
  }
  
  // Filtrer par gravité
  if (gravite && gravite !== 'Toutes') {
    alertes = alertes.filter(a => a.gravite === gravite);
  }
  
  // Filtrer par norme
  if (norme && norme !== 'Toutes') {
    alertes = alertes.filter(a => a.norme === norme);
  }
  
  return alertes;
}

// ===== COMPARAISON AUX NORMES =====

function comparerAuxNormes(sample) {
  const standards = getStandardsForParameter(sample.parametre);
  if (!standards) {
    return { error: 'Paramètre non reconnu' };
  }

  const resultats = {};
  const valeur = parseFloat(sample.valeur);
  
  Object.keys(standards.sources).forEach(norme => {
    const seuil = standards.sources[norme];
    const depassement = valeur > seuil;
    const ratio = valeur / seuil;
    
    resultats[norme] = {
      seuil: seuil,
      depassement: depassement,
      ratio: ratio,
      gravite: depassement ? determinerGravite(valeur, seuil) : 'conforme'
    };
  });
  
  return resultats;
}

// ===== EXPORT/IMPORT =====

function exporterEchantillons(format) {
  const echantillons = chargerEchantillons();
  
  if (format === 'csv') {
    return exporterCSV(echantillons, 'echantillons');
  } else if (format === 'json') {
    return exporterJSON(echantillons, 'echantillons');
  } else if (format === 'excel') {
    return exporterExcel(echantillons, 'echantillons');
  }
}

function exporterAlertes(format) {
  const alertes = chargerAlertes();
  
  if (format === 'csv') {
    return exporterCSV(alertes, 'alertes');
  } else if (format === 'json') {
    return exporterJSON(alertes, 'alertes');
  }
}

function exporterCSV(data, nomFichier) {
  if (data.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
  ].join('\n');
  
  telechargerFichier(csvContent, `${nomFichier}_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
}

function exporterJSON(data, nomFichier) {
  if (data.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }
  
  const jsonContent = JSON.stringify(data, null, 2);
  telechargerFichier(jsonContent, `${nomFichier}_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
}

function telechargerFichier(content, nomFichier, typeMime) {
  const blob = new Blob([content], { type: typeMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exporterExcel(echantillons, nomFichier) {
  if (echantillons.length === 0) {
    alert('Aucune donnée à exporter');
    return;
  }
  
  // Créer le contenu HTML pour Excel
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <style>
        table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #1e3c72; color: white; font-weight: bold; }
        .conforme { background-color: #d4edda; }
        .avertissement { background-color: #fff3cd; }
        .critique { background-color: #f8d7da; }
        .norme-conforme { color: #28a745; font-weight: bold; }
        .norme-depassement { color: #dc3545; font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>📊 Rapport EcoMonitoring - ${new Date().toLocaleDateString('fr-FR')}</h1>
      <h2>📋 Résumé des Mesures</h2>
      <table>
        <tr>
          <th>Paramètre</th>
          <th>Valeur</th>
          <th>Unité</th>
          <th>Type</th>
          <th>Libellé</th>
          <th>Description</th>
          <th>Date</th>
          <th>Latitude</th>
          <th>Longitude</th>
          <th>Statut Global</th>
          <th>Normes OMS</th>
          <th>Normes AFC</th>
          <th>Normes Sénégalais</th>
        </tr>
  `;
  
  echantillons.forEach(echantillon => {
    const resultats = comparerAuxNormes(echantillon);
    const alertes = chargerAlertes().filter(a => a.echantillonId === echantillon.id);
    
    // Déterminer le statut global
    let statutGlobal = 'Conforme';
    let classeStatut = 'conforme';
    
    if (alertes.some(a => a.gravite === 'critique')) {
      statutGlobal = 'Critique';
      classeStatut = 'critique';
    } else if (alertes.some(a => a.gravite === 'avertissement')) {
      statutGlobal = 'Avertissement';
      classeStatut = 'avertissement';
    }
    
    // Générer les colonnes de normes
    const normesOMS = resultats['OMS'] ? 
      `${resultats['OMS'].depassement ? '🔴' : '✅'} ${resultats['OMS'].seuil}` : 'N/A';
    const normesAFC = resultats['AFC'] ? 
      `${resultats['AFC'].depassement ? '🔴' : '✅'} ${resultats['AFC'].seuil}` : 'N/A';
    const normesSenegalais = resultats['Sénégal'] ? 
      `${resultats['Sénégal'].depassement ? '🔴' : '✅'} ${resultats['Sénégal'].seuil}` : 'N/A';
    
    html += `
      <tr class="${classeStatut}">
        <td>${echantillon.parametre}</td>
        <td>${echantillon.valeur}</td>
        <td>${echantillon.unite}</td>
        <td>${echantillon.type}</td>
        <td>${echantillon.libelle || 'Non spécifié'}</td>
        <td>${echantillon.description || ''}</td>
        <td>${formaterDate(echantillon.date)}</td>
        <td>${echantillon.latitude}</td>
        <td>${echantillon.longitude}</td>
        <td><strong>${statutGlobal}</strong></td>
        <td>${normesOMS}</td>
        <td>${normesAFC}</td>
        <td>${normesSenegalais}</td>
      </tr>
    `;
  });
  
  html += `
      </table>
      
      <h2>📊 Statistiques</h2>
      <table>
        <tr>
          <th>Métrique</th>
          <th>Valeur</th>
        </tr>
        <tr>
          <td>Total des mesures</td>
          <td>${echantillons.length}</td>
        </tr>
        <tr>
          <td>Mesures conformes</td>
          <td>${echantillons.filter(e => {
            const alertes = chargerAlertes().filter(a => a.echantillonId === e.id);
            return !alertes.some(a => a.gravite === 'critique' || a.gravite === 'avertissement');
          }).length}</td>
        </tr>
        <tr>
          <td>Alertes critiques</td>
          <td>${chargerAlertes().filter(a => a.gravite === 'critique').length}</td>
        </tr>
        <tr>
          <td>Alertes d'avertissement</td>
          <td>${chargerAlertes().filter(a => a.gravite === 'avertissement').length}</td>
        </tr>
        <tr>
          <td>Paramètres uniques</td>
          <td>${[...new Set(echantillons.map(e => e.parametre))].length}</td>
        </tr>
        <tr>
          <td>Types de mesures</td>
          <td>${[...new Set(echantillons.map(e => e.type))].length}</td>
        </tr>
      </table>
      
      <h2>⚠️ Détail des Alertes</h2>
      <table>
        <tr>
          <th>Paramètre</th>
          <th>Valeur</th>
          <th>Unité</th>
          <th>Norme</th>
          <th>Seuil</th>
          <th>Gravité</th>
          <th>Date</th>
          <th>Libellé</th>
        </tr>
  `;
  
  chargerAlertes().forEach(alerte => {
    const echantillon = echantillons.find(e => e.id === alerte.echantillonId);
    if (echantillon) {
      html += `
        <tr>
          <td>${echantillon.parametre}</td>
          <td>${alerte.valeur}</td>
          <td>${alerte.unite}</td>
          <td>${alerte.norme}</td>
          <td>${alerte.seuil}</td>
          <td><strong>${alerte.gravite}</strong></td>
          <td>${formaterDate(alerte.date)}</td>
          <td>${echantillon.libelle || 'Non spécifié'}</td>
        </tr>
      `;
    }
  });
  
  html += `
      </table>
      
      <p><em>Rapport généré le ${new Date().toLocaleString('fr-FR')} par EcoMonitoring</em></p>
    </body>
    </html>
  `;
  
  telechargerFichier(html, `${nomFichier}_rapport_${new Date().toISOString().split('T')[0]}.xls`, 'application/vnd.ms-excel');
}

function importerEchantillons(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = function(e) {
      try {
        const content = e.target.result;
        let data;
        
        if (file.name.endsWith('.csv')) {
          data = parserCSV(content);
        } else if (file.name.endsWith('.json')) {
          data = JSON.parse(content);
        } else {
          throw new Error('Format de fichier non supporté');
        }
        
        // Valider et ajouter les échantillons
        let ajoutes = 0;
        let erreurs = 0;
        
        data.forEach(sample => {
          const resultat = ajouterEchantillon(sample);
          if (resultat.success) {
            ajoutes++;
          } else {
            erreurs++;
            console.error('Erreur lors de l\'ajout:', resultat.message);
          }
        });
        
        resolve({ ajoutes, erreurs, total: data.length });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = function() {
      reject(new Error('Erreur lors de la lecture du fichier'));
    };
    
    reader.readAsText(file);
  });
}

function parserCSV(csvContent) {
  const lignes = csvContent.split('\n');
  const headers = lignes[0].split(',').map(h => h.replace(/"/g, '').trim());
  const data = [];
  
  for (let i = 1; i < lignes.length; i++) {
    if (lignes[i].trim()) {
      const valeurs = lignes[i].split(',').map(v => v.replace(/"/g, '').trim());
      const objet = {};
      
      headers.forEach((header, index) => {
        objet[header] = valeurs[index] || '';
      });
      
      data.push(objet);
    }
  }
  
  return data;
}

// ===== CARTE =====

// Variables globales pour la carte (déclarées ici pour éviter les conflits)
let mapInstance;
let mapMarkers = [];

function afficherCarte() {
  // Initialiser la carte si elle n'existe pas
  if (!mapInstance) {
    initialiserCarte();
  }
  
  // Effacer les marqueurs existants
  mapMarkers.forEach(marker => mapInstance.removeLayer(marker));
  mapMarkers = [];
  
  // Obtenir les échantillons filtrés
  const type = document.getElementById('filter-type')?.value || 'Tous';
  const parametre = document.getElementById('filter-parametre')?.value || 'Tous';
  const dateDebut = document.getElementById('filter-date-debut')?.value;
  const dateFin = document.getElementById('filter-date-fin')?.value;
  
  const dateRange = dateDebut && dateFin ? { debut: dateDebut, fin: dateFin } : null;
  const echantillons = filtrerEchantillons(type, parametre, dateRange);
  
  console.log('Échantillons à afficher:', echantillons.length);
  
  // Afficher les échantillons sur la carte
  echantillons.forEach(echantillon => {
    const marker = creerMarqueur(echantillon);
    marker.addTo(mapInstance);
    mapMarkers.push(marker);
  });
  
  // Mettre à jour les statistiques
  mettreAJourStatistiques();
  
  // Ajuster la vue pour inclure tous les marqueurs
  if (mapMarkers.length > 0) {
    const groupe = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(groupe.getBounds().pad(0.1));
  } else {
    // Si aucun marqueur, centrer sur Dakar
    mapInstance.setView([14.6928, -17.4467], 10);
  }
}

function creerPopupEchantillon(echantillon) {
  const resultats = comparerAuxNormes(echantillon);
  const alertes = chargerAlertes().filter(a => a.echantillonId === echantillon.id);
  const gravite = alertes.length > 0 ? alertes[0].gravite : 'conforme';
  const iconeGravite = obtenirIconeGravite(gravite);
  const couleurGravite = obtenirCouleurGravite(gravite);
  
  let html = `
    <div style="min-width: 320px; font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.4;">
      <div style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; padding: 15px; margin: -10px -10px 15px -10px; border-radius: 8px 8px 0 0;">
        <h3 style="margin: 0 0 8px 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
          ${iconeGravite} ${echantillon.parametre}
        </h3>
        <div style="font-size: 14px; opacity: 0.9;">
          <strong>Valeur mesurée:</strong> ${echantillon.valeur} ${echantillon.unite}
        </div>
      </div>
      
      <div style="padding: 0 5px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div>
            <div style="font-weight: 600; color: #495057; margin-bottom: 5px;">📅 Date de mesure</div>
            <div style="font-size: 14px;">${formaterDate(echantillon.date)}</div>
          </div>
          <div>
            <div style="font-weight: 600; color: #495057; margin-bottom: 5px;">🏷️ Type</div>
            <div style="font-size: 14px;">${echantillon.type}</div>
          </div>
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 5px;">🏷️ Libellé</div>
          <div style="font-size: 14px;">${(echantillon.libelle || '—')}</div>
        </div>
        ${echantillon.description ? `
        <div style="margin-bottom: 12px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 5px;">📝 Description</div>
          <div style="font-size: 13px; color:#6c757d;">${echantillon.description}</div>
        </div>` : ''}
        
        <div style="margin-bottom: 15px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 8px;">📍 Coordonnées</div>
          <div style="font-size: 13px; color: #6c757d; font-family: monospace;">
            Lat: ${echantillon.latitude.toFixed(6)}<br>
            Lng: ${echantillon.longitude.toFixed(6)}
          </div>
        </div>
  `;
  
  // Section des alertes
  if (alertes.length > 0) {
    html += `
      <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid ${couleurGravite};">
        <h4 style="margin: 0 0 10px 0; color: ${couleurGravite}; font-size: 16px; display: flex; align-items: center; gap: 6px;">
          ⚠️ Alertes détectées (${alertes.length})
        </h4>
    `;
    
    alertes.forEach(alerte => {
      const icone = obtenirIconeGravite(alerte.gravite);
      html += `
        <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 4px; border: 1px solid #e9ecef;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 4px;">
            ${icone} ${alerte.norme}
          </div>
          <div style="font-size: 13px; color: #6c757d;">
            Valeur: <strong>${alerte.valeur} ${alerte.unite}</strong> > Seuil: ${alerte.seuil} ${alerte.unite}
            <span style="color: ${couleurGravite}; font-weight: bold; margin-left: 8px;">
              (${alerte.gravite})
            </span>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  }
  
  // Section comparaison aux normes
  if (!resultats.error) {
    html += `
      <div style="background: #e9ecef; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
        <h4 style="margin: 0 0 10px 0; color: #495057; font-size: 16px;">📊 Comparaison aux normes</h4>
    `;
    
    Object.keys(resultats).forEach(norme => {
      const resultat = resultats[norme];
      const statut = resultat.depassement ? '🔴 Dépassement' : '✅ Conforme';
      const couleur = resultat.depassement ? '#dc3545' : '#28a745';
      const ratio = (resultat.ratio * 100).toFixed(1);
      
      html += `
        <div style="margin: 6px 0; padding: 6px; background: white; border-radius: 4px; border-left: 3px solid ${couleur};">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; color: #495057;">${norme}</span>
            <span style="color: ${couleur}; font-weight: bold; font-size: 13px;">${statut}</span>
          </div>
          <div style="font-size: 12px; color: #6c757d; margin-top: 2px;">
            Seuil: ${resultat.seuil} ${echantillon.unite} | Ratio: ${ratio}%
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  }
  
  // Section actions
  html += `
    <div style="border-top: 1px solid #e9ecef; padding-top: 10px; text-align: center;">
      <button onclick="alert('Fonctionnalité à venir: Voir les détails complets')" 
              style="background: #1e3c72; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;">
        📋 Voir détails complets
      </button>
    </div>
  `;
  
  html += '</div>';
  return html;
}

function filtrerCarte() {
  const type = document.getElementById('filter-type')?.value || 'Tous';
  const parametre = document.getElementById('filter-parametre')?.value || 'Tous';
  const dateDebut = document.getElementById('filter-date-debut')?.value;
  const dateFin = document.getElementById('filter-date-fin')?.value;
  
  const dateRange = dateDebut && dateFin ? { debut: dateDebut, fin: dateFin } : null;
  const echantillonsFiltres = filtrerEchantillons(type, parametre, dateRange);
  
  // Effacer les marqueurs existants
  mapMarkers.forEach(marker => mapInstance.removeLayer(marker));
  mapMarkers = [];
  
  // Afficher les échantillons filtrés
  echantillonsFiltres.forEach(echantillon => {
    const marker = L.marker([echantillon.latitude, echantillon.longitude])
      .addTo(mapInstance);
    
    const popupContent = creerPopupEchantillon(echantillon);
    marker.bindPopup(popupContent);
    
    mapMarkers.push(marker);
  });
  
  // Ajuster la vue
  if (mapMarkers.length > 0) {
    const groupe = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(groupe.getBounds().pad(0.1));
  }
}

// ===== FONCTIONS POUR LA CARTE =====

function getAllTypes() {
  const echantillons = chargerEchantillons();
  const builtin = ['Eau', 'Air', 'Sol', 'Déchets', 'Bruit'];
  const fromData = [...new Set(echantillons.map(e => e.type).filter(Boolean))];
  return [...new Set([...builtin, ...fromData])];
}

function initialiserCarte() {
  // Initialiser la carte Leaflet
  mapInstance = L.map('map', {
    center: [14.6928, -17.4467],
    zoom: 10,
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    keyboard: true,
    dragging: true,
    touchZoom: true
  });
  
  // Ajouter les tuiles OpenStreetMap
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  });
  
  // Ajouter une couche satellite (optionnelle)
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri',
    maxZoom: 19
  });
  
  // Ajouter les couches à la carte
  osmLayer.addTo(mapInstance);
  
  // Ajouter un contrôle de couches
  const baseMaps = {
    "Carte": osmLayer,
    "Satellite": satelliteLayer
  };
  
  L.control.layers(baseMaps).addTo(mapInstance);
  
  // Ajouter un contrôle d'échelle
  L.control.scale({
    position: 'bottomright',
    metric: true,
    imperial: false
  }).addTo(mapInstance);
  
  // Ajouter un contrôle de coordonnées
  const coordsControl = L.control({position: 'bottomleft'});
  coordsControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'coords-control');
    div.style.cssText = `
      background: rgba(255,255,255,0.8);
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      font-family: monospace;
      border: 1px solid #ccc;
    `;
    div.innerHTML = 'Lat: 0, Lng: 0';
    
    map.on('mousemove', function(e) {
      const lat = e.latlng.lat.toFixed(6);
      const lng = e.latlng.lng.toFixed(6);
      div.innerHTML = `Lat: ${lat}, Lng: ${lng}`;
    });
    
    return div;
  };
  coordsControl.addTo(mapInstance);
}

function chargerFiltres() {
  // Charger les types disponibles
  const types = getAllTypes();
  const typeSelect = document.getElementById('filter-type');
  
  if (typeSelect) {
    types.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });
  }

  // Charger les paramètres disponibles
  const parametres = STANDARDS.map(s => s.parametre);
  const parametreSelect = document.getElementById('filter-parametre');
  
  if (parametreSelect) {
    parametres.forEach(parametre => {
      const option = document.createElement('option');
      option.value = parametre;
      option.textContent = parametre;
      parametreSelect.appendChild(option);
    });
  }
}

function creerMarqueur(echantillon) {
  // Déterminer la couleur du marqueur selon les alertes
  const alertes = chargerAlertes().filter(a => a.echantillonId === echantillon.id);
  let couleur = '#28a745'; // Vert par défaut (conforme)
  let gravite = 'conforme';
  let iconeGravite = '✅';
  
  if (alertes.length > 0) {
    const gravites = alertes.map(a => a.gravite);
    if (gravites.includes('critique')) {
      couleur = '#dc3545'; // Rouge
      gravite = 'critique';
      iconeGravite = '🔴';
    } else if (gravites.includes('avertissement')) {
      couleur = '#ffc107'; // Orange
      gravite = 'avertissement';
      iconeGravite = '🟠';
    }
  }

  // Créer l'icône personnalisée avec plus de détails
  const icone = L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        position: relative;
        background-color: ${couleur};
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        color: white;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
      ">
        ${iconeGravite}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  // Créer le marqueur
  const marker = L.marker([echantillon.latitude, echantillon.longitude], { 
    icon: icone,
    title: `${echantillon.parametre}: ${echantillon.valeur} ${echantillon.unite} (${gravite})`
  });

  // Ajouter le popup détaillé
  const popupContent = creerPopupEchantillon(echantillon);
  marker.bindPopup(popupContent, {
    maxWidth: 350,
    className: 'custom-popup'
  });

  return marker;
}

function mettreAJourFiltres() {
  afficherCarte();
}

function reinitialiserFiltres() {
  const typeSelect = document.getElementById('filter-type');
  const parametreSelect = document.getElementById('filter-parametre');
  const dateDebut = document.getElementById('filter-date-debut');
  const dateFin = document.getElementById('filter-date-fin');
  
  if (typeSelect) typeSelect.value = 'Tous';
  if (parametreSelect) parametreSelect.value = 'Tous';
  if (dateDebut) dateDebut.value = '';
  if (dateFin) dateFin.value = '';
  
  afficherCarte();
}

function mettreAJourStatistiques() {
  const totalMarqueurs = document.getElementById('total-marqueurs');
  const alertesCritiques = document.getElementById('alertes-critiques');
  const zonesCouvertes = document.getElementById('zones-couvertes');
  const derniereMesure = document.getElementById('derniere-mesure');
  
  if (totalMarqueurs) totalMarqueurs.textContent = mapMarkers.length;
  
  // Compter les alertes critiques parmi les échantillons affichés
  const echantillonsAffiches = chargerEchantillons().filter(e => 
    mapMarkers.some(m => 
      Math.abs(m.getLatLng().lat - e.latitude) < 0.0001 && 
      Math.abs(m.getLatLng().lng - e.longitude) < 0.0001
    )
  );
  
  const alertesCritiquesCount = chargerAlertes().filter(a => 
    a.gravite === 'critique' && 
    echantillonsAffiches.some(e => e.id === a.echantillonId)
  ).length;
  if (alertesCritiques) alertesCritiques.textContent = alertesCritiquesCount;
  
  // Compter les zones uniques
  const zones = new Set(echantillonsAffiches.map(e => 
    `${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`
  ));
  if (zonesCouvertes) zonesCouvertes.textContent = zones.size;
  
  // Dernière mesure
  if (echantillonsAffiches.length > 0 && derniereMesure) {
    const derniere = echantillonsAffiches
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const jours = Math.floor((new Date() - new Date(derniere.date)) / (1000 * 60 * 60 * 24));
    derniereMesure.textContent = `${jours}j`;
  } else if (derniereMesure) {
    derniereMesure.textContent = '-';
  }
}

// ===== UTILITAIRES =====

function formaterDate(date) {
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function obtenirCouleurGravite(gravite) {
  switch (gravite) {
    case 'conforme': return '#28a745';
    case 'avertissement': return '#ffc107';
    case 'critique': return '#dc3545';
    default: return '#6c757d';
  }
}

function obtenirIconeGravite(gravite) {
  switch (gravite) {
    case 'conforme': return '✅';
    case 'avertissement': return '🟠';
    case 'critique': return '🔴';
    default: return '⚪';
  }
}

// ===== INITIALISATION =====

document.addEventListener('DOMContentLoaded', function() {
  // Initialiser les données de démonstration si nécessaire
  const echantillons = chargerEchantillons();
  console.log('Échantillons chargés:', echantillons.length);
  
  if (echantillons.length === 0) {
    console.log('Initialisation des données de démonstration...');
    initialiserDonneesDemo();
  }
  
  // Vérifier que les données sont bien là
  const echantillonsApres = chargerEchantillons();
  console.log('Échantillons après initialisation:', echantillonsApres.length);
  
  // Afficher les détails des échantillons pour débogage
  if (echantillonsApres.length > 0) {
    console.log('Premier échantillon:', echantillonsApres[0]);
  }
});

function initialiserDonneesDemo() {
  const echantillonsDemo = [
    // Zone 1 - Dakar Centre (conforme)
    {
      parametre: "Arsenic",
      valeur: "0.008",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.6928,
      longitude: -17.4467
    },
    {
      parametre: "PM2.5",
      valeur: "20",
      unite: "µg/m³",
      type: "Air",
      latitude: 14.6928,
      longitude: -17.4467
    },
    {
      parametre: "Bruit (jour résidentiel)",
      valeur: "50",
      unite: "dB(A)",
      type: "Bruit",
      latitude: 14.6928,
      longitude: -17.4467
    },
    
    // Zone 2 - Dakar Ouest (avertissement)
    {
      parametre: "Arsenic",
      valeur: "0.012",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.7000,
      longitude: -17.4500
    },
    {
      parametre: "PM2.5",
      valeur: "35",
      unite: "µg/m³",
      type: "Air",
      latitude: 14.7000,
      longitude: -17.4500
    },
    {
      parametre: "Plomb",
      valeur: "0.012",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.7000,
      longitude: -17.4500
    },
    
    // Zone 3 - Dakar Est (critique)
    {
      parametre: "Arsenic",
      valeur: "0.025",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.6800,
      longitude: -17.4300
    },
    {
      parametre: "PM2.5",
      valeur: "60",
      unite: "µg/m³",
      type: "Air",
      latitude: 14.6800,
      longitude: -17.4300
    },
    {
      parametre: "Mercure",
      valeur: "0.010",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.6800,
      longitude: -17.4300
    },
    {
      parametre: "Bruit (jour résidentiel)",
      valeur: "75",
      unite: "dB(A)",
      type: "Bruit",
      latitude: 14.6800,
      longitude: -17.4300
    },
    
    // Zone 4 - Dakar Sud (mélange)
    {
      parametre: "Arsenic",
      valeur: "0.009",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.6700,
      longitude: -17.4400
    },
    {
      parametre: "PM10",
      valeur: "45",
      unite: "µg/m³",
      type: "Air",
      latitude: 14.6700,
      longitude: -17.4400
    },
    {
      parametre: "Cadmium",
      valeur: "0.004",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.6700,
      longitude: -17.4400
    },
    
    // Zone 5 - Dakar Nord (conforme)
    {
      parametre: "Arsenic",
      valeur: "0.007",
      unite: "mg/L",
      type: "Eau",
      latitude: 14.7100,
      longitude: -17.4600
    },
    {
      parametre: "PM2.5",
      valeur: "18",
      unite: "µg/m³",
      type: "Air",
      latitude: 14.7100,
      longitude: -17.4600
    },
    {
      parametre: "Bruit (nuit résidentiel)",
      valeur: "40",
      unite: "dB(A)",
      type: "Bruit",
      latitude: 14.7100,
      longitude: -17.4600
    }
  ];
  
  echantillonsDemo.forEach(echantillon => {
    ajouterEchantillon(echantillon);
  });
  
  console.log('Données de démonstration initialisées');
}

// Fonction de débogage globale
function debugCarte() {
  console.log('=== DÉBOGAGE CARTE ===');
  console.log('mapInstance:', mapInstance);
  console.log('mapMarkers:', mapMarkers.length);
  console.log('Échantillons:', chargerEchantillons().length);
  console.log('Alertes:', chargerAlertes().length);
  
  if (mapInstance) {
    console.log('Carte centrée sur:', mapInstance.getCenter());
    console.log('Zoom:', mapInstance.getZoom());
  }
}
