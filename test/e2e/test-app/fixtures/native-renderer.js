if (process.type === 'renderer') {
  for (let i = 0; i < 100; i++) {
    console.warn(`Ensure that param limit is exceeded on every platform ${i}`);
  }

  setTimeout(() => {
    process.crash();
  }, 100);
}
