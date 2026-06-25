import config from '@ants/config/eslint';

export default [
  ...config,
  {
    rules: {
      // Decorators do Nest exigem classes vazias e tipos any pontuais.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
