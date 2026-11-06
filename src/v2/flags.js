// V2 runs the evolution prototype by default. Add ?legacy to the address to run the inherited game unchanged: it stays working, so the regression tests can keep proving nothing broke.
export const LAB = !/[?&]legacy\b/.test(location.search);
