if (process.type === 'browser') {
  setTimeout(() => {
    process.crash();
  }, 500);
}
