var child_process = require('child_process');
var rp = require('request-promise');
var Promise = require('Bluebird');
var fs = require('fs');
var os = require('os');
var crypto = require('crypto');
var _ = require('lodash');

Promise.promisifyAll(fs);

describe("auto-version-switch", function() {

    beforeAll(function() {
        jasmine.addMatchers({
            toBeOneOf: function (util, customEqualityTesters) {
                return {
                    compare: function(collection, setOfValues) {
                        var result = _.every(collection,
                            function(v) {return _.some(setOfValues,
                                function(sov) {return util.equals(v, sov, customEqualityTesters)})});

                        if (result)
                            return {pass: result, message: ""};
                        else
                            return {pass: result, message: "collection " + collection + " contains some values that are not part of " + setOfValues};
                    }
                }
            }
        });
    });

    it("switches a version", function (done) {
        var app;
        runAppAndWait('./tests/test-apps/app-which-switches', '1.0').
            then(function(runningApp) {
                app = runningApp;
            }).
            then(function() {
                return getAppVersion(app, "1.0", 0);
            }).
            then(function(version) {
                expect(version).toBe("1.0");
                return switchAppVersion(app, "2.1");
            }).
            then(function() {
                return getAppVersion(app, "2.1", 2000);
            }).
            then(function(version) {
                expect(version).toBe("2.1");
            }).
            then(done, fail(done));
    });

    it("survives a bombardment of requests when switching, and without any http errors", function(done) {
        var app;
        var MAGNITUDE_OF_BOMBARDMENTS = 50;

        runAppAndWait('./tests/test-apps/app-which-switches', '1.0').
            then(function(runningApp) {
                app = runningApp;
            }).
            then(function() {
                return switchAppVersion(app, "2.2");
            }).
            then(function() {
                return Promise.all(_.range(0, MAGNITUDE_OF_BOMBARDMENTS).map(function () {
                    return getAppVersion(app, undefined, 2000);
                }));
            }).
            then(function(versions) {
                expect(versions).toBeOneOf(["1.0", "2.2"]);
                expect(versions.length).toBe(MAGNITUDE_OF_BOMBARDMENTS);
            }).
            then(done, fail(done));
    });
});

function fail(done) {
    return function(err) {
        console.error(err.stack);
        expect(err).toBe(undefined);
        done();
    }
}

var APP_PORT = 8765;

function runAppAndWait(appModule, firstVersion) {
    var filename = os.tmpdir() + '/auto-version-switch-' + crypto.randomBytes(4).readUInt32LE(0);
    fs.writeFileSync(filename, firstVersion);

    return killZombieProcesses(appModule).then(function () {
        var app = child_process.fork(appModule, {env: {PORT: APP_PORT, VERSION_FILE: filename}});

        function wait(timeLeft) {
            if (timeLeft <= 0)
                return Promise.reject(new Error("waiting for app to live timed out"));

            try {
                return rp("http://localhost:" + APP_PORT + "/alive").
                    catch(function () {
                        return Promise.delay(200).
                            then(function () {
                                return wait(timeLeft - 200);
                            });
                    });
            } catch (err) {
                return wait(timeLeft - 200);
            }
        }

        return wait(10000).then(function () {
            return {app: app, baseUrl: "http://localhost:" + APP_PORT, versionFileName: filename};
        });
    });
}

function killZombieProcesses(appModule) {
    return Promise.promisify(child_process.exec)(
        'ps aux | grep "' + appModule + '" | grep -v "grep" | awk \'{print $2}\'', {}).
        then(function(res) {
            var pidsToKill = res[0].split('\n').filter(function (pid) { return pid.length > 0 });

            return pidsToKill.length > 0 ?
                Promise.promisify(child_process.exec)('kill -9 ' + pidsToKill.join(' '), {}) :
                Promise.resolve();
        });
}

function getAppVersion(app, expectedVersion, timeout) {
    return rp(app.baseUrl + "/version").then(function(body) {
        var version = JSON.parse(body).version;

        if (version !== expectedVersion) {
            if (timeout <= 0)
                return version;
            else
                return Promise.delay(200).then(function() {
                    return getAppVersion(app, expectedVersion, timeout - 200);
                });
        }
        else
            return version;
    });
}

function switchAppVersion(app, newVersion) {
    return fs.writeFile(app.versionFileName, newVersion);
}

