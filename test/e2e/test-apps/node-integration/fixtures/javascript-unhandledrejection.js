if (process.type === 'renderer') {
  new Promise((_resolve, _reject) => {
    throw new Error('Unhanded promise rejection in renderer process');
  });
}
