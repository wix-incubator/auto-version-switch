var cluster = require('cluster');

module.exports = function autoVersionRunner(runner, fetchExpectedVersion, callback) {
    try {
        if (cluster.isMaster) {
            createWorker(fetchExpectedVersion, callback);
        } else {
            fetchExpectedVersion(function(err, version) {
                if (err && callback)
                    return callback({err: err, isMaster: true});

                runner(version, switchVersionIfNeeded(fetchExpectedVersion, version), function (err) {
                    if (callback)
                        if (err)
                            callback({err: err, isMaster: false});
                });
                if (callback)
                    callback();
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
            callback({err: err, isMaster: true});

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
        });

        if (callback)
            callback(null, {isMaster: true});
    });
}

function switchVersionIfNeeded(fetchExpectedVersion, actualVersion) {
    var disconnectSent = false;
    return function switchVersionIfNeededFunc(callback) {
        fetchExpectedVersion(function(err, expectedVersion) {
            if (disconnectSent)
                return callback();

            if (err)
                return callback(err);

            try {
                if (expectedVersion != actualVersion) {
                    process.send({code: 'disconnect'});
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
