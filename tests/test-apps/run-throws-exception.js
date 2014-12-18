require('../../lib/auto-version-switch')(run, fetchExpectedVersion);

function run() {
    throw new Error("I told you I'd throw");
}

function fetchExpectedVersion(callback) {
    var fs = require('fs');

    fs.readFile(process.env.VERSION_FILE, function (err, content) {
        if (err)
            callback(err);

        callback(null, content.toString())
    });
}
