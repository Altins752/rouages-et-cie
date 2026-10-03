/** Textes affichés (français). Les identifiants restent en anglais dans le code. */
import type { KnowHowId, RoleId } from '../data/balance';

export const STATION_NAMES = ['Découpe', 'Frappe', 'Taraudage', 'Contrôle'];
export const STATION_ROLE = ['barre → lopin', 'lopin → écrou brut', 'filetage', 'validation ou rebut'];
export const TIER_NAMES = ['Manuel', 'Mécanique', 'Semi-auto', 'Robotisé', 'Usine noire'];
export const TIER_SHORT = ['main', 'méca', 'semi', 'robot', 'noire'];
export const MACHINE_NAMES: string[][] = [
  ['Scie à main', 'Marteau et matrice', 'Taraud à main', 'Calibre'],
  ['Scie à ruban', 'Presse hydraulique', 'Taraudeuse à colonne', 'Banc de mesure'],
  ['Scie automatique', 'Presse à transfert', 'Taraudeuse multibroche', 'Contrôle optique'],
  ['Découpe laser', 'Frappe à froid multipostes', 'Taraudage CN', 'Vision IA'],
  ['Ligne intégrée', 'Ligne intégrée', 'Ligne intégrée', 'Ligne intégrée'],
];
export const UNIT_WORD = (tier: number, plural = false): string =>
  tier === 0 ? (plural ? 'établis' : 'établi') : plural ? 'machines' : 'machine';

export const MATERIAL_NAMES = ['Fonte', 'Acier doux', 'Laiton', 'Acier inox', 'Titane', 'Carbure de tungstène', 'Diamant synthétique'];
export const MATERIAL_SHORT = ['fonte', 'acier', 'laiton', 'inox', 'titane', 'carbure', 'diamant'];
export const MATERIAL_DESC = [
  'Gris mat, se vend 3 €. Le matériau de la forge.',
  'Se vend 7 €, mais s’usine 30 % plus lentement.',
  'Doré, se vend 18 €. Métal tendre ; exige frappe et taraudage mécaniques.',
  'Argenté, se vend 50 €. Dur à frapper : cycles ×1,7.',
  'Bleuté, se vend 160 €. Exige le semi-automatique.',
  'Presque noir, se vend 600 €. Exige la robotisation.',
  'Scintillant, se vend 3 000 €. Exige l’usine noire.',
];

export const LEVEL_NAMES = ['', 'Manœuvre', 'Opérateur', 'Régleur', 'Technicien'];
export const LEVEL_PLURAL = ['', 'manœuvres', 'opérateurs', 'régleurs', 'techniciens'];
export const LEVEL_DESC = ['', 'travail à la main', 'conduite de machine', 'réglage, petite maintenance', 'maintenance des robots'];
export const KIND_NAMES = { post: 'Poste fixe', poly: 'Polyvalent', crank: 'Convoyeur' } as const;

export const ROLE_NAMES: Record<RoleId, string> = {
  foreman: 'Contremaître',
  supervisor: 'Superviseur de chaîne',
  hr: 'Ressources humaines',
  methods: 'Ingénieur méthodes',
  logistics: 'Opérateur logistique',
  sales: 'Commercial',
  controller: 'Contrôleur de gestion',
};
export const ROLE_DATA: Record<RoleId, string> = {
  foreman: 'Rapport de productivité : cadence de chaque poste, goulot de chaque chaîne.',
  supervisor: 'Occupation, pièces en attente, gaspillage et usure.',
  hr: 'Compétences, moral et formations de chaque ouvrier.',
  methods: 'Paliers visés par poste et prochaine modernisation.',
  logistics: 'Flux de stock, autonomie et échéances des contrats.',
  sales: 'Prévisions et prix du marché.',
  controller: 'Coût de revient, marges et compte de résultat.',
};
export const ROLE_DECISION: Record<RoleId, string> = {
  foreman: 'Place chaque nouvel ouvrier sur le poste le plus lent et signale les postes qui freinent.',
  supervisor: 'Recommande l’achat le plus vite rentabilisé.',
  hr: 'Forme et promeut les ouvriers quand leur machine l’exige, puis celui qui freine sa chaîne.',
  methods: 'Modernise les machines selon votre consigne, une fois leur ouvrier prêt.',
  logistics: 'Livre les contrats ponctuels dès que le stock le permet.',
  sales: 'Signe les contrats long terme que la production peut tenir.',
  controller: 'Rapport périodique avec alertes au télex.',
};

export const KNOW_HOW_NAMES: Record<KnowHowId, string> = {
  cadence: 'Gestes sûrs',
  price: 'Belle ouvrage',
  wear: 'Mécanique fine',
  training: 'Compagnonnage',
  hall: 'Bâtisseur',
  capital: 'Carnet d’adresses',
  energy: 'Sobriété',
};
export const KNOW_HOW_DESC: Record<KnowHowId, string> = {
  cadence: '+3 % de cadence sur tous les postes par niveau.',
  price: '+5 % sur le prix de vente par niveau.',
  wear: '−12 % d’usure par niveau.',
  training: 'Formations 20 % plus courtes et 10 % moins chères par niveau.',
  hall: 'Halls d’usine 10 % moins chers par niveau.',
  capital: '+25 % de capital au déménagement par niveau.',
  energy: '−15 % de consommation électrique par niveau.',
};

/** Manque à gagner du rapport d'absence ({m} = montant). Ton pince-sans-rire, jamais culpabilisant. */
export const MISSED_QUIPS = {
  marcel: [
    'Pendant que tu dormais, les établis ont pris la poussière. Ça fait {m} de pas gagnés. Mais bon, faut bien dormir.',
    'Je dis pas ça pour toi, hein. Mais {m}, c’est {m}.',
    'Ton grand-père, lui, dormait dans l’atelier. Je dis ça… {m} quand même.',
    'J’ai compté les écrous qu’on n’a pas faits : {m}. Après, je suis allé me coucher aussi.',
  ],
  controller: [
    '{m}, patron. Je dis ça, je dis rien.',
    'Manque à gagner arrêté à {m}. Le café de la machine, lui, a coûté 0,40 €.',
    'J’ai mis {m} dans la colonne « sommeil ». Elle est en rouge.',
    'Un tableur ne dort jamais. Lui a calculé {m}.',
  ],
};

/** Caractère des ouvriers : nom court et effet. */
export const TRAIT_NAMES: Record<string, string> = { '': '', fast: 'Rapide', steady: 'Endurant', mate: 'Bon camarade', careful: 'Soigneux', gifted: 'Doué' };
export const TRAIT_DESC: Record<string, string> = {
  '': '',
  fast: 'travaille 15 % plus vite, mais se fatigue vite',
  steady: 'un peu plus lent, mais ne se fatigue presque pas',
  mate: 'sa chaîne garde le moral',
  careful: 'sa machine s’use 30 % moins',
  gifted: 'formations 40 % moins chères et plus courtes',
};

export const SPOT_LEVEL_NAMES = ['Tranquille', 'Serrée', 'Coup de bourre'];

export const ACT_NAMES = ['Prologue — La dette', 'Acte I — La ville', 'Acte II — La région', 'Acte III — Le pays', 'Acte IV — Le monde', 'Bac à sable'];
export const SITE_NAMES = ['Forge du quartier', 'Forge du quartier', 'Usine de la région', 'Complexe national', 'Site mondial', 'Site mondial'];
export const MARKET_NAMES = ['le quartier', 'la ville', 'la région', 'le pays', 'le monde', 'le monde'];

export const STATION_ICONS = [
  '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb02e" stroke-width="1.8" stroke-linecap="round"><path d="M3 15l11-11 3 3-11 11z"/><path d="M6 12l2 2M9 9l2 2M12 6l2 2"/><path d="M15 18h6"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb02e" stroke-width="1.8" stroke-linecap="round"><path d="M5 9l6-6 4 4-6 6z"/><path d="M11 11l8 8"/><path d="M3 21h10"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb02e" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v6"/><path d="M8 8h8v4H8z"/><path d="M10 12v8l2 2 2-2v-8"/><path d="M10 15l4 1M10 18l4 1"/></svg>',
  '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb02e" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h12v4H4z"/><path d="M6 10v8M14 10v8"/><path d="M17 15l2 2 4-5"/></svg>',
];
