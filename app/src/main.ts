import { mount } from 'svelte';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import '@fontsource/literata/400.css';
import '@fontsource/literata/400-italic.css';
import '@fontsource/literata/600.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/600.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/doc.css';
import './styles/editor.css';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
