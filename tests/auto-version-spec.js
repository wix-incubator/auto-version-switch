var child_process = require('child_process');
var fetch = require('node-fetch');
var Promise = require('Bluebird');
var fs = require('fs');
var os = require('os');
var crypto = require('crypto');
var _ = require('lodash');
var chai = require('chai');
var expect = chai.expect;

Promise.promisifyAll(fs);

describe("auto-version-switch", function () {

  this.timeout(20000);
  this.slow(1000);

  it("switches a version", function () {
    var app;
    return runAppAndWait('./tests/test-apps/app-which-switches', '1.0').
      then(function (runningApp) {
        app = runningApp;
      }).
      then(function () {
        return getAppPage(app, "/version", expectedVersion("1.0"), 0);
      }).
      then(function (version) {
        expect(version).to.be.equal("1.0");

        return switchAppVersion(app, "2.1");
      }).
      then(function () {
        return getAppPage(app, "/version", expectedVersion("2.1"), 2000);
      }).
      then(function (version) {
        expect(version).to.be.equal("2.1");
      });
  });

  // todo: occasionally a request will timeout on the worker running the old version right before the new version worker takes its place - not sure how this can be fixed.
  it("survives a bombardment of requests while switching versions, and (mostly) without http errors", function () {
    var timeoutCount = 0;
    var app;
    var MAGNITUDE_OF_BOMBARDMENTS = 1000; // a relatively high number is required to ensure the second worker actually gets requests

    return runAppAndWait('./tests/test-apps/app-which-switches', '1.0', 'version.txt', 3000).
      then(function (runningApp) {
        app = runningApp;
      })
      .then(function () {
        return switchAppVersion(app, '2.2');
      })
      .then(function () {
        return Promise.all(
          _.range(0, MAGNITUDE_OF_BOMBARDMENTS)
            .map(function () {
              return getAppPage(app, "/version", anyVersion, 5000)
                .catch(function (maybeTimeout) {
                  // This is designed to handle the case of request timeout which happens occasionally when the old version worker
                  // is replaced by the new one...
                  if (timeoutCount === 0 && maybeTimeout.message && maybeTimeout.message.startsWith('network timeout')) {
                    timeoutCount++;
                    return getAppPage(app, "/version", anyVersion, 5000);
                  } else {
                    return Promise.reject(maybeTimeout);
                  }
                });
            })
        );
      })
      .then(function (versions) {
        expect(["1.0", "2.2"]).to.include.members(versions);
        expect(versions.length).to.be.equal(MAGNITUDE_OF_BOMBARDMENTS);
      }, fail())
  });

  it("should run the demo correctly", function () {
    var app;
    return runAppAndWait('./demo/runner.js', 'v1', 'version.txt').
      then(function (runningApp) {
        app = runningApp;

        return getAppPage(app, "/", "Hello, world v1", 2000);
      }).
      then(function (body) {
        expect(body).to.be.equal("Hello, world v1");

        return switchAppVersion(app, "v2");
      }).
      then(function () {
        return getAppPage(app, "/", "Hello, world v2", 2000);
      }).
      then(function (body) {
        return expect(body).to.be.equal("Hello, world v2");
      });
  });

  it("should fail nicely when runner throws an exception", function () {
    return runAppAndWait('./tests/test-apps/run-throws-exception.js', 'v1', undefined, 0).
      then(function (runningApp) {
        return waitForDead(runningApp, 2000)
          .then(function (isKilled) {
            expect(isKilled).to.be.true;
          }, fail());
      });
  });

  it("should fail nicely when first call to fetchExpectedVersion callbacks an error", function () {
    return runAppAndWait('./tests/test-apps/fetchExpectedVersion-throws-exception.js', 'v1', undefined, 0).
      then(function (runningApp) {
        return waitForDead(runningApp, 2000).then(function (isKilled) {
          expect(isKilled).to.be.true;
        }, fail());
      });
  });

});

function fail() {
  return function (err) {
    console.error('TEST ERROR:', err, err && err.stack ? err.stack : '');
    expect(err).to.be.undefined;
  }
}

var APP_PORT = 8765;
var SHOOT_TO_KILL_MARKER = "ZOMBIES_AHOY_SHOOT_TO_KILL";

function runAppAndWait(appModule, firstVersion, versionFile, waitTimeout) {
  var filename = versionFile || os.tmpdir() + '/auto-version-switch-' + crypto.randomBytes(4).readUInt32LE(0);
  fs.writeFileSync(filename, firstVersion);

  return killZombieProcesses().
    then(function () {
      var ret = {
        app: undefined,
        baseUrl: "http://localhost:" + APP_PORT,
        versionFileName: filename,
        hasRecycledApp: false
      };

      function createApp() {
        return child_process.fork(appModule, [SHOOT_TO_KILL_MARKER],
          {
            env: {
              DEBUG: "*",
              PORT: APP_PORT,
              VERSION_FILE: filename
            }
          });
      }

      ret.app = createApp();
      ret.app.on('exit', function () {

        ret.isKilled = true;
      });

      function wait(timeLeft) {
        if (timeLeft <= 0) {
          return Promise.reject(new Error('timeout while waiting for app to live'));
        }

        return fetch("http://localhost:" + APP_PORT + "/alive")
          .then(function (res) {
            if (res.status === 200) {
              console.log('App is alive on port ' + APP_PORT);
            } else {
              throw new Error('alive check got status: ' + res.status);
            }
          })
          .catch(function () {
            return Promise.delay(200).
              then(function () {
                return wait(timeLeft - 200);
              });
          });
      }

      return (waitTimeout === 0 ? Promise.resolve() : wait(waitTimeout || 10000)).then(function () {
        return ret;
      });
    });
}


function killZombieProcesses() {
  return Promise.promisify(child_process.exec)(
    'ps aux | grep ' + SHOOT_TO_KILL_MARKER + ' | grep -v "grep" | awk \'{print $2}\'', {}).
    then(function (res) {
      var pidsToKill = res[0].split('\n').filter(function (pid) {
        return pid.length > 0
      });

      return pidsToKill.length > 0 ?
        Promise.promisify(child_process.exec)('kill -9 ' + pidsToKill.join(' '), {}) :
        Promise.resolve();
    });
}

function expectedVersion(version) {
  return function (body) {
    var actualVersion = JSON.parse(body).version;
    return actualVersion === version ? actualVersion : false;
  }
}

function anyVersion(body) {
  return JSON.parse(body).version;
}

function getAppPage(app, path, expectedBody, timeout) {
  return fetch(app.baseUrl + path, {timeout: 10000})
    .then(function (res) {
      return res.text();
    })
    .then(function (body) {
      var bodyString = body.toString().trim();

      if (_.isFunction(expectedBody) && !expectedBody(body) ||
        !_.isFunction(expectedBody) && bodyString !== expectedBody) {
        if (timeout <= 0)
          return _.isFunction(expectedBody) ? expectedBody(bodyString) : bodyString;
        else
          return Promise.delay(200)
            .then(function () {
              return getAppPage(app, path, expectedBody, timeout - 200);
            });
      }
      else
        return _.isFunction(expectedBody) ? expectedBody(body) : body;
    }
  );
}

function switchAppVersion(app, newVersion) {
  return fs.writeFile(app.versionFileName, newVersion);
}

function waitForDead(app, timeLeft) {
  if (app.isKilled)
    return Promise.resolve(true);
  else if (timeLeft <= 0)
    return Promise.resolve(false);
  else
    return Promise.delay(200).then(function () {
      return waitForDead(app, timeLeft - 200);
    });
}
