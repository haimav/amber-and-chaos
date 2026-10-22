// Amber and Chaos — game data: factions, units, heroes, buildings, abilities, upgrades.
(function () {
  'use strict';
  const AC = globalThis.AC;
  const T = AC.TILE;

  // Damage multipliers: attack type -> armor type
  AC.DAMAGE_TABLE = {
    normal: { light: 1.0, medium: 1.0, heavy: 1.0, fortified: 0.7, hero: 1.0 },
    pierce: { light: 1.5, medium: 0.8, heavy: 0.85, fortified: 0.35, hero: 0.65 },
    magic: { light: 1.25, medium: 1.0, heavy: 1.5, fortified: 0.45, hero: 0.8 },
    siege: { light: 0.9, medium: 0.7, heavy: 0.9, fortified: 1.6, hero: 0.5 },
    hero: { light: 1.0, medium: 1.0, heavy: 1.0, fortified: 0.7, hero: 1.0 },
  };

  AC.FACTIONS = {
    amber: {
      id: 'amber', name: 'Amber', title: 'The House of Oberon', power: 'Order',
      worker: 'steward', hq: 'castle', expansion: 'keep', supplyBldg: 'hall_steward',
      heroHall: 'hall_trumps', powerBldg: 'shrine', tower: 'lighthouse',
      color: '#e0a526', desc: 'The one true world of Order. Princes of the blood walk the Pattern, reach each other by Trump, and raise armies from Shadow.',
    },
    chaos: {
      id: 'chaos', name: 'Chaos', title: 'The Courts of Chaos', power: 'Flux',
      worker: 'thrall', hq: 'spire', expansion: 'bastion', supplyBldg: 'hollow',
      heroHall: 'hall_houses', powerBldg: 'logrus_shrine', tower: 'serpent_eye',
      color: '#a43ad6', desc: 'The great Houses at the edge of the Abyss. Their works grow only upon the Black Road, whose grass drains the life of all who are not of Chaos.',
    },
  };

  // Player colours (slot based)
  AC.PLAYER_COLORS = [
    { main: '#e3a92b', dark: '#7a5410', light: '#ffe08a', name: 'Amber Gold' },
    { main: '#b93ad8', dark: '#4e1060', light: '#eaa8ff', name: 'Logrus Violet' },
    { main: '#2fb3a8', dark: '#0f4d48', light: '#9df5ea', name: 'Rebma Teal' },
    { main: '#d8402f', dark: '#5f150d', light: '#ffab9e', name: 'Garnath Red' },
  ];
  AC.NEUTRAL_COLOR = { main: '#8a8a7a', dark: '#3a3a30', light: '#d0d0c0', name: 'Wild' };

  // ---------------------------------------------------------------- UNITS
  const units = {
    // ---------------- Amber
    steward: {
      name: 'Steward of Amber', faction: 'amber', role: 'worker',
      hp: 70, armor: 0, armorType: 'light', dmg: 5, dmgType: 'normal', range: 18, cd: 1.3,
      speed: 88, sight: 7, radius: 9, cost: { d: 50, p: 0 }, supply: 1, time: 12,
      carry: 6, mineTime: 1.9, buildRate: 1, art: 'steward',
      desc: 'Gathers diamonds from the sands of Shadow and raises the works of Amber. Must remain at a building while it is built.',
    },
    guard: {
      name: 'Guard of Amber', faction: 'amber', role: 'melee',
      hp: 230, armor: 2, armorType: 'medium', dmg: 14, dmgType: 'normal', range: 20, cd: 1.1,
      speed: 80, sight: 8, radius: 11, cost: { d: 90, p: 0 }, supply: 2, time: 17, art: 'guard',
      desc: 'Sworn swordsmen of Castle Amber. Steady, armoured, inexpensive.',
    },
    ranger: {
      name: 'Ranger of Arden', faction: 'amber', role: 'ranged',
      hp: 150, armor: 0, armorType: 'light', dmg: 13, dmgType: 'pierce', range: 170, cd: 1.3,
      speed: 86, sight: 10, radius: 10, cost: { d: 85, p: 10 }, supply: 2, time: 19,
      move: 'woods', canHitAir: true, projectile: 'arrow', art: 'ranger',
      desc: "Bowmen of Julian's forest. They move through the woods of Arden as easily as through open ground.",
    },
    lancer: {
      name: 'Knight of Avalon', faction: 'amber', role: 'cavalry',
      hp: 390, armor: 3, armorType: 'heavy', dmg: 22, dmgType: 'normal', range: 24, cd: 1.4,
      speed: 122, sight: 8, radius: 14, cost: { d: 160, p: 20 }, supply: 3, time: 27, charge: true, art: 'lancer',
      desc: "Heavy horse in the tradition of Benedict's Avalon. Its first blow after a charge strikes double.",
    },
    rifleman: {
      name: 'Rouge Rifleman', faction: 'amber', role: 'ranged',
      hp: 180, armor: 1, armorType: 'medium', dmg: 27, dmgType: 'pierce', range: 215, cd: 2.0,
      speed: 76, sight: 10, radius: 10, cost: { d: 120, p: 40 }, supply: 2, time: 25,
      canHitAir: true, projectile: 'bullet', art: 'rifleman',
      desc: "Shadow-folk who hold Corwin a god. Their cartridges are packed with jeweler's rouge from Avalon, the only powder that fires in Amber.",
    },
    hellhound: {
      name: 'Hellhound of Arden', faction: 'amber', role: 'melee',
      hp: 260, armor: 1, armorType: 'medium', dmg: 17, dmgType: 'normal', range: 18, cd: 0.9,
      speed: 132, sight: 9, radius: 11, cost: { d: 110, p: 20 }, supply: 2, time: 20,
      move: 'woods', bonusVsBuildings: 1.6, art: 'hellhound',
      desc: "Julian's hounds, bred in Shadow. Their teeth rip flesh and metal alike.",
    },
    tidecaller: {
      name: 'Tidecaller of Rebma', faction: 'amber', role: 'caster',
      hp: 140, armor: 0, armorType: 'light', dmg: 8, dmgType: 'magic', range: 150, cd: 1.6,
      speed: 82, sight: 9, radius: 10, cost: { d: 100, p: 60 }, supply: 2, time: 23,
      canHitAir: true, projectile: 'water', mana: 120, manaRegen: 1.2, autoHeal: { amount: 28, cost: 8, range: 170, cd: 1.6 },
      art: 'tidecaller',
      desc: 'Priestesses from Rebma, the city beneath the sea. They mend the wounded with the calm of deep water.',
    },
    gryphon: {
      name: 'Gryphon of Kolvir', faction: 'amber', role: 'air',
      hp: 330, armor: 1, armorType: 'medium', dmg: 20, dmgType: 'magic', range: 110, cd: 1.5,
      speed: 128, sight: 11, radius: 15, cost: { d: 180, p: 60 }, supply: 3, time: 32,
      move: 'air', air: true, canHitAir: true, projectile: 'feather', art: 'gryphon',
      desc: 'Kin to Wixer, the purple griffin who guarded the Primal Pattern. They nest on the cliffs of Kolvir.',
    },
    bombard: {
      name: 'Bombard of Avalon', faction: 'amber', role: 'siege',
      hp: 260, armor: 1, armorType: 'heavy', dmg: 70, dmgType: 'siege', range: 300, minRange: 70, cd: 4.0,
      speed: 58, sight: 10, radius: 15, cost: { d: 200, p: 60 }, supply: 3, time: 34,
      splash: 46, projectile: 'shell', art: 'bombard', turnRate: 2,
      desc: "A heavy gun firing shells of jeweler's rouge. Devastating against walls; useless at close quarters.",
    },

    // ---------------- Chaos
    thrall: {
      name: 'Thrall of Chaos', faction: 'chaos', role: 'worker',
      hp: 70, armor: 0, armorType: 'light', dmg: 5, dmgType: 'normal', range: 18, cd: 1.3,
      speed: 88, sight: 7, radius: 9, cost: { d: 50, p: 0 }, supply: 1, time: 12,
      carry: 6, mineTime: 1.9, art: 'thrall',
      desc: 'Lesser shapes of the Courts. They gather diamonds and call the Houses\' works up out of the Black Road. A summoning needs no tending once begun.',
    },
    demon: {
      name: 'Goat-Demon', faction: 'chaos', role: 'melee',
      hp: 255, armor: 1, armorType: 'medium', dmg: 16, dmgType: 'normal', range: 20, cd: 1.1,
      speed: 84, sight: 8, radius: 11, cost: { d: 85, p: 0 }, supply: 2, time: 17, art: 'demon',
      desc: 'The goat-faced creatures who poured out of the Circle in Lorraine. They named Corwin "opener".',
    },
    crossbow: {
      name: 'Crossbowman of the Courts', faction: 'chaos', role: 'ranged',
      hp: 160, armor: 1, armorType: 'light', dmg: 15, dmgType: 'pierce', range: 175, cd: 1.4,
      speed: 80, sight: 10, radius: 10, cost: { d: 90, p: 10 }, supply: 2, time: 20,
      canHitAir: true, projectile: 'bolt', art: 'crossbow',
      desc: 'Warriors of the Houses who bear crossbows. One of them once spared Corwin on recognising Grayswandir.',
    },
    hellmaid: {
      name: 'Hellmaid', faction: 'chaos', role: 'cavalry',
      hp: 350, armor: 2, armorType: 'heavy', dmg: 21, dmgType: 'normal', range: 24, cd: 1.2,
      speed: 126, sight: 8, radius: 14, cost: { d: 150, p: 25 }, supply: 3, time: 26, charge: true, art: 'hellmaid',
      desc: 'The demon riders who came through the caves into Avalon. Benedict beat them, at the cost of an arm.',
    },
    stalker: {
      name: 'Spined Stalker', faction: 'chaos', role: 'melee',
      hp: 200, armor: 0, armorType: 'light', dmg: 25, dmgType: 'normal', range: 20, cd: 1.3,
      speed: 112, sight: 9, radius: 10, cost: { d: 120, p: 40 }, supply: 2, time: 22,
      stealth: true, art: 'stalker',
      desc: 'Spined, bloodshot-eyed hunters who chased Random across Shadow. Invisible until close, or until they strike.',
    },
    manticore: {
      name: 'Manticore', faction: 'chaos', role: 'beast',
      hp: 620, armor: 2, armorType: 'heavy', dmg: 30, dmgType: 'normal', range: 26, cd: 1.6,
      speed: 90, sight: 8, radius: 17, cost: { d: 220, p: 50 }, supply: 4, time: 34,
      poison: { dps: 6, dur: 5 }, art: 'manticore',
      desc: 'A man-faced lion with a scorpion\'s sting. One stalked Corwin in Arden until Julian slew it.',
    },
    wyvern: {
      name: 'Wyvern Rider', faction: 'chaos', role: 'air',
      hp: 300, armor: 1, armorType: 'medium', dmg: 22, dmgType: 'pierce', range: 130, cd: 1.4,
      speed: 136, sight: 11, radius: 16, cost: { d: 180, p: 60 }, supply: 3, time: 30,
      move: 'air', air: true, canHitAir: true, projectile: 'javelin', art: 'wyvern',
      desc: 'Riders of the Courts who descended on Kolvir in the war of the Black Road.',
    },
    tyiga: {
      name: "Ty'iga", faction: 'chaos', role: 'caster',
      hp: 160, armor: 0, armorType: 'light', dmg: 10, dmgType: 'magic', range: 150, cd: 1.5,
      speed: 96, sight: 10, radius: 10, cost: { d: 120, p: 80 }, supply: 2, time: 28,
      canHitAir: true, projectile: 'wisp', mana: 120, manaRegen: 1.0, abilities: ['possess'], art: 'tyiga',
      desc: 'A bodiless demon that dwells in the bodies of others. It can seize an enemy and never let go.',
    },
    spitter: {
      name: 'Abyss Spitter', faction: 'chaos', role: 'siege',
      hp: 300, armor: 1, armorType: 'heavy', dmg: 66, dmgType: 'siege', range: 290, minRange: 70, cd: 4.0,
      speed: 60, sight: 10, radius: 16, cost: { d: 200, p: 60 }, supply: 3, time: 34,
      splash: 46, projectile: 'glob', art: 'spitter', turnRate: 2,
      desc: 'A bloated thing from the Abyss that spits gobbets of primal Chaos, which unmakes stone.',
    },

    // ---------------- Summons (not trainable)
    hound_summon: {
      name: 'Hound of Arden', faction: 'amber', role: 'melee', summon: true,
      hp: 220, armor: 1, armorType: 'medium', dmg: 15, dmgType: 'normal', range: 18, cd: 0.9,
      speed: 140, sight: 9, radius: 11, cost: { d: 0, p: 0 }, supply: 0, time: 1,
      move: 'woods', bonusVsBuildings: 1.6, art: 'hellhound',
      desc: 'Called to the hunt by Julian.',
    },
    hendrake_summon: {
      name: 'Warrior of Hendrake', faction: 'chaos', role: 'melee', summon: true,
      hp: 360, armor: 3, armorType: 'heavy', dmg: 22, dmgType: 'normal', range: 22, cd: 1.1,
      speed: 90, sight: 8, radius: 12, cost: { d: 0, p: 0 }, supply: 0, time: 1, art: 'hendrake',
      desc: 'Sworn blades of House Hendrake, kin of the warrior-maiden Gilva.',
    },

    // ---------------- Neutral creatures
    wild_manticore: {
      name: 'Wild Manticore', faction: 'neutral', role: 'beast',
      hp: 560, armor: 2, armorType: 'heavy', dmg: 26, dmgType: 'normal', range: 26, cd: 1.6,
      speed: 90, sight: 7, radius: 17, cost: { d: 0, p: 0 }, supply: 0, time: 1,
      poison: { dps: 5, dur: 4 }, bounty: 70, art: 'manticore',
      desc: 'A manticore gone feral in Shadow.',
    },
    shadow_wolf: {
      name: 'Shadow Wolf', faction: 'neutral', role: 'melee',
      hp: 200, armor: 0, armorType: 'medium', dmg: 12, dmgType: 'normal', range: 18, cd: 0.9,
      speed: 120, sight: 7, radius: 10, cost: { d: 0, p: 0 }, supply: 0, time: 1, bounty: 30, art: 'wolf',
      desc: 'Lean grey wolves of the borderlands of Shadow.',
    },
    sphinx: {
      name: 'The Sphinx', faction: 'neutral', role: 'beast', boss: true,
      hp: 2400, armor: 5, armorType: 'heavy', dmg: 55, dmgType: 'magic', range: 30, cd: 1.6,
      speed: 70, sight: 8, radius: 26, cost: { d: 0, p: 0 }, supply: 0, time: 1, bounty: 450, art: 'sphinx',
      desc: 'She devours those who cannot answer her riddles. Her hoard is great.',
    },
    glass_dragon: {
      name: 'The Glass Dragon', faction: 'neutral', role: 'beast', boss: true,
      hp: 3200, armor: 6, armorType: 'heavy', dmg: 60, dmgType: 'magic', range: 120, cd: 2.0, splash: 40,
      speed: 60, sight: 9, radius: 28, cost: { d: 0, p: 0 }, supply: 0, time: 1, bounty: 300,
      projectile: 'prism', canHitAir: true, art: 'glassdragon',
      desc: "Transparent, prismatic, dragon-like: the guardian of Brand's tower in a land lit without a sun.",
    },
    goat_lord: {
      name: 'The Goat-Faced Lord', faction: 'chaos', role: 'melee', boss: true,
      hp: 1800, armor: 4, armorType: 'hero', dmg: 40, dmgType: 'hero', range: 26, cd: 1.3,
      speed: 85, sight: 9, radius: 18, cost: { d: 0, p: 0 }, supply: 0, time: 1, art: 'goatlord',
      desc: 'Leader of the creatures of the Circle. He knows who opened the way.',
    },
    lorraine_militia: {
      name: 'Militia of Lorraine', faction: 'amber', role: 'melee',
      hp: 160, armor: 1, armorType: 'medium', dmg: 11, dmgType: 'normal', range: 20, cd: 1.1,
      speed: 80, sight: 8, radius: 10, cost: { d: 70, p: 0 }, supply: 2, time: 14, art: 'militia',
      desc: "Ganelon's soldiers, farmers and soldiers of a land being eaten by the Circle.",
    },
  };

  // ---------------------------------------------------------------- HEROES
  const heroes = {
    corwin: {
      name: 'Corwin', title: 'Prince of Amber', faction: 'amber', hero: true, role: 'hero',
      hp: 1150, armor: 3, armorType: 'hero', dmg: 38, dmgType: 'hero', range: 24, cd: 1.0,
      speed: 96, sight: 11, radius: 13, mana: 200, manaRegen: 1.4, regen: 2.5,
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#c8ccd6', '#16161c'],
      abilities: ['pattern_image', 'ride_drum', 'trump_recall', 'jewel_storm'],
      passive: { name: 'Grayswandir', desc: '+25% damage against heroes and creatures of Chaos. Corwin regenerates quickly.' },
      vsChaos: 1.25, art: 'hero_corwin',
      desc: 'Silver and black. Swordsman, poet and the narrator of the war. He once purged the Black Road by holding the image of the Pattern in his mind.',
    },
    benedict: {
      name: 'Benedict', title: 'Master of Arms', faction: 'amber', hero: true, role: 'hero',
      hp: 1300, armor: 4, armorType: 'hero', dmg: 42, dmgType: 'hero', range: 26, cd: 1.05,
      speed: 92, sight: 12, radius: 13, mana: 180, manaRegen: 1.2,
      cost: { d: 320, p: 110 }, supply: 4, time: 40, colors: ['#e07a1c', '#6b4a22'],
      abilities: ['strategist', 'whirlwind', 'trump_recall', 'jewel_storm'],
      aura: { kind: 'damage', amount: 0.15, radius: 6 },
      passive: { name: 'Master of Arms', desc: 'Aura: allies within 6 tiles deal +15% damage.' },
      art: 'hero_benedict',
      desc: 'Orange, yellow and brown. Protector of Avalon, master of every weapon and of every war. He fights better with one arm than most men with two.',
    },
    gerard: {
      name: 'Gérard', title: 'The Strongest Man in the Multiverse', faction: 'amber', hero: true, role: 'hero',
      hp: 1700, armor: 6, armorType: 'hero', dmg: 36, dmgType: 'hero', range: 26, cd: 1.3,
      speed: 86, sight: 10, radius: 15, mana: 160, manaRegen: 1.0,
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#3a6fd0', '#8a94a3'],
      abilities: ['heave', 'hold_line', 'trump_recall', 'jewel_storm'],
      passive: { name: 'Unbreakable', desc: 'Massive health and armour.' },
      art: 'hero_gerard',
      desc: 'Blue and grey. Loyal, direct, and stronger than anyone alive. He kept Amber\'s fleet with Caine.',
    },
    julian: {
      name: 'Julian', title: 'Lord of Arden', faction: 'amber', hero: true, role: 'hero',
      hp: 1220, armor: 3, armorType: 'hero', dmg: 37, dmgType: 'hero', range: 28, cd: 1.0,
      speed: 112, sight: 12, radius: 15, mana: 200, manaRegen: 1.3,
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#f0f0f0', '#1a1a1a'], move: 'woods',
      abilities: ['hounds', 'the_hunt', 'trump_recall', 'jewel_storm'],
      passive: { name: 'Rider of Morgenstern', desc: 'Moves through forests; swift.' },
      art: 'hero_julian',
      desc: 'White and black. A cold hunter with a calm manner and a biting tongue. He rides Morgenstern at the head of his hellhounds.',
    },
    fiona: {
      name: 'Fiona', title: 'Sorceress of Amber', faction: 'amber', hero: true, role: 'hero',
      hp: 980, armor: 2, armorType: 'hero', dmg: 33, dmgType: 'hero', range: 170, cd: 1.2,
      speed: 92, sight: 12, radius: 12, mana: 260, manaRegen: 2.0, canHitAir: true, projectile: 'magic',
      cost: { d: 300, p: 120 }, supply: 4, time: 40, colors: ['#d23c2a', '#5a1a40'],
      abilities: ['psychic_bind', 'sorcery_fire', 'trump_recall', 'jewel_storm'],
      passive: { name: "Dworkin's Pupil", desc: 'Fast mana regeneration; ranged magic attack.' },
      art: 'hero_fiona',
      desc: 'Red-haired, poised and deft of mind. Dworkin\'s most advanced student. At the edge of the Abyss she held Brand bound by will alone.',
    },
    caine: {
      name: 'Caine', title: 'Admiral of Amber', faction: 'amber', hero: true, role: 'hero',
      hp: 1080, armor: 2, armorType: 'hero', dmg: 38, dmgType: 'hero', range: 210, cd: 1.1,
      speed: 96, sight: 13, radius: 12, mana: 180, manaRegen: 1.2, canHitAir: true, projectile: 'silver',
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#1a1a1a', '#2f8a4a'],
      abilities: ['silver_arrow', 'feigned_death', 'trump_recall', 'jewel_storm'],
      passive: { name: 'Calculating', desc: 'Long-ranged bowman.' },
      art: 'hero_caine',
      desc: 'Black and green. A calculating realist who feigned his own death, then ended Brand with silver-tipped arrows.',
    },
    random: {
      name: 'Random', title: 'The King to Be', faction: 'amber', hero: true, role: 'hero',
      hp: 1150, armor: 3, armorType: 'hero', dmg: 35, dmgType: 'hero', range: 24, cd: 0.95,
      speed: 100, sight: 11, radius: 13, mana: 200, manaRegen: 1.4,
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#e0601c', '#7a3a18'],
      abilities: ['war_drums', 'trump_summons', 'trump_recall', 'jewel_storm'],
      passive: { name: 'Chosen of the Unicorn', desc: 'Quick blade.' },
      art: 'hero_random',
      desc: 'Orange, red and brown. Drummer, glider pilot, and the youngest punk of the family, until the Unicorn knelt before him.',
    },

    dara: {
      name: 'Dara', title: 'Daughter of the Hellmaid', faction: 'chaos', hero: true, role: 'hero',
      hp: 1050, armor: 3, armorType: 'hero', dmg: 35, dmgType: 'hero', range: 24, cd: 1.0,
      speed: 100, sight: 11, radius: 13, mana: 200, manaRegen: 1.4, regen: 1.0,
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#3a1050', '#c8b8d8'],
      abilities: ['chaos_shape', 'borel_lunge', 'ways_recall', 'chaos_wave'],
      passive: { name: 'Blood of Two Worlds', desc: 'Descended from Benedict and Lintra. She regenerates.' },
      art: 'hero_dara',
      desc: "Benedict's great-granddaughter through the Hellmaid Lintra, trained in the sword by Borel. She walked the Pattern of Amber in the middle of a battle and became a creature of Chaos.",
    },
    brand: {
      name: 'Brand', title: 'The Living Trump', faction: 'chaos', hero: true, role: 'hero',
      hp: 1150, armor: 2, armorType: 'hero', dmg: 42, dmgType: 'hero', range: 180, cd: 1.2,
      speed: 94, sight: 12, radius: 12, mana: 260, manaRegen: 2.0, canHitAir: true, projectile: 'fire',
      cost: { d: 300, p: 120 }, supply: 4, time: 40, colors: ['#2fa84a', '#163a1e'],
      abilities: ['living_trump', 'pyrokinesis', 'ways_recall', 'chaos_wave'],
      passive: { name: 'Faustian Bargain', desc: 'A prince of Amber fighting for Chaos. Ranged fire.' },
      art: 'hero_brand',
      desc: 'Green. A brilliant, mad sorcerer of Amber who bargained with Chaos. He can go anywhere in Shadow by will, and set things alight by thought.',
    },
    borel: {
      name: 'Borel', title: 'Duke of Hendrake', faction: 'chaos', hero: true, role: 'hero',
      hp: 1350, armor: 5, armorType: 'hero', dmg: 40, dmgType: 'hero', range: 26, cd: 1.0,
      speed: 90, sight: 11, radius: 14, mana: 180, manaRegen: 1.1,
      cost: { d: 320, p: 110 }, supply: 4, time: 40, colors: ['#8a1a1a', '#202020'],
      abilities: ['riposte', 'call_hendrake', 'ways_recall', 'chaos_wave'],
      aura: { kind: 'armor', amount: 2, radius: 6 },
      passive: { name: 'Master at Arms of the Courts', desc: 'Aura: allies within 6 tiles gain +2 armour.' },
      art: 'hero_borel',
      desc: "Duke and Master at Arms of House Hendrake, and Dara's fencing master. The finest blade of the Courts.",
    },
    mandor: {
      name: 'Mandor', title: 'Lord of House Sawall', faction: 'chaos', hero: true, role: 'hero',
      hp: 1120, armor: 2, armorType: 'hero', dmg: 39, dmgType: 'hero', range: 170, cd: 1.2,
      speed: 92, sight: 12, radius: 12, mana: 240, manaRegen: 1.8, canHitAir: true, projectile: 'sphere',
      cost: { d: 300, p: 120 }, supply: 4, time: 40, colors: ['#151515', '#b0b0b8'],
      abilities: ['spheres', 'machinations', 'ways_recall', 'chaos_wave'],
      passive: { name: 'Machiavellian', desc: 'Ranged sorcery. His name is an anagram of Random.' },
      art: 'hero_mandor',
      desc: "Merlin's stepbrother, a manipulator of rare subtlety. His name is an anagram of Random's.",
    },
    jurt: {
      name: 'Jurt', title: 'Son of Sawall', faction: 'chaos', hero: true, role: 'hero',
      hp: 1050, armor: 2, armorType: 'hero', dmg: 36, dmgType: 'hero', range: 24, cd: 0.9,
      speed: 104, sight: 11, radius: 13, mana: 180, manaRegen: 1.3,
      cost: { d: 300, p: 100 }, supply: 4, time: 40, colors: ['#5a2a7a', '#e0c040'],
      abilities: ['logrus_blink', 'fury', 'ways_recall', 'chaos_wave'],
      passive: { name: 'Hatred', desc: 'Fast, vicious melee.' },
      art: 'hero_jurt',
      desc: "Dara's son by Sawall, Merlin's half-brother, and his bitter enemy.",
    },
    suhuy: {
      name: 'Suhuy', title: 'Keeper of the Logrus', faction: 'chaos', hero: true, role: 'hero',
      hp: 1020, armor: 2, armorType: 'hero', dmg: 31, dmgType: 'hero', range: 170, cd: 1.3,
      speed: 88, sight: 12, radius: 12, mana: 280, manaRegen: 2.2, canHitAir: true, projectile: 'tendril',
      cost: { d: 300, p: 120 }, supply: 4, time: 40, colors: ['#3b1a6a', '#d0c060'],
      abilities: ['tendrils', 'logrus_mend', 'ways_recall', 'chaos_wave'],
      passive: { name: 'Master of the Logrus', desc: 'Great mana. Support sorcery.' },
      art: 'hero_suhuy',
      desc: "Creator and keeper of the Logrus, Dworkin's friendly adversary. Merlin calls him Uncle.",
    },

    // Scenario-only heroes
    ganelon: {
      name: 'Ganelon', title: 'Lord of Lorraine', faction: 'amber', hero: true, role: 'hero', scenarioOnly: true,
      hp: 1100, armor: 4, armorType: 'hero', dmg: 34, dmgType: 'hero', range: 24, cd: 1.1,
      speed: 90, sight: 10, radius: 13, mana: 150, manaRegen: 1.0,
      cost: { d: 0, p: 0 }, supply: 0, time: 1, colors: ['#7a5a2a', '#3a2a1a'],
      abilities: ['rally_lorraine', 'whirlwind'],
      passive: { name: 'Old Soldier', desc: 'A hard, cunning commander. There may be more to him than he admits.' },
      art: 'hero_ganelon',
      desc: 'An exile from Avalon, commander of the soldiers of Lorraine. In later days Oberon walked in his likeness.',
    },
  };

  // ---------------------------------------------------------------- BUILDINGS
  const buildings = {
    // ---------------- Amber
    castle: {
      name: 'Castle Amber', faction: 'amber', size: 4, hp: 3200, armor: 5, armorType: 'fortified',
      cost: { d: 450, p: 0 }, time: 90, supply: 12, dropoff: true, sight: 11, power: 1.0, order: 7,
      trains: ['steward'], researches: [], hq: true, art: 'castle',
      attack: { dmg: 14, dmgType: 'pierce', range: 200, cd: 1.4, projectile: 'arrow', canHitAir: true },
      desc: 'Seat of the House of Oberon, high on Kolvir. Stewards bring diamonds here.',
    },
    keep: {
      name: 'Keep of Shadow', faction: 'amber', size: 3, hp: 1800, armor: 4, armorType: 'fortified',
      cost: { d: 320, p: 0 }, time: 60, supply: 6, dropoff: true, sight: 10, order: 5,
      trains: ['steward'], hq: true, art: 'keep', requires: ['barracks'],
      desc: 'A fortified outpost raised in a near Shadow. A place to bring diamonds.',
    },
    hall_steward: {
      name: "Stewards' Hall", faction: 'amber', size: 2, hp: 550, armor: 2, armorType: 'fortified',
      cost: { d: 100, p: 0 }, time: 25, supply: 10, sight: 6, order: 2, art: 'house',
      desc: 'Lodging for the servants and soldiers of Amber. Raises the supply limit by 10.',
    },
    barracks: {
      name: 'Barracks of the Guard', faction: 'amber', size: 3, hp: 1300, armor: 3, armorType: 'fortified',
      cost: { d: 180, p: 0 }, time: 45, sight: 8, order: 2, trains: ['guard', 'lancer'], researches: ['avalon_steel'],
      art: 'barracks', desc: 'Trains the Guard of Amber and the Knights of Avalon.',
    },
    lodge: {
      name: 'Lodge of Arden', faction: 'amber', size: 3, hp: 1100, armor: 2, armorType: 'fortified',
      cost: { d: 170, p: 20 }, time: 45, sight: 8, order: 2, trains: ['ranger', 'hellhound'], researches: ['arden_yew'],
      art: 'lodge', requires: ['barracks'], desc: "Julian's hunting lodge. Trains rangers and hellhounds.",
    },
    shrine: {
      name: 'Shrine of the Unicorn', faction: 'amber', size: 3, hp: 1000, armor: 2, armorType: 'fortified',
      cost: { d: 160, p: 0 }, time: 45, sight: 9, order: 8, power: 1.4, trains: ['tidecaller'],
      researches: ['rebman_mail'], powers: ['unicorn_blessing'], art: 'shrine',
      desc: 'A shrine where the Unicorn of Order was once seen. It produces Order, holds back the Black Road, and calls Tidecallers from Rebma.',
    },
    armory: {
      name: 'Armory of Avalon', faction: 'amber', size: 3, hp: 1200, armor: 3, armorType: 'fortified',
      cost: { d: 220, p: 60 }, time: 55, sight: 8, order: 2, trains: ['rifleman', 'bombard'], researches: ['rouge'],
      art: 'armory', requires: ['barracks', 'shrine'],
      desc: "Where jeweler's rouge from Avalon is packed into cartridge and shell.",
    },
    aerie: {
      name: 'Aerie of Kolvir', faction: 'amber', size: 3, hp: 1000, armor: 2, armorType: 'fortified',
      cost: { d: 220, p: 90 }, time: 55, sight: 10, order: 2, trains: ['gryphon'], art: 'aerie', requires: ['lodge'],
      desc: 'Cliff-nests for the gryphons of Kolvir.',
    },
    hall_trumps: {
      name: 'Hall of Trumps', faction: 'amber', size: 3, hp: 1100, armor: 3, armorType: 'fortified',
      cost: { d: 200, p: 50 }, time: 50, sight: 9, order: 3, heroes: ['corwin', 'benedict', 'gerard', 'julian', 'fiona', 'caine', 'random'],
      researches: ['jewel'], art: 'hall_trumps',
      desc: "The family's Trumps hang here. Through them the princes and princesses of Amber answer the call to war.",
    },
    lighthouse: {
      name: 'Lighthouse of Cabra', faction: 'amber', size: 2, hp: 700, armor: 3, armorType: 'fortified',
      cost: { d: 125, p: 0 }, time: 30, sight: 13, order: 2, art: 'lighthouse', requires: ['barracks'], detector: true,
      attack: { dmg: 16, dmgType: 'pierce', range: 230, cd: 1.1, projectile: 'arrow', canHitAir: true },
      desc: 'A watchtower after the lighthouse Jopin keeps at Cabra. It sees far and shoots straight.',
    },

    // ---------------- Chaos
    spire: {
      name: 'Thelbane Spire', faction: 'chaos', size: 4, hp: 3200, armor: 5, armorType: 'fortified',
      cost: { d: 450, p: 0 }, time: 90, supply: 12, dropoff: true, sight: 11, power: 1.0, spread: 8,
      trains: ['thrall'], hq: true, art: 'spire',
      attack: { dmg: 14, dmgType: 'magic', range: 200, cd: 1.4, projectile: 'wisp', canHitAir: true },
      desc: 'A splinter of Thelbane, the great citadel of the Courts. The Black Road spreads from its roots.',
    },
    bastion: {
      name: 'Bastion of the Road', faction: 'chaos', size: 3, hp: 1800, armor: 4, armorType: 'fortified',
      cost: { d: 320, p: 0 }, time: 60, supply: 6, dropoff: true, sight: 10, spread: 6,
      trains: ['thrall'], hq: true, art: 'bastion', requires: ['pit'], anywhere: true,
      desc: 'An outpost that pushes the Black Road into new Shadows. It can be summoned anywhere.',
    },
    hollow: {
      name: 'Brood Hollow', faction: 'chaos', size: 2, hp: 550, armor: 2, armorType: 'fortified',
      cost: { d: 100, p: 0 }, time: 25, supply: 10, sight: 6, spread: 2, art: 'hollow',
      desc: 'A warren in the Black Road where lesser shapes are spawned. Raises the supply limit by 10.',
    },
    obelisk: {
      name: 'Road Obelisk', faction: 'chaos', size: 1, hp: 300, armor: 2, armorType: 'fortified',
      cost: { d: 60, p: 0 }, time: 18, sight: 7, spread: 6, art: 'obelisk', anywhere: true,
      desc: 'A cheap black standing-stone that extends the Black Road around it. It can be summoned anywhere.',
    },
    pit: {
      name: 'Demon Pit', faction: 'chaos', size: 3, hp: 1300, armor: 3, armorType: 'fortified',
      cost: { d: 180, p: 0 }, time: 45, sight: 8, spread: 3, trains: ['demon', 'stalker'], researches: ['hell_claws'],
      art: 'pit', desc: 'Goat-demons and spined stalkers crawl from its depths.',
    },
    hendrake: {
      name: 'Hendrake Hall', faction: 'chaos', size: 3, hp: 1200, armor: 3, armorType: 'fortified',
      cost: { d: 180, p: 20 }, time: 45, sight: 8, spread: 3, trains: ['crossbow', 'hellmaid'], researches: ['logrus_sight'],
      art: 'hendrake', requires: ['pit'], desc: "The war-hall of House Hendrake. Trains crossbowmen and Hellmaids.",
    },
    logrus_shrine: {
      name: 'Logrus Shrine', faction: 'chaos', size: 3, hp: 1000, armor: 2, armorType: 'fortified',
      cost: { d: 160, p: 0 }, time: 45, sight: 9, spread: 5, power: 1.4, trains: ['tyiga'],
      researches: ['road_spread'], powers: ['logrus_surge'], art: 'logrus_shrine',
      desc: 'An image of the ever-shifting Logrus. It produces Flux and calls the ty\'iga.',
    },
    den: {
      name: 'Manticore Den', faction: 'chaos', size: 3, hp: 1200, armor: 3, armorType: 'fortified',
      cost: { d: 220, p: 60 }, time: 55, sight: 8, spread: 3, trains: ['manticore', 'spitter'], researches: ['shifting_hide'],
      art: 'den', requires: ['pit', 'logrus_shrine'], desc: 'Lair of manticores and the spitters of the Abyss.',
    },
    roost: {
      name: 'Wyvern Roost', faction: 'chaos', size: 3, hp: 1000, armor: 2, armorType: 'fortified',
      cost: { d: 220, p: 90 }, time: 55, sight: 10, spread: 3, trains: ['wyvern'], art: 'roost', requires: ['hendrake'],
      desc: 'Jagged perches for the wyverns of the Courts.',
    },
    hall_houses: {
      name: 'Hall of the Houses', faction: 'chaos', size: 3, hp: 1100, armor: 3, armorType: 'fortified',
      cost: { d: 200, p: 50 }, time: 50, sight: 9, spread: 3, heroes: ['dara', 'brand', 'borel', 'mandor', 'jurt', 'suhuy'],
      researches: ['wave'], art: 'hall_houses',
      desc: 'Where the great Houses of Chaos — Sawall, Hendrake, Barimen and the rest — send their lords to war.',
    },
    serpent_eye: {
      name: "Serpent's Eye", faction: 'chaos', size: 2, hp: 700, armor: 3, armorType: 'fortified',
      cost: { d: 125, p: 0 }, time: 30, sight: 13, spread: 2, art: 'serpent_eye', requires: ['pit'], detector: true,
      attack: { dmg: 17, dmgType: 'magic', range: 225, cd: 1.15, projectile: 'wisp', canHitAir: true },
      desc: 'A watchful tower that stares like the Serpent of Chaos, whose eye the Unicorn once stole.',
    },

    // ---------------- Scenario structures
    the_circle: {
      name: 'The Circle', faction: 'chaos', size: 4, hp: 4000, armor: 6, armorType: 'fortified',
      cost: { d: 0, p: 0 }, time: 1, sight: 9, spread: 9, art: 'circle', scenarioOnly: true,
      desc: 'A growing stain on the land of Lorraine that belches forth demons and drains life from the people.',
    },
    brand_tower: {
      name: "Brand's Tower", faction: 'neutral', size: 3, hp: 99999, armor: 20, armorType: 'fortified', invulnerable: true,
      cost: { d: 0, p: 0 }, time: 1, sight: 4, art: 'brand_tower', scenarioOnly: true,
      desc: 'A lonely tower in a land without a sun, where boulders orbit one another.',
    },
    village: {
      name: 'Cottages of Lorraine', faction: 'amber', size: 2, hp: 500, armor: 1, armorType: 'fortified',
      cost: { d: 0, p: 0 }, time: 1, sight: 5, supply: 4, art: 'village', scenarioOnly: true,
      desc: 'The farmsteads of Lorraine.',
    },
  };

  // ---------------------------------------------------------------- ABILITIES
  // target: 'none' (instant self), 'point', 'unit' (enemy), 'ally'
  const abilities = {
    pattern_image: {
      name: 'Image of the Pattern', key: 'Q', mana: 80, cd: 32, target: 'none', radius: 6 * T, dmg: 90,
      icon: '✺', color: '#9fd8ff', ai: 'aoe',
      desc: 'Corwin holds the Pattern in his mind. The Black Road withers within 6 tiles, and creatures of Chaos nearby take 90 damage and are slowed.',
    },
    ride_drum: {
      name: 'Ride of Drum', key: 'W', mana: 40, cd: 20, target: 'none', dur: 6, icon: '♞', color: '#c8ccd6', ai: 'engage',
      desc: 'Corwin calls his horse Drum. For 6 seconds he moves 80% faster and deals 30% more damage.',
    },
    strategist: {
      name: "Strategist's Command", key: 'Q', mana: 75, cd: 40, target: 'none', radius: 7 * T, dur: 10, icon: '⚑', color: '#f0a040', ai: 'buff',
      desc: 'Allies within 7 tiles attack 40% faster and move 15% faster for 10 seconds.',
    },
    whirlwind: {
      name: 'Whirlwind of Steel', key: 'W', mana: 60, cd: 14, target: 'none', radius: 2.4 * T, dmg: 150, icon: '✷', color: '#ffd070', ai: 'aoe',
      desc: 'A blur of steel that deals 150 damage to every enemy nearby.',
    },
    heave: {
      name: 'Mighty Heave', key: 'Q', mana: 50, cd: 12, target: 'unit', range: 1.6 * T, dmg: 120, icon: '✊', color: '#7aa8ff', ai: 'target',
      desc: 'Gérard lifts an enemy and hurls it 3 tiles. It takes 120 damage and is stunned for 2 seconds. Does not work on buildings.',
    },
    hold_line: {
      name: 'Hold the Line', key: 'W', mana: 60, cd: 30, target: 'none', radius: 5 * T, dur: 8, icon: '⛨', color: '#8a94a3', ai: 'buff',
      desc: 'Taunts enemies within 5 tiles into attacking Gérard. He takes 50% less damage for 8 seconds.',
    },
    hounds: {
      name: 'Hounds of Arden', key: 'Q', mana: 90, cd: 45, target: 'none', dur: 40, icon: '🐺', color: '#d0d0d0', ai: 'summon',
      desc: 'Julian sounds his horn and 3 hellhounds join the hunt for 40 seconds.',
    },
    the_hunt: {
      name: 'The Hunt', key: 'W', mana: 40, cd: 15, target: 'unit', range: 8 * T, dur: 12, icon: '◎', color: '#ff6060', ai: 'target',
      desc: 'Marks the quarry. For 12 seconds it takes 50% more damage and is visible to you.',
    },
    psychic_bind: {
      name: 'Psychic Binding', key: 'Q', mana: 70, cd: 18, target: 'unit', range: 7 * T, dmg: 60, dur: 4, icon: '❂', color: '#e070ff', ai: 'target',
      desc: 'Fiona binds the target by will alone. It takes 60 damage and cannot act for 4 seconds (3 for heroes).',
    },
    sorcery_fire: {
      name: 'Fire of Sorcery', key: 'W', mana: 90, cd: 16, target: 'point', range: 9 * T, radius: 2.5 * T, dmg: 180, icon: '☄', color: '#ff7a30', ai: 'aoePoint',
      desc: 'After a moment, sorcerous fire falls on the area and deals 180 damage.',
    },
    silver_arrow: {
      name: 'Silver Arrow', key: 'Q', mana: 60, cd: 20, target: 'unit', range: 11 * T, dmg: 260, icon: '➶', color: '#e8e8ff', ai: 'target',
      desc: 'A silver-tipped arrow that deals 260 damage, and 50% more against heroes. It was the death of Brand.',
    },
    feigned_death: {
      name: 'Feigned Death', key: 'W', mana: 50, cd: 35, target: 'none', dur: 12, icon: '☠', color: '#2f8a4a', ai: 'escape',
      desc: 'Caine vanishes for 12 seconds and moves faster. His first attack from hiding deals double damage.',
    },
    war_drums: {
      name: 'War Drums', key: 'Q', mana: 60, cd: 30, target: 'none', radius: 7 * T, dur: 12, icon: '♫', color: '#ff9a40', ai: 'buff',
      desc: 'Random beats the drums. Allies within 7 tiles move and attack 25% faster for 12 seconds.',
    },
    trump_summons: {
      name: 'Trump Summons', key: 'W', mana: 100, cd: 60, target: 'none', icon: '🂠', color: '#ffe08a', ai: 'reinforce',
      desc: "Through a Trump, Random calls up to 10 soldiers from near your seat of power to his side.",
    },
    trump_recall: {
      name: 'Trump of Castle Amber', key: 'R', mana: 25, cd: 60, target: 'none', channel: 2, icon: '🂡', color: '#ffe08a', ai: 'retreat',
      desc: 'After 2 seconds of concentration the hero steps through a Trump to your seat of power.',
    },
    jewel_storm: {
      name: 'Storm of the Jewel', key: 'E', mana: 60, cd: 50, target: 'point', range: 12 * T, radius: 4 * T, dur: 8, hpCost: 0.15,
      requires: 'jewel', shared: true, icon: '◆', color: '#ff3048', ai: 'aoePoint',
      desc: 'The Jewel of Judgment brings a storm: 8 seconds of lightning over the area. It draws on the bearer\'s life force, costing 15% of current health. Needs the Jewel of Judgment.',
    },
    rally_lorraine: {
      name: 'Rally of Lorraine', key: 'Q', mana: 50, cd: 25, target: 'none', radius: 7 * T, dur: 10, icon: '⚑', color: '#c09050', ai: 'buff',
      desc: 'Allies within 7 tiles attack 40% faster and move 15% faster for 10 seconds.',
    },

    chaos_shape: {
      name: 'Shape of Chaos', key: 'Q', mana: 75, cd: 40, target: 'none', dur: 12, icon: '❖', color: '#c040ff', ai: 'engage',
      desc: 'Dara takes her true shape for 12 seconds: +40% damage, +2 armour, and fast regeneration.',
    },
    borel_lunge: {
      name: "Borel's Lunge", key: 'W', mana: 45, cd: 10, target: 'unit', range: 5 * T, dmg: 140, icon: '➹', color: '#ffa0d0', ai: 'target',
      desc: 'A fencing master\'s lunge. She dashes to the target and deals 140 damage.',
    },
    living_trump: {
      name: 'Living Trump', key: 'Q', mana: 50, cd: 10, target: 'point', range: 14 * T, icon: '✧', color: '#60ff90', ai: 'blink',
      desc: 'Brand wills himself elsewhere and teleports up to 14 tiles.',
    },
    pyrokinesis: {
      name: 'Pyrokinesis', key: 'W', mana: 85, cd: 16, target: 'point', range: 8 * T, radius: 2.5 * T, dur: 6, dps: 48, icon: '🔥', color: '#ff7a20', ai: 'aoePoint',
      desc: 'Sets the ground alight for 6 seconds, dealing 48 damage per second to enemies in it.',
    },
    riposte: {
      name: 'Riposte', key: 'Q', mana: 50, cd: 22, target: 'none', dur: 6, icon: '⚔', color: '#ff5050', ai: 'buff',
      desc: 'For 6 seconds Borel parries 60% of melee damage and returns 40% of it to the attacker.',
    },
    call_hendrake: {
      name: 'Call of Hendrake', key: 'W', mana: 90, cd: 50, target: 'none', dur: 40, icon: '♜', color: '#c03030', ai: 'summon',
      desc: 'Two warriors of House Hendrake answer for 40 seconds.',
    },
    spheres: {
      name: 'Spheres of Sawall', key: 'Q', mana: 65, cd: 10, target: 'unit', range: 8 * T, dmg: 125, icon: '●', color: '#c0c0d0', ai: 'target',
      desc: 'A sorcerous sphere that leaps between up to 4 enemies, dealing 125 damage to each.',
    },
    machinations: {
      name: 'Machinations', key: 'W', mana: 70, cd: 30, target: 'none', radius: 8 * T, dur: 8, icon: '☍', color: '#9090a0', ai: 'aoe',
      desc: 'Doubt and intrigue: enemies within 8 tiles deal 30% less damage for 8 seconds.',
    },
    logrus_blink: {
      name: 'Logrus Step', key: 'Q', mana: 40, cd: 8, target: 'point', range: 7 * T, icon: '↯', color: '#c080ff', ai: 'blink',
      desc: 'Jurt steps through the Logrus up to 7 tiles away. His next attack deals 60% more damage.',
    },
    fury: {
      name: 'Fury', key: 'W', mana: 60, cd: 25, target: 'none', dur: 10, icon: '✸', color: '#ff3030', ai: 'engage',
      desc: 'For 10 seconds Jurt attacks 40% faster and heals for 20% of the damage he deals.',
    },
    tendrils: {
      name: 'Logrus Tendrils', key: 'Q', mana: 70, cd: 16, target: 'point', range: 9 * T, radius: 3 * T, dmg: 50, dur: 3, icon: '❦', color: '#b060ff', ai: 'aoePoint',
      desc: 'Tendrils of the Logrus rise from the ground and hold enemies fast for 3 seconds, dealing 50 damage.',
    },
    logrus_mend: {
      name: 'Mending of the Logrus', key: 'W', mana: 90, cd: 25, target: 'none', radius: 6 * T, heal: 220, icon: '✚', color: '#a0ffa0', ai: 'heal',
      desc: 'Restores 220 health to allies within 6 tiles.',
    },
    ways_recall: {
      name: 'Walk the Ways', key: 'R', mana: 25, cd: 60, target: 'none', channel: 2, icon: '⟁', color: '#c080ff', ai: 'retreat',
      desc: 'After 2 seconds the hero walks the Ways of Chaos back to your seat of power.',
    },
    chaos_wave: {
      name: 'Wave of Chaos', key: 'E', mana: 60, cd: 50, target: 'point', range: 12 * T, radius: 4 * T, dur: 8, powerCost: 60,
      requires: 'wave', shared: true, icon: '≋', color: '#ff40c0', ai: 'aoePoint',
      desc: 'A storm of raw Chaos for 8 seconds. It unmakes all who are not of Chaos and lays the Black Road where it passes. Costs 60 Flux. Needs Wave of Chaos.',
    },
    possess: {
      name: 'Possession', key: 'Q', mana: 100, cd: 5, target: 'unit', range: 6 * T, icon: '☉', color: '#ff80ff', ai: 'possess',
      desc: 'The ty\'iga abandons its form to dwell in an enemy unit (not a hero or a beast of great size), which becomes yours.',
    },
  };

  // Global powers (cast from buildings)
  const powers = {
    unicorn_blessing: {
      name: 'Blessing of the Unicorn', key: 'B', cost: { d: 0, p: 200 }, cd: 150, icon: '♘', color: '#ffffff',
      desc: 'The Unicorn appears. All of your units recover 40% of their health and are cleansed of ill effects.',
    },
    logrus_surge: {
      name: 'Surge of the Logrus', key: 'B', cost: { d: 0, p: 200 }, cd: 150, icon: '♒', color: '#c040ff',
      desc: 'Every one of your units deals 25% more damage and moves 20% faster for 15 seconds.',
    },
  };

  // ---------------------------------------------------------------- UPGRADES
  const upgrades = {
    avalon_steel: { name: 'Avalonian Steel', key: 'U', cost: { d: 150, p: 50 }, time: 45, icon: '⚔', color: '#d0d8e8', effect: { meleeDmg: 0.15 }, desc: 'Melee units and heroes deal 15% more damage.' },
    arden_yew: { name: 'Yew of Arden', key: 'U', cost: { d: 150, p: 50 }, time: 45, icon: '➳', color: '#60a040', effect: { rangedDmg: 0.15, rangedRange: 24 }, desc: 'Ranged units deal 15% more damage and shoot 0.75 tiles farther.' },
    rebman_mail: { name: 'Rebman Mail', key: 'U', cost: { d: 200, p: 100 }, time: 50, icon: '⛨', color: '#40c0c0', effect: { armor: 2 }, desc: 'All units gain +2 armour. Forged in the deeps beneath the sea.' },
    rouge: { name: "Jeweler's Rouge", key: 'U', cost: { d: 150, p: 100 }, time: 45, icon: '✹', color: '#ff6060', effect: { gunDmg: 0.25 }, desc: 'Riflemen and Bombards deal 25% more damage.' },
    jewel: { name: 'Jewel of Judgment', key: 'X', cost: { d: 200, p: 200 }, time: 60, icon: '◆', color: '#ff3048', unlock: 'jewel', desc: 'Your heroes can call down the Storm of the Jewel (E). The Jewel draws on the life force of whoever uses it.' },
    hell_claws: { name: 'Hellforged Claws', key: 'U', cost: { d: 150, p: 50 }, time: 45, icon: '⚔', color: '#ff6040', effect: { meleeDmg: 0.15 }, desc: 'Melee units and heroes deal 15% more damage.' },
    logrus_sight: { name: 'Logrus Sight', key: 'U', cost: { d: 150, p: 50 }, time: 45, icon: '◉', color: '#c080ff', effect: { rangedDmg: 0.15, rangedRange: 24 }, desc: 'Ranged units deal 15% more damage and shoot 0.75 tiles farther.' },
    shifting_hide: { name: 'Shifting Hide', key: 'U', cost: { d: 200, p: 100 }, time: 50, icon: '⛨', color: '#a060c0', effect: { armor: 2 }, desc: 'All units gain +2 armour.' },
    road_spread: { name: 'Hunger of the Road', key: 'U', cost: { d: 150, p: 100 }, time: 45, icon: '❧', color: '#9030c0', effect: { spread: 0.5, roadRegen: 2 }, desc: 'The Black Road spreads 50% farther and faster. Your units regenerate twice as fast on it.' },
    wave: { name: 'Wave of Chaos', key: 'X', cost: { d: 200, p: 200 }, time: 60, icon: '≋', color: '#ff40c0', unlock: 'wave', desc: 'Your heroes can unleash a Wave of Chaos (E).' },
  };

  // Attach ids
  for (const k in units) units[k].id = k, (units[k].kind = 'unit');
  for (const k in heroes) heroes[k].id = k, (heroes[k].kind = 'unit');
  for (const k in buildings) buildings[k].id = k, (buildings[k].kind = 'building');
  for (const k in abilities) abilities[k].id = k;
  for (const k in powers) powers[k].id = k;
  for (const k in upgrades) upgrades[k].id = k;

  AC.UNITS = Object.assign({}, units, heroes);
  AC.HEROES = heroes;
  AC.BUILDINGS = buildings;
  AC.ABILITIES = abilities;
  AC.POWERS = powers;
  AC.UPGRADES = upgrades;
  AC.def = (id) => AC.UNITS[id] || AC.BUILDINGS[id];

  // Build lists for each faction (for workers' build menus)
  AC.BUILD_MENU = {
    amber: ['castle', 'hall_steward', 'barracks', 'lodge', 'shrine', 'armory', 'aerie', 'hall_trumps', 'lighthouse', 'keep'],
    chaos: ['spire', 'hollow', 'obelisk', 'pit', 'hendrake', 'logrus_shrine', 'den', 'roost', 'hall_houses', 'serpent_eye', 'bastion'],
  };
  // Hotkeys for building menu
  AC.BUILD_KEYS = {
    castle: 'C', hall_steward: 'H', barracks: 'B', lodge: 'L', shrine: 'U', armory: 'A', aerie: 'E', hall_trumps: 'T', lighthouse: 'W', keep: 'K',
    spire: 'C', hollow: 'H', obelisk: 'O', pit: 'P', hendrake: 'D', logrus_shrine: 'L', den: 'M', roost: 'R', hall_houses: 'T', serpent_eye: 'E', bastion: 'K',
  };
  AC.TRAIN_KEYS = {
    steward: 'S', thrall: 'S', guard: 'G', lancer: 'K', ranger: 'R', hellhound: 'H', tidecaller: 'T', rifleman: 'R', bombard: 'B', gryphon: 'G',
    demon: 'D', stalker: 'S', crossbow: 'C', hellmaid: 'H', tyiga: 'T', manticore: 'M', spitter: 'S', wyvern: 'W',
    corwin: 'C', benedict: 'B', gerard: 'G', julian: 'J', fiona: 'F', caine: 'A', random: 'R',
    dara: 'D', brand: 'B', borel: 'O', mandor: 'M', jurt: 'J', suhuy: 'S',
  };

  AC.MAX_SUPPLY = 150;
  AC.MAX_HEROES = 3;
  AC.HERO_LEVELS = [0, 220, 560, 1000, 1600, 2400];
})();
