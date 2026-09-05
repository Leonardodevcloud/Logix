module.exports = {
  test: {
    include: ['test/**/*.test.js'],
    environment: 'node',
    env: { LOG_LEVEL: 'silent' },
    testTimeout: 30000,
    hookTimeout: 60000,
    // Integração compartilha o pool do pg: roda em série para não brigar por conexões.
    fileParallelism: false,
  },
};
