module.exports = function (grunt) {

  require('load-grunt-tasks')(grunt, {config: require('./package.json')});

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    mochaTest: {
      test: {
        options: {
          reporter: 'spec',
          clearRequireCache: true
        },
        src: ['tests/**/*-spec.js']
      }
    },
    eslint: {
      target: ['index.js', 'lib/**/*.js']
    }
  });

  grunt.registerTask('default', ['test']);
  grunt.registerTask('test', ['lint', 'mochaTest:test']);
  grunt.registerTask('lint', ['eslint']);
};
