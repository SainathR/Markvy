import { describe, expect, it } from 'vitest';
import { t } from './i18n';

describe('i18n', () => {
  it('translates main navigation and falls back to English', () => {
    expect(t('es', 'favorites')).toBe('Favoritos');
    expect(t('de', 'contents')).toBe('Auf dieser Seite');
    expect(t('de', 'favoritesEmpty')).toBe(t('en', 'favoritesEmpty'));
  });

  it('translates the search box and bookmarks', () => {
    expect([t('es', 'search'), t('de', 'searchPh'), t('de', 'bookmarks')]).toEqual(['Buscar', 'Dokumente durchsuchen', 'Lesezeichen']);
    expect(t('es', 'viewLibrary')).toBe('View all in Library');
  });

  it('translates Privacy & Help', () => {
    expect([t('es', 'helpTitle'), t('de', 'helpTitle'), t('en', 'helpTitle')]).toEqual(['Privacidad, seguridad y ayuda', 'Datenschutz, Sicherheit und Hilfe', 'Privacy, security and help']);
  });
});
