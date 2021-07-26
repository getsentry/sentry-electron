
if (process.type === 'browser') {
  throw new Error('Error triggered in main process');
}
