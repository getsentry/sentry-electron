if (process.type === 'renderer') {
  new Promise((resolve, reject) => {
    throw new Error('Unhanded promise rejection in renderer process');
  })
}
