import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { limpiarRestosDeFirebase } from './lib/limpiezaFirebase'
import './assets/main.css'

limpiarRestosDeFirebase()

const app = createApp(App)
app.use(router)
app.mount('#app')
