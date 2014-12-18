var cluster = require('cluster');

module.exports = function autoVersionRunner(runner, fetchExpectedVersion, callback) {
    try {
        if (cluster.isMaster) {
            createWorker(fetchExpectedVersion, callback);
        } else {
            fetchExpectedVersion(function(err, version) {
                if (err)
                    return process.send({code: 'runner-failed', err: err});

                try {
                    runner(version, switchVersionIfNeeded(fetchExpectedVersion, version));
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
