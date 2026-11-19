import type { Lang } from './prefs';

const en = {
  home: 'Home', appearance: 'Appearance', preferences: 'Preferences', toggleSidebar: 'Show or hide the library panel',
  toggleContents: 'Show or hide the contents panel', contents: 'On this page', library: 'Library',
  collections: 'Your folders', documents: 'Documents', filterDocs: 'Filter documents', favorites: 'Favorites',
  favoritesEmpty: 'Select the star on a document to keep it here.', recent: 'Recent', recentEmpty: 'Documents you open appear here.',
  unavailable: 'Unavailable', openFolder: 'Open a folder', openFolderHint: 'Browse a whole wiki or notes folder',
  openFile: 'Open a document', openFileHint: 'Read one file; its folder opens too', sample: 'Explore the sample library',
  sampleHint: 'A small handbook to try everything out', eyebrow: 'Local document reader', welcome: 'Welcome to Markvy',
  welcomeSub: 'Open a document or a folder and read it like a book. Your files stay on your computer.',
  continue: 'Continue where you left off', restore: 'Restore previous session', fresh: 'Start fresh',
  noSession: 'No saved session yet.', recentDocs: 'Recent documents', suggested: 'Suggested to start with',
  noMatches: 'No documents match.', topLevel: 'Top level', loading: 'Loading…', prefsTitle: 'Reading preferences',
  treeFailed: 'This folder couldn’t be read.', retry: 'Try again',
  noDocument: 'No document open', chooseDocument: 'Pick a page in the library panel, or start with one of these:',
  search: 'Search', searchPh: 'Search documents', bookmarks: 'Bookmarks',
  bookmarksEmpty: 'Bookmark a section to come back to it.', viewLibrary: 'View all in Library',
  helpTitle: 'Privacy, security and help',
};
export type Key = keyof typeof en;

const es: Partial<Record<Key, string>> = {
  home: 'Inicio', appearance: 'Apariencia', preferences: 'Preferencias', contents: 'En esta página', library: 'Biblioteca',
  collections: 'Tus carpetas', documents: 'Documentos', filterDocs: 'Filtrar documentos', favorites: 'Favoritos', recent: 'Recientes',
  openFolder: 'Abrir una carpeta', openFile: 'Abrir un documento', sample: 'Explorar la biblioteca de ejemplo',
  welcome: 'Te damos la bienvenida a Markvy',
  welcomeSub: 'Abre un documento o una carpeta y léelo como un libro. Tus archivos se quedan en tu equipo.',
  restore: 'Restaurar la sesión anterior', fresh: 'Empezar de nuevo', prefsTitle: 'Preferencias de lectura',
  search: 'Buscar', searchPh: 'Buscar documentos', bookmarks: 'Marcadores',
  helpTitle: 'Privacidad, seguridad y ayuda',
};

const de: Partial<Record<Key, string>> = {
  home: 'Start', appearance: 'Darstellung', preferences: 'Einstellungen', contents: 'Auf dieser Seite', library: 'Bibliothek',
  collections: 'Ihre Ordner', documents: 'Dokumente', filterDocs: 'Dokumente filtern', favorites: 'Favoriten', recent: 'Zuletzt',
  openFolder: 'Ordner öffnen', openFile: 'Dokument öffnen', sample: 'Beispielbibliothek ansehen', welcome: 'Willkommen bei Markvy',
  welcomeSub: 'Öffnen Sie ein Dokument oder einen Ordner und lesen Sie wie in einem Buch. Ihre Dateien bleiben auf Ihrem Computer.',
  restore: 'Letzte Sitzung wiederherstellen', fresh: 'Neu beginnen', prefsTitle: 'Leseeinstellungen',
  search: 'Suche', searchPh: 'Dokumente durchsuchen', bookmarks: 'Lesezeichen',
  helpTitle: 'Datenschutz, Sicherheit und Hilfe',
};

export const t = (lang: Lang, key: Key): string => (lang === 'es' ? es[key] : lang === 'de' ? de[key] : undefined) ?? en[key];
