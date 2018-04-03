if (process.type === 'renderer') {
  setTimeout(() => {
    process.crash();
  }, 100);
}
