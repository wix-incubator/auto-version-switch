var cluster = require('cluster');
var debug = require('debug')('debug:auto-version-switch');

module.exports = function autoVersionRunner(runner, fetchExpectedVersion, callback) {

  try {
    if (cluster.isMaster) {
      createWorker(fetchExpectedVersion, callback);
    } else {

      process.on('message', function (msg) {
        workerDebug(cluster.worker, 'received cluster message: [' + msg + ']');
        if (msg === 'shutdown') {
          cluster.worker.disconnect();
          setTimeout(function () {
            cluster.worker.kill();
          }, 1000);
        }
      });

      fetchExpectedVersion(function (err, version) {
        if (err) {
          return process.send({code: 'runner-failed', err: err});
        }

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
    if (err && callback) {
      error(err);
      callback(err);
    }

    var worker = cluster.fork({AUTO_VERSION_SWITCH: version});
    debug('creating worker for version [' + version + ']');
    worker.on('exit', function () {
      workerDebug(worker, 'Bye bye. I\'m done with version [' + version + '], hopefully someone is going to fill in for me.');
    });
    worker.on('message', function (message) {
      workerDebug(worker, 'received cluster message: [' + message.code + ']' +
        (message.err ? ', err:' + message.err + ', stack: ' + message.err.stack : ''));

      if (message.code === 'disconnect') {
        createWorker(fetchExpectedVersion, function (err, nextVersionWorker) {
          if (!err) {
            nextVersionWorker.on('listening', function () {
              workerDebug(nextVersionWorker, 'I\'m now listening. Sending shutdown message to worker [' + worker.id + ']');
              worker.send('shutdown');
            });
          } else {
            console.error('Error:', err);
          }
        });
      }
      else if (message.code == 'runner-failed') {
        error(message.err);
        worker.kill();
        process.exit(1);
      }
    });

    if (callback)
      callback(undefined, worker);
  });
}

function switchVersionIfNeeded(fetchExpectedVersion, actualVersion) {
  var disconnectSent = false;
  return function switchVersionIfNeededFunc(callback) {
    fetchExpectedVersion(function (err, expectedVersion) {
      if (disconnectSent)
        return callback();

      if (err)
        return callback(err);

      try {
        if (expectedVersion != actualVersion) {
          workerDebug(cluster.worker, 'Need to switch version from [' + actualVersion +'] to [' + expectedVersion +']');
          process.send({code: 'disconnect'});

          disconnectSent = true;
        }

      } catch (err) {
        callback(err);
        return;
      }

      callback();
    });
  };
}

function error(err) {
  if (err) {
    var stack = err && err.stack ? err.stack : new Error('[synthetic stack]').stack;
    console.error('ERROR:', err, stack);
  }
}

function workerDebug(worker, message) {
  debug('worker [' + worker.id + '] says:', message);
}
