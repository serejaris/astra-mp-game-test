export const arena = {
  width: 1200,
  height: 750,
  obstacles: [
    { x: 280, y: 175, w: 120, h: 50 },
    { x: 800, y: 175, w: 120, h: 50 },
    { x: 280, y: 525, w: 120, h: 50 },
    { x: 800, y: 525, w: 120, h: 50 },
    { x: 170, y: 320, w: 54, h: 110 },
    { x: 976, y: 320, w: 54, h: 110 },
    { x: 484, y: 300, w: 50, h: 100 },
    { x: 666, y: 350, w: 50, h: 100 }
  ]
};

export const spells = {
  bolt: { cooldown: 400, damage: 28, range: 850, speed: 640 },
  nova: { cooldown: 4200, damage: 44, radius: 159 },
  blink: { cooldown: 3500, range: 152 }
};

export const spawnPoints = [
  { x: 450, y: 248 }, { x: 750, y: 248 },
  { x: 450, y: 502 }, { x: 750, y: 502 },
  { x: 310, y: 375 }, { x: 890, y: 375 },
  { x: 600, y: 145 }, { x: 600, y: 605 }
];
