
if(process.type === 'browser'){
  throw new Error('Error triggered in renderer process');
}