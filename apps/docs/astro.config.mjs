import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://devportfolio.dev',
  integrations: [
    starlight({
      title: 'DevPortfolio',
      description: 'Generate a living portfolio from your GitHub activity.',
      social: {
        github: 'https://github.com/AbdullahBakir97/devportfolio',
      },
      sidebar: [
        { label: 'Quickstart', link: '/quickstart/' },
        { label: 'Inputs reference', link: '/inputs/' },
        { label: 'Configuration file', link: '/config/' },
        { label: 'Examples', link: '/examples/' },
        { label: 'Architecture', link: '/architecture/' },
      ],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ar: { label: 'العربية', lang: 'ar', dir: 'rtl' },
      },
    }),
  ],
});
