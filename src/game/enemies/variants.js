// Paint schemes for the security robots. Every bug and drone in the room gets one, chosen by its place in the spawn list so a retry looks the same
// as the first run. Only the shell, trim, glow and core change: eyes, lenses and shots keep their warning colours so a threat always reads the same.
export const VARIANTS = [
  { name: 'hazard',  body: 0x2d343b, plate: 0xd9a21b, dark: 0x15171a, glow: 0xffa030, core: 0xffb84a, scale: 1.0 },
  { name: 'crimson', body: 0x6a2d2f, plate: 0xc23a2e, dark: 0x1a1012, glow: 0xff6a4a, core: 0xff7a5a, scale: 1.04 },
  { name: 'cobalt',  body: 0x2c4468, plate: 0x2f6fd0, dark: 0x101620, glow: 0x4aa8ff, core: 0x8ad4ff, scale: 0.97 },
  { name: 'verdant', body: 0x335a3c, plate: 0x4fa84a, dark: 0x101a12, glow: 0x7aff5a, core: 0xb4ff7a, scale: 1.02 },
  { name: 'violet',  body: 0x4e3868, plate: 0x8a4ad0, dark: 0x15101c, glow: 0xc07aff, core: 0xdcaaff, scale: 0.96 },
  { name: 'bone',    body: 0x676c70, plate: 0xd8d6c8, dark: 0x1a1c1d, glow: 0xffc080, core: 0xffd8a0, scale: 1.06 },
];
export const variantFor = (index, type) => VARIANTS[(index * 2 + (type === 'drone' ? 3 : 0) + 1) % VARIANTS.length];
