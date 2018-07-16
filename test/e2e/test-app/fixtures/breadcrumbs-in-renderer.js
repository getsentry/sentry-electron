if (process.type === 'renderer') {
  console.log('Something insightful!');

  setTimeout(() => {
    throw new Error('Error triggered in renderer process');
  }, 1000);
}
