import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router/index.js'
import { addCollection } from '@iconify/vue'
import gameIcons from '@iconify-json/game-icons/icons.json'
import lucide from '@iconify-json/lucide/icons.json'

addCollection(gameIcons)
addCollection(lucide)

const app = createApp(App)
app.use(router)
app.mount('#app')
