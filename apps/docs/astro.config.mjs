import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://portfoliocraft.dev',
  integrations: [
    starlight({
      title: 'PortfolioCraft',
      description: 'Generate a living portfolio from your GitHub activity.',
      social: {
        github: 'https://github.com/AbdullahBakir97/portfoliocraft',
      },
      sidebar: [
        { label: 'Quickstart', link: '/quickstart/' },
        { label: 'Inputs reference', link: '/inputs/' },
        { label: 'Configuration file', link: '/config/' },
        {
          label: 'Audit',
          items: [
            { label: 'Audit mode', link: '/audit/overview/' },
            { label: 'Audit configuration', link: '/audit/configuration/' },
            { label: 'Finding catalog', link: '/audit/catalog/' },
            { label: 'CI recipes', link: '/audit/ci-recipes/' },
          ],
        },
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
