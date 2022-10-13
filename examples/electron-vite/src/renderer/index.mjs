import { createApp } from 'vue';
import App from './App.vue';
import { init } from '@sentry/electron';
import { init as initVue } from '@sentry/vue';

init(
  {
    debug: true,
  },
  initVue,
);

const app = createApp(App);
app.mount('#app');
