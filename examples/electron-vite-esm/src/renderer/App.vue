<script setup>
setTimeout(() => {
  throw new Error('Some renderer error');
}, 500);
</script>

<template>
  <h1>💖 Hello World!</h1>
  <p>Welcome to your Electron application.</p>
</template>
