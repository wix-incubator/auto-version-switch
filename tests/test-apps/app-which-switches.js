require('../../lib/auto-version-switch')(run, fetchExpectedVersion);

function run(version, switchVersionIfNeeded) {
    var http = require('http');

    var server = http.createServer(function (req, res) {
        switchVersionIfNeeded(function (err) {
            if (err) {
                console.error(err);
                res.writeHead(500);
                res.end("switch callback failed: " + err);
            }

            if (req.url == '/alive') {
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end('alive');
            } else if (req.url == '/version') {
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({version: version}))
            }
            else {
                res.writeHead(404);
                res.end("unknown path")
            }
        });
    });
    server.listen(process.env.PORT);
}

function fetchExpectedVersion(callback) {
    var fs = require('fs');

    fs.readFile(process.env.VERSION_FILE, function (err, content) {
        if (err)
            callback(err);

        callback(null, content.toString())
    });
}
