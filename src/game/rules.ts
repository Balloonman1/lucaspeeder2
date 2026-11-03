// Gameplay constants carried over from the original Speeder Forager (Luca's rules).
export const MAX_PLAYERS = 10;
export const PLAY_HALF = 260;          // 520 m play square
export const BOT_NAMES = ['Rex', 'Zula', 'Kato', 'Vex', 'Nova', 'Juno', 'Orin', 'Pip', 'Tala', 'Bram', 'Mox', 'Sable'];
export const BIKE_COLORS = ['#3b7bff', '#ff4d6d', '#ffb347', '#7cff8a', '#ff6ad5', '#4df0e0', '#b347ff', '#f5f5f5', '#ff7a1a', '#2a2a30'];
export const TRIMS = ['#4df0e0', '#ff6ad5', '#ffe066', '#7cff8a', '#ffffff', '#ff5a3a', '#4da3ff', '#b347ff'];

export interface VehicleClass { name: string; speed: number; accel: number; turn: number; jump: number; drain: number; armor: number; }
export const BIKES: Record<string, VehicleClass> = {
  scout:  { name: 'Scout',  speed: 28, accel: 34, turn: 2.3,  jump: 14, drain: 1.00, armor: 1.0 },
  blitz:  { name: 'Blitz',  speed: 33, accel: 30, turn: 1.95, jump: 13, drain: 1.10, armor: 1.0 },
  hauler: { name: 'Hauler', speed: 25, accel: 42, turn: 2.1,  jump: 12, drain: 0.90, armor: 0.5 },
  hopper: { name: 'Hopper', speed: 27, accel: 34, turn: 2.7,  jump: 17, drain: 1.00, armor: 1.0 },
};

export interface FoodDef { name: string; energy: number; color: string; }
export const FOODS: Record<string, FoodDef> = {
  rice: { name: 'Rice & beans', energy: 30, color: '#ffe9a8' },
  veg: { name: 'Vegetables', energy: 22, color: '#9dff8a' },
  strawberry: { name: 'Strawberries', energy: 15, color: '#ff7a9a' },
  raspberry: { name: 'Raspberries', energy: 15, color: '#ff5da8' },
  milk: { name: 'Milk', energy: 20, color: '#ffffff' },
  bagel: { name: 'Bagels', energy: 25, color: '#f5c77a' },
  toast: { name: 'Toast', energy: 18, color: '#f0c08a' },
};
export const CANYON_FOODS = ['rice', 'veg', 'strawberry', 'raspberry', 'milk', 'bagel', 'toast'];
export const RULES = {
  foodsPerMatch: 18, drinks: 2, cherries: 1, tomatoes: 4,
  foodRespawn: 3, drinkRespawn: 30, tomatoRespawn: 20, cherryRespawn: 50,
  jumpCost: 2, flipCost: 5, crashCost: 8, closeCallBonus: 3, comboWindow: 5,
  drinkSeconds: 8, jamSeconds: 10, tomatoRange: 45, tomatoSpeed: 46, maxTomatoes: 3, maxClones: 2,
  pickupRadius: 3.0, countdown: 3.6,
};
