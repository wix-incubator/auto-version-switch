// The require below is slighly modified from the version in the README to enable
// it to load the module that is in this repository. This is the only change.
require('../lib/auto-version-switch')(run, fetchExpectedVersion);

function run(version, switchVersionIfNeededFunc) {
    require('./' + version + '/app.js').run(switchVersionIfNeededFunc);
}

function fetchExpectedVersion(callback) {
    var fs = require('fs');

    fs.readFile('version.txt', function (err, content) {
        if (err)
            callback(err);

        callback(null, content.toString().trim());
    });
}
