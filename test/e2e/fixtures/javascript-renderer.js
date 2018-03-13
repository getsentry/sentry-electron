
if(process.type === 'renderer'){
  throw new Error('Error triggered in renderer process');
}