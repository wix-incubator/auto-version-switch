module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-exec');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    exec: {
      test: {
        cmd: 'node_modules/.bin/jasmine ' + (grunt.option('spec') || '')
      },
      debugtest: {
        cmd: 'node --debug-brk node_modules/.bin/jasmine ' + (grunt.option('spec') || '')
      },
      debugger: {
        cmd: 'node-inspector'
      }
    }
  });

  grunt.registerTask('default', ['test']);

  grunt.registerTask('test', ['exec:test']);
};
