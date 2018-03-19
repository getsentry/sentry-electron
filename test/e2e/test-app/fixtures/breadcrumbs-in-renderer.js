if (process.type === 'renderer') {
  console.log('Something insightful!')

  setInterval(() => {
    throw new Error('Error triggered in renderer process');
  }, 1000)
}
