var cluster = require('cluster');

module.exports = function autoVersionRunner(runner, fetchExpectedVersion, options, callback) {
    options = options || {};
    try {
        if (cluster.isMaster || !cluster.isWorker && !options.iisNodeMode) {
            createWorker(fetchExpectedVersion, callback);
        } else {
            fetchExpectedVersion(function(err, version) {
                if (err)
                    return process.send({code: 'runner-failed', err: err});

                try {
                    runner(version, switchVersionIfNeeded(fetchExpectedVersion, version, options));
                }
                catch (err) {
                    process.send({code: 'runner-failed', err: err});
                }
            });
        }
    } catch (er) {
        if (callback)
            callback(er);
    }
};

function createWorker(fetchExpectedVersion, callback) {
    fetchExpectedVersion(function (err, version) {
        if (err && callback)
            callback(err);

        var worker = cluster.fork({AUTO_VERSION_SWITCH: version});

        worker.on('exit', function() {
            createWorker(fetchExpectedVersion, undefined);
        });
        worker.on('message', function(message) {
            if (message.code === 'disconnect') {
                createWorker(fetchExpectedVersion, undefined);
                worker.disconnect();
                setTimeout(function() {
                    worker.kill();
                }, 1000);
            }
            else if (message.code == 'runner-failed') {
                worker.kill();
                process.exit(1);
            }
        });

        if (callback)
            callback();
    });
}

function switchVersionIfNeeded(fetchExpectedVersion, actualVersion, options) {
    var disconnectSent = false;
    var net = require('net');
    return function switchVersionIfNeededFunc(callback) {
        fetchExpectedVersion(function(err, expectedVersion) {
            if (disconnectSent)
                return callback();

            if (err)
                return callback(err);

            try {
                if (expectedVersion != actualVersion) {
                    if (!options.iisNodeMode)
                        process.send({code: 'disconnect'});
                    else {
                        var socketToIisNodeSocket = net.connect(process.env.IISNODE_CONTROL_PIPE, function() {
                            socketToIisNodeSocket.write('recycle', function() {
                                socketToIisNodeSocket.end();
                            });
                        })
                    }
                    disconnectSent = true;
                }

            } catch (err) {
                callback(err);
                return;
            }

            callback();
        })
    }
}
