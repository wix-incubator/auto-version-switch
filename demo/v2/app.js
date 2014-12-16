var http = require('http');

exports.run = function(switchVersionIfNeededFunc, version) {
    http.createServer(function (req, res) {
        switchVersionIfNeededFunc(function (err) {
            if (err)
                console.error(err);
            res.writeHead(200);
            res.end("Hello, world v2")
        });
    }).listen(process.env.PORT || 3000);
}

// optional - ensure app.js runs as a standalone module
if (require.main == module) {
    exports.run(function(callback) {
        process.nextTick(callback);
    });
}
